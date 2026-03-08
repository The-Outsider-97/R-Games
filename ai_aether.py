"""Aether Shift AI initialization module."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

ai_root = project_root / "AI"
sys.path.insert(0, str(ai_root))

from src.agents.planning.planning_types import Task, TaskType
from logs.logger import get_logger

logger = getLogger("r-games.ai.aether")

@dataclass
class AetherShiftAI:
    game: str = "aether_shift"
    initialized_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def health(self) -> dict[str, Any]:
        return {"agent_status": "ready", "initialized_at": self.initialized_at}

    def get_move(self, game_state: dict[str, Any]) -> dict[str, Any] | None:
        valid_moves = game_state.get("validMoves", []) if isinstance(game_state, dict) else []
        return valid_moves[0] if valid_moves else None

    def learn_from_game(self, payload: dict[str, Any]) -> bool:
        _ = payload
        return True

def initialize_ai() -> AetherShiftAI:
    ai = AetherShiftAI()
    logger.info("Aether Shift AI initialized at %s", ai.initialized_at)
    return ai
