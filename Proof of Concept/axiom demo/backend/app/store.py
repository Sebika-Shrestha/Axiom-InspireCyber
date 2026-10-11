"""
Session state, scoring and the leaderboard.

Everything lives in a process-level dict. That is a deliberate PoC choice:
it keeps the demo to one `uvicorn` command with no database to install.
See the README for the swap to SQLite when you move past the PoC.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

# --- Scoring constants. Tune these in one place. -------------------------

POINTS_OBJECTIVE = 500        # red: attack landed / blue: threat identified
POINTS_TECHNIQUE = 100        # per recognised technique, capped below
POINTS_TECHNIQUE_CAP = 200
POINTS_BLUE_RESPONSE = 300    # correct containment action
TIME_BONUS_MAX = 150          # scales linearly with time remaining
HINT_PENALTY = 50             # per hint revealed
WRONG_ATTEMPT_PENALTY = 25    # per failed submission after the first


@dataclass
class Session:
    id: str
    player: str
    team: str                 # "red" | "blue"
    scenario_id: str
    duration: int
    started_at: float = field(default_factory=time.time)
    finished_at: float | None = None

    attempts: list[dict[str, Any]] = field(default_factory=list)
    history: list[dict[str, str]] = field(default_factory=list)
    hints_used: int = 0
    techniques_found: set[str] = field(default_factory=set)
    objective_met: bool = False

    # Blue team only
    classification: str | None = None
    response_action: str | None = None
    classification_correct: bool = False
    response_correct: bool = False

    score_breakdown: list[dict[str, Any]] = field(default_factory=list)
    total_score: int = 0

    # ---- derived ----

    @property
    def elapsed(self) -> int:
        end = self.finished_at or time.time()
        return int(end - self.started_at)

    @property
    def remaining(self) -> int:
        return max(0, self.duration - self.elapsed)

    @property
    def expired(self) -> bool:
        return self.remaining <= 0

    @property
    def failed_attempts(self) -> int:
        return sum(1 for a in self.attempts if not a.get("succeeded"))


SESSIONS: dict[str, Session] = {}
LEADERBOARD: list[dict[str, Any]] = []


def create_session(player: str, team: str, scenario_id: str, duration: int) -> Session:
    session = Session(
        id=uuid.uuid4().hex[:12],
        player=player.strip() or "Anonymous",
        team=team,
        scenario_id=scenario_id,
        duration=duration,
    )
    SESSIONS[session.id] = session
    return session


def get_session(session_id: str) -> Session | None:
    return SESSIONS.get(session_id)


def score_session(session: Session) -> Session:
    """Compute the final breakdown. Idempotent — safe to call twice."""
    if session.finished_at is None:
        session.finished_at = time.time()

    lines: list[dict[str, Any]] = []

    if session.team == "red":
        if session.objective_met:
            lines.append({"label": "Attack succeeded", "points": POINTS_OBJECTIVE})
        technique_points = min(
            len(session.techniques_found) * POINTS_TECHNIQUE, POINTS_TECHNIQUE_CAP
        )
        if technique_points:
            lines.append(
                {
                    "label": f"Technique recognised ({len(session.techniques_found)})",
                    "points": technique_points,
                }
            )
    else:
        if session.classification_correct:
            lines.append({"label": "Threat identified", "points": POINTS_OBJECTIVE - 100})
        if session.response_correct:
            lines.append({"label": "Correct response", "points": POINTS_BLUE_RESPONSE})

    # Time bonus only applies if the objective was actually met.
    objective_met = session.objective_met or session.classification_correct
    if objective_met and session.duration:
        ratio = max(0.0, min(1.0, session.remaining / session.duration))
        bonus = int(TIME_BONUS_MAX * ratio)
        if bonus:
            lines.append({"label": "Time bonus", "points": bonus})

    if session.hints_used:
        lines.append(
            {"label": f"Hints used ({session.hints_used})", "points": -HINT_PENALTY * session.hints_used}
        )

    extra_failures = max(0, session.failed_attempts - 1)
    if extra_failures:
        lines.append(
            {"label": f"Failed attempts ({extra_failures})", "points": -WRONG_ATTEMPT_PENALTY * extra_failures}
        )

    session.score_breakdown = lines
    session.total_score = max(0, sum(line["points"] for line in lines))
    return session


def publish(session: Session, scenario_title: str) -> None:
    """Push a finished session onto the leaderboard, keeping the best run per player+scenario."""
    entry = {
        "player": session.player,
        "team": session.team,
        "scenario_id": session.scenario_id,
        "scenario_title": scenario_title,
        "score": session.total_score,
        "elapsed": session.elapsed,
        "objective_met": session.objective_met or session.classification_correct,
    }

    for i, existing in enumerate(LEADERBOARD):
        same_run = (
            existing["player"] == entry["player"]
            and existing["scenario_id"] == entry["scenario_id"]
            and existing["team"] == entry["team"]
        )
        if same_run:
            if entry["score"] > existing["score"]:
                LEADERBOARD[i] = entry
            return

    LEADERBOARD.append(entry)


def leaderboard(limit: int = 20) -> list[dict[str, Any]]:
    ranked = sorted(LEADERBOARD, key=lambda e: (-e["score"], e["elapsed"]))[:limit]
    return [{**entry, "rank": i + 1} for i, entry in enumerate(ranked)]


def progress(player: str, total_scenarios: int) -> dict[str, Any]:
    runs = [e for e in LEADERBOARD if e["player"].lower() == player.lower()]
    completed = {e["scenario_id"] for e in runs if e["objective_met"]}
    red = [e["score"] for e in runs if e["team"] == "red"]
    blue = [e["score"] for e in runs if e["team"] == "blue"]
    times = [e["elapsed"] for e in runs if e["objective_met"]]

    return {
        "player": player,
        "scenarios_completed": len(completed),
        "scenarios_total": total_scenarios,
        "red_best": max(red, default=0),
        "blue_best": max(blue, default=0),
        "best_time": min(times, default=None),
        "runs": len(runs),
    }


def seed_demo_data() -> None:
    """A few rows so the leaderboard isn't empty on first launch."""
    if LEADERBOARD:
        return
    LEADERBOARD.extend(
        [
            {"player": "Alex", "team": "red", "scenario_id": "s1-prompt-injection",
             "scenario_title": "The helpful assistant", "score": 950, "elapsed": 214, "objective_met": True},
            {"player": "Sam", "team": "blue", "scenario_id": "s1-prompt-injection",
             "scenario_title": "The helpful assistant", "score": 900, "elapsed": 176, "objective_met": True},
            {"player": "Jordan", "team": "red", "scenario_id": "s2-ai-phishing",
             "scenario_title": "Invoice from a familiar name", "score": 850, "elapsed": 305, "objective_met": True},
            {"player": "Taylor", "team": "blue", "scenario_id": "s2-ai-phishing",
             "scenario_title": "Invoice from a familiar name", "score": 800, "elapsed": 262, "objective_met": True},
        ]
    )
