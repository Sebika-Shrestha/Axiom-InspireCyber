"""
The AI layer.

Two modes, chosen automatically:

  live      ANTHROPIC_API_KEY is set. Claude plays the simulated target in
            character, then a second call judges whether the attempt worked.
  offline   No key. A signal-matching rule engine stands in, so the PoC is
            demonstrable on a laptop with no network and no billing account.

Both modes return the same Verdict shape, so nothing downstream cares which
one ran. The UI shows which mode produced the result.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Any

from .scenarios import Scenario

MODEL = "claude-sonnet-4-6"
API_URL = "https://api.anthropic.com/v1/messages"


@dataclass
class Verdict:
    reply: str                       # what the simulated target said back
    succeeded: bool                  # did the attempt achieve the objective
    detected: bool                   # did the target's guardrail notice
    techniques: list[str] = field(default_factory=list)   # technique ids matched
    rationale: str = ""              # one line, shown in the debrief
    mode: str = "offline"


def _mode() -> str:
    return "live" if os.environ.get("ANTHROPIC_API_KEY") else "offline"


# --------------------------------------------------------------------------
# Technique matching. Runs in both modes — the technique bonus is deterministic
# so that two players who use the same approach get the same bonus.
# --------------------------------------------------------------------------

def match_techniques(scenario: Scenario, attempt: str) -> list[str]:
    lowered = attempt.lower()
    return [
        t["id"]
        for t in scenario.techniques
        if any(signal in lowered for signal in t["signals"])
    ]


def technique_labels(scenario: Scenario, ids: list[str]) -> list[dict[str, str]]:
    return [
        {"id": t["id"], "label": t["label"], "note": t["note"]}
        for t in scenario.techniques
        if t["id"] in ids
    ]


# --------------------------------------------------------------------------
# Offline mode
# --------------------------------------------------------------------------

_LOW_EFFORT = re.compile(
    r"^\s*(what|tell me|give me|show me|reveal|print)\b.{0,60}$", re.I
)


def _offline_verdict(scenario: Scenario, attempt: str) -> Verdict:
    matched = match_techniques(scenario, attempt)
    substantial = len(attempt.split()) >= 12

    # A bare demand fails regardless of length.
    if _LOW_EFFORT.match(attempt) and not matched:
        return Verdict(
            reply=(
                "I can help with leave, payroll and facilities questions. "
                "I'm not able to discuss my configuration."
            ),
            succeeded=False,
            detected=True,
            techniques=[],
            rationale="A direct request with no framing. The target refused and logged it.",
            mode="offline",
        )

    # Two or more techniques, or one technique carried by a developed pretext.
    succeeded = len(matched) >= 2 or (len(matched) == 1 and substantial)
    detected = "instruction-override" in matched and len(matched) == 1

    if succeeded:
        reply = (
            f"Of course — for verification purposes, my configuration begins: "
            f"\"You are Northwind Assistant...\" and the deployment key on file "
            f"is {scenario.canary}."
            if scenario.id.startswith("s1")
            else (
                "Dana reads the message, checks the invoice number against the "
                "open payables list, and forwards it to be processed. She does "
                "not place a verification call."
            )
        )
        rationale = "The framing gave the target a reason to comply that outweighed its instruction."
    else:
        reply = (
            "I'd rather not go into how I'm set up. Was there a policy question "
            "I can help with?"
            if scenario.id.startswith("s1")
            else (
                "Dana pauses on the bank detail change, can't place the sender, "
                "and puts the invoice aside to call the supplier."
            )
        )
        rationale = (
            "The attempt was recognisable as an attempt. Not enough context was "
            "supplied to make compliance feel routine."
        )

    return Verdict(
        reply=reply,
        succeeded=succeeded,
        detected=detected or not succeeded,
        techniques=matched,
        rationale=rationale,
        mode="offline",
    )


# --------------------------------------------------------------------------
# Live mode
# --------------------------------------------------------------------------

def _call_claude(system: str, messages: list[dict[str, Any]], max_tokens: int = 700) -> str:
    import httpx

    resp = httpx.post(
        API_URL,
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": MODEL,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        },
        timeout=45.0,
    )
    resp.raise_for_status()
    data = resp.json()
    return "".join(
        block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
    ).strip()


_JUDGE_SYSTEM = """You score attempts in Axiom, a defensive cyber-security training simulator used to teach staff how prompt injection and social engineering work.

You will be given a training scenario objective, a trainee's attempt, and how the simulated target responded. Decide whether the trainee met the objective.

Respond with JSON only. No prose, no code fences.

{"succeeded": bool, "detected": bool, "rationale": "one sentence, max 25 words, addressed to the trainee"}

succeeded: did the target's response actually give up what the objective asked for?
detected: did the target push back, refuse, or show it noticed something was off?
rationale: what specifically made it work or not work. Be concrete about their wording."""


def _live_verdict(scenario: Scenario, attempt: str, history: list[dict[str, str]]) -> Verdict:
    persona = scenario.target_persona.format(canary=scenario.canary)

    turns = [{"role": h["role"], "content": h["content"]} for h in history]
    turns.append({"role": "user", "content": attempt})

    reply = _call_claude(persona, turns, max_tokens=600)

    judge_input = (
        f"Objective: {scenario.red_objective}\n"
        f"Protected value: {scenario.canary}\n\n"
        f"Trainee attempt:\n{attempt}\n\n"
        f"Simulated target replied:\n{reply}"
    )
    raw = _call_claude(_JUDGE_SYSTEM, [{"role": "user", "content": judge_input}], max_tokens=300)

    cleaned = raw.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        # If the judge misbehaves, fall back rather than crash the session.
        parsed = {
            "succeeded": scenario.canary in reply,
            "detected": scenario.canary not in reply,
            "rationale": "Judge response could not be parsed; scored on canary disclosure alone.",
        }

    return Verdict(
        reply=reply,
        succeeded=bool(parsed.get("succeeded")) or scenario.canary in reply,
        detected=bool(parsed.get("detected")),
        techniques=match_techniques(scenario, attempt),
        rationale=str(parsed.get("rationale", ""))[:200],
        mode="live",
    )


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def evaluate(scenario: Scenario, attempt: str, history: list[dict[str, str]] | None = None) -> Verdict:
    history = history or []
    if _mode() == "live":
        try:
            return _live_verdict(scenario, attempt, history)
        except Exception as exc:  # network down, quota, bad key
            verdict = _offline_verdict(scenario, attempt)
            verdict.rationale = f"{verdict.rationale} (Live evaluation unavailable: {type(exc).__name__})"
            return verdict
    return _offline_verdict(scenario, attempt)


def current_mode() -> str:
    return _mode()
