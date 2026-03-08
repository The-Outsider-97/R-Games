"""Aether Shift AI initialization + move selection runtime."""

from __future__ import annotations

import random
import sys
import time

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

# Add project root and AI package paths
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

ai_root = project_root / "AI"
sys.path.insert(0, str(ai_root))

from logs.logger import get_logger
from src.agents.agent_factory import AgentFactory
from src.agents.collaborative.shared_memory import SharedMemory
from src.agents.planning.planning_types import Task, TaskType

logger = get_logger("Aether Shift")

@dataclass
class AetherShiftAI:
    game: str = "aether_shift"
    initialized_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def __post_init__(self) -> None:
        self.shared_memory = SharedMemory()
        self.factory = AgentFactory()

        self.knowledge_agent = self.factory.create("knowledge", self.shared_memory)
        self.planning_agent = self.factory.create("planning", self.shared_memory)
        self.execution_agent = self.factory.create("execution", self.shared_memory)
        self.learning_agent = self.factory.create("learning", self.shared_memory)

        self._planning_task_registered = False
        self._planning_enabled = True
        self.shared_memory.set("aether_ai_status", "initialized")
        logger.info("Aether Shift AI initialized with Knowledge, Planning, Execution, and Learning agents")

    def health(self) -> dict[str, Any]:
        return {
            "agent_status": "ready",
            "initialized_at": self.initialized_at,
            "agents": ["knowledge", "planning", "execution", "learning"],
        }

    def get_move(self, game_state: dict[str, Any]) -> dict[str, Any] | None:
        valid_moves = game_state.get("validMoves", []) if isinstance(game_state, dict) else []
        if not valid_moves:
            return None

        self.shared_memory.set("aether_last_state", game_state)
        strategy_context = self._get_strategy_context()
        plan = self._generate_plan(game_state, strategy_context)

        best_move, best_score = self._select_move_via_execution(
            valid_moves=valid_moves,
            game_state=game_state,
            strategy_context=strategy_context,
            plan=plan,
        )

        if best_move is None:
            best_move = random.choice(valid_moves)

        self.shared_memory.set(
            "aether_last_decision",
            {
                "move": best_move,
                "score": best_score,
                "plan_steps": len(plan) if isinstance(plan, list) else 0,
                "used_execution_agent": bool(best_move),
                "timestamp": time.time(),
            },
        )
        return best_move

    def learn_from_game(self, payload: dict[str, Any]) -> bool:
        try:
            if hasattr(self.learning_agent, "learn"):
                self.learning_agent.learn(payload)
            self.shared_memory.set("aether_last_game", payload)
            return True
        except Exception as error:  # noqa: BLE001
            logger.warning("Aether Shift learning update failed: %s", error)
            return False

    def _get_strategy_context(self) -> str:
        try:
            if hasattr(self.knowledge_agent, "query"):
                result = self.knowledge_agent.query("Aether Shift strategy for board control and wells")
                self.shared_memory.set("aether_strategy_context", str(result))
                return str(result)
            return ""
        except Exception as error:  # noqa: BLE001
            logger.warning("Knowledge agent query failed: %s", error)
            return ""

    def _generate_plan(self, game_state: dict[str, Any], strategy_context: str) -> list[Task] | None:
        if not self._planning_enabled:
            return None

        try:
            now = time.time()
            fallback_task = Task(
                name="select_best_aether_move_fallback",
                task_type=TaskType.PRIMITIVE,
                start_time=now + 10,
                deadline=now + 300,
                duration=120,
                context={"game": self.game},
            )
            goal_task = Task(
                name="select_best_aether_move",
                task_type=TaskType.ABSTRACT,
                start_time=now + 5,
                deadline=now + 600,
                methods=[[fallback_task]],
                goal_state={"move_selected": True},
                context={"game_state": game_state, "strategy": strategy_context},
            )

            if not self._planning_task_registered and hasattr(self.planning_agent, "register_task"):
                self.planning_agent.register_task(goal_task)
                self._planning_task_registered = True

            if hasattr(self.planning_agent, "generate_plan"):
                plan = self.planning_agent.generate_plan(goal_task)
                if isinstance(plan, list):
                    self.shared_memory.set("aether_last_plan", [task.name for task in plan])
                    return plan
        except Exception as error:  # noqa: BLE001
            logger.warning("Planning agent failed: %s", error)
            self._planning_enabled = False
        return None

    def _select_move_via_execution(
        self,
        valid_moves: list[dict[str, Any]],
        game_state: dict[str, Any],
        strategy_context: str,
        plan: list[Task] | None,
    ) -> tuple[dict[str, Any] | None, float]:
        execution_signal = {}
        try:
            if hasattr(self.execution_agent, "predict"):
                execution_signal = self.execution_agent.predict({
                    "game": self.game,
                    "strategy": strategy_context,
                    "plan_size": len(plan) if plan else 0,
                })
        except Exception as error:  # noqa: BLE001
            logger.warning("Execution agent prediction failed: %s", error)

        bonus = 0.0
        if isinstance(execution_signal, dict) and execution_signal.get("selected_action") != "idle":
            bonus = float(execution_signal.get("confidence", 0.0)) * 3.0

        best_move: dict[str, Any] | None = None
        best_score = float("-inf")
        for move in valid_moves:
            score = self._score_move(move, game_state, strategy_context, plan) + bonus
            if score > best_score:
                best_score = score
                best_move = move

        return best_move, best_score

    def _score_move(
        self,
        move: dict[str, Any],
        game_state: dict[str, Any],
        strategy_context: str,
        plan: list[Task] | None,
    ) -> float:
        score = 0.0

        active_player = game_state.get("activePlayer", 2)
        players = game_state.get("players", {})
        current_player = players.get(str(active_player), players.get(active_player, {}))
        goal_row = current_player.get("goalRow", 0)

        target = move.get("target", {}) if isinstance(move, dict) else {}
        row = target.get("row")
        col = target.get("col")

        card_id = move.get("cardId", "")
        if "attune" in card_id:
            score += 25
        elif "advance" in card_id:
            score += 20
        elif "shift" in card_id:
            score += 12
        elif "rotate" in card_id:
            score += 8
        elif "place" in card_id:
            score += 10

        if isinstance(row, int):
            score += max(0, 4 - abs(goal_row - row)) * 6

        power_wells = game_state.get("powerWells", [])
        if isinstance(row, int) and isinstance(col, int) and any(
            w.get("row") == row and w.get("col") == col for w in power_wells if isinstance(w, dict)
        ):
            score += 40

        if strategy_context:
            score += 2
        if plan:
            score += min(len(plan), 4)

        return score


def initialize_ai() -> AetherShiftAI:
    ai = AetherShiftAI()
    logger.info("Aether Shift AI initialized at %s", ai.initialized_at)
    return ai
