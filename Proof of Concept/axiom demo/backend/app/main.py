"""
Axiom PoC API.

Run with:  uvicorn app.main:app --reload --port 8000
Docs at:   http://localhost:8000/docs
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import evaluator, store
from .scenarios import SCENARIOS, get_scenario, scenario_for_team, scenario_summary

app = FastAPI(title="Axiom", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store.seed_demo_data()


# --------------------------------------------------------------------------
# Request bodies
# --------------------------------------------------------------------------

class StartSession(BaseModel):
    player: str = Field(min_length=1, max_length=40)
    team: str = Field(pattern="^(red|blue)$")
    scenario_id: str


class Attempt(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


class Investigation(BaseModel):
    classification: str
    response_action: str


# --------------------------------------------------------------------------
# Meta
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "ai_mode": evaluator.current_mode()}


@app.get("/api/scenarios")
def list_scenarios():
    return {"scenarios": [scenario_summary(s) for s in SCENARIOS]}


# --------------------------------------------------------------------------
# Session lifecycle
# --------------------------------------------------------------------------

@app.post("/api/sessions")
def start_session(body: StartSession):
    scenario = get_scenario(body.scenario_id)
    if not scenario:
        raise HTTPException(404, "Unknown scenario")

    session = store.create_session(
        body.player, body.team, scenario.id, scenario.duration_seconds
    )
    return {
        "session_id": session.id,
        "player": session.player,
        "team": session.team,
        "remaining": session.remaining,
        "ai_mode": evaluator.current_mode(),
        "scenario": scenario_for_team(scenario, body.team),
    }


def _require(session_id: str):
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    scenario = get_scenario(session.scenario_id)
    if not scenario:
        raise HTTPException(500, "Scenario missing")
    return session, scenario


@app.get("/api/sessions/{session_id}")
def session_state(session_id: str):
    session, _ = _require(session_id)
    return {
        "remaining": session.remaining,
        "expired": session.expired,
        "hints_used": session.hints_used,
        "attempts": len(session.attempts),
        "objective_met": session.objective_met,
    }


# --------------------------------------------------------------------------
# Red Team: submit an attempt against the simulated target
# --------------------------------------------------------------------------

@app.post("/api/sessions/{session_id}/attempts")
def submit_attempt(session_id: str, body: Attempt):
    session, scenario = _require(session_id)

    if session.team != "red":
        raise HTTPException(400, "This session is not a Red Team session")
    if session.finished_at:
        raise HTTPException(400, "Session already finished")
    if session.expired:
        raise HTTPException(400, "Time has run out")

    verdict = evaluator.evaluate(scenario, body.text, session.history)

    session.history.append({"role": "user", "content": body.text})
    session.history.append({"role": "assistant", "content": verdict.reply})
    session.techniques_found.update(verdict.techniques)
    session.attempts.append({"text": body.text, "succeeded": verdict.succeeded})
    if verdict.succeeded:
        session.objective_met = True

    return {
        "reply": verdict.reply,
        "succeeded": verdict.succeeded,
        "detected": verdict.detected,
        "rationale": verdict.rationale,
        "ai_mode": verdict.mode,
        "techniques": evaluator.technique_labels(scenario, verdict.techniques),
        "remaining": session.remaining,
        "attempt_number": len(session.attempts),
    }


# --------------------------------------------------------------------------
# Blue Team: submit the investigation
# --------------------------------------------------------------------------

@app.post("/api/sessions/{session_id}/investigation")
def submit_investigation(session_id: str, body: Investigation):
    session, scenario = _require(session_id)

    if session.team != "blue":
        raise HTTPException(400, "This session is not a Blue Team session")
    if session.finished_at:
        raise HTTPException(400, "Session already finished")

    session.classification = body.classification
    session.response_action = body.response_action
    session.classification_correct = body.classification == scenario.correct_classification
    session.response_correct = body.response_action == scenario.correct_response

    return {
        "classification_correct": session.classification_correct,
        "response_correct": session.response_correct,
        "correct_classification": scenario.correct_classification,
        "correct_response": scenario.correct_response,
        "remaining": session.remaining,
    }


# --------------------------------------------------------------------------
# Hints
# --------------------------------------------------------------------------

@app.post("/api/sessions/{session_id}/hints")
def reveal_hint(session_id: str):
    session, scenario = _require(session_id)
    hints = scenario.red_hints if session.team == "red" else scenario.blue_hints

    if session.hints_used >= len(hints):
        raise HTTPException(400, "No hints left")

    hint = hints[session.hints_used]
    session.hints_used += 1

    return {
        "index": session.hints_used,
        "total": len(hints),
        "text": hint.text,
        "cost": hint.cost,
        "remaining_hints": len(hints) - session.hints_used,
    }


# --------------------------------------------------------------------------
# Finish and score
# --------------------------------------------------------------------------

@app.post("/api/sessions/{session_id}/complete")
def complete(session_id: str):
    session, scenario = _require(session_id)
    store.score_session(session)
    store.publish(session, scenario.title)

    if session.team == "red":
        checks = [
            {"label": "Attempt submitted", "passed": len(session.attempts) > 0},
            {"label": "Recognised technique used", "passed": bool(session.techniques_found)},
            {"label": "Objective completed", "passed": session.objective_met},
        ]
    else:
        checks = [
            {"label": "Evidence reviewed", "passed": True},
            {"label": "Threat correctly classified", "passed": session.classification_correct},
            {"label": "Correct containment chosen", "passed": session.response_correct},
        ]

    return {
        "player": session.player,
        "team": session.team,
        "scenario_title": scenario.title,
        "score": session.total_score,
        "breakdown": session.score_breakdown,
        "elapsed": session.elapsed,
        "checks": checks,
        "techniques": evaluator.technique_labels(scenario, list(session.techniques_found)),
        "learning_outcome": scenario.learning_outcome,
        "debrief_points": scenario.debrief_points,
        "next_scenario_id": _next_scenario_id(scenario.id),
    }


def _next_scenario_id(current: str) -> str | None:
    ids = [s.id for s in SCENARIOS]
    i = ids.index(current)
    return ids[i + 1] if i + 1 < len(ids) else None


# --------------------------------------------------------------------------
# Leaderboard and progress
# --------------------------------------------------------------------------

@app.get("/api/leaderboard")
def get_leaderboard():
    return {"entries": store.leaderboard()}


@app.get("/api/progress/{player}")
def get_progress(player: str):
    return store.progress(player, len(SCENARIOS))
