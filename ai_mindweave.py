"""Mindweave AI initialization module."""

# ai_mindaweave.py integrates Collaborative (1), Knowledge (2), Planning (3), Evaluation (4), Language (5), Reasoning (6), and Safety(7) agents
# 1. Register specialist agents in the Collaboration Manager / task router.
#    Route by task_type (cognitive_puzzle, npc_dialogue, stress_event, debrief_reflection, safety_audit).
# 2. Store faction relations, dialogue outcomes, and player behavior signatures in knowledge memory/cache.
#    Use ontology manager to keep narrative entities and constraints coherent.
# 3. Use planning memory + probabilistic planner for quest-state transitions.
#    Feed real-time game telemetry (success rate, latency, retries) to planning heuristics.
# 4. Evaluation agent tracks quality, drift, and regressions over time.
# 5. Use NLU for intent/emotion parsing and NLG for contextual NPC responses.
#    Add rubric-based scoring (validation, perspective-taking, de-escalation, repair attempts).
# 6. Use rule/probabilistic reasoning modules to generate and validate procedural logic gate puzzles.
#    Attach solver traces so post-level debrief can explain why an answer path worked.
# 7. Safety checks on every high-impact interaction.
#
# This set gives immediate coverage for adaptive cognitive challenges + LLM NPC interaction + risk controls, without waiting on full multimodal hardware dependencies.
#
#
# AI agents to Mindweave mechanics
# -  Supply Chain Puzzles: Planning + Reasoning + Knowledge.
# -  Procedural Logic Gates: Reasoning + Learning (not yet).
# -  Micro-Expression Interrogations: Perception (not yet) + Language + Safety.
# -  Empathy Bridge: Language + Knowledge + Alignment (not yet).
# -  Biometric Regulation: Perception (not yet) + Execution (not yet) + Safety.
# -  Metacognitive Debriefing: Language + Knowledge + Evaluation.
# 
# 
# Practical integration contract (event schema)
# Define a common event envelope all agents can consume:
# - `session_id`
# - `player_id`
# - `task_type`
# - `game_state_snapshot`
# - `telemetry` (reaction time, retries, confidence, HRV if present)
# - `safety_context`
# - `requested_action`
# 
# This lets CollaborativeAgent route consistently and allows Safety/Evaluation to run as universal middleware.

from __future__ import annotations

import sys, os
import json
import math
import threading

from http.server import BaseHTTPRequestHandler, HTTPServer
from dataclasses import dataclass, field
from urllib.parse import urlparse
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

# Add project root to sys.path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

# Add AI folder to sys.path so 'src' and 'logs' can be imported as top-level packages
ai_root = project_root / "AI"
sys.path.insert(0, str(ai_root))

try:
    from src.agents.agent_factory import AgentFactory
    from src.agents.collaborative_agent import CollaborativeAgent
    from src.agents.collaborative.shared_memory import SharedMemory
    from src.agents.planning.planning_types import Task, TaskType
    from logs.logger import get_logger
except ImportError as e:
    print(f"Error importing modules: {e}")
    raise

logger = get_logger("Project: Mindweave")

class AgentAdapter:
    """Normalizes heterogeneous agent APIs to a single execute(task_data) contract."""

    def __init__(
        self,
        name: str,
        agent: Any,
        handlers: list[Callable[[dict[str, Any]], Any]],
        capabilities: list[str] | None = None,
    ):
        self.name = name
        self.agent = agent
        self.handlers = handlers
        # Collaboration registry validates capabilities on the *instance* itself.
        # Keep this attribute explicit so adapter-based registrations remain valid.
        self.capabilities = list(capabilities or [])

    def execute(self, task_data: dict[str, Any]) -> dict[str, Any]:
        for handler in self.handlers:
            try:
                output = handler(task_data)
                return {"agent": self.name, "result": output}
            except Exception as exc:
                logger.debug("%s handler failed: %s", self.name, exc)

        raise RuntimeError(f"No compatible execution path found for {self.name}")

@dataclass
class MindweaveAI:
    game: str = "mindweave"
    initialized_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def __post_init__(self) -> None:
        self.shared_memory = SharedMemory()
        self.factory = AgentFactory()
        self.collab = CollaborativeAgent(shared_memory=self.shared_memory, agent_factory=self.factory)

        self.knowledge_agent = self.factory.create("knowledge", self.shared_memory)
        self.planning_agent = self.factory.create("planning", self.shared_memory)
        self.safety_agent = self.factory.create("safety", self.shared_memory)
        self.language_agent = self.factory.create("language", self.shared_memory)
        self.reasoning_agent = self.factory.create("reasoning", self.shared_memory)
        self.evaluation_agent = self.factory.create("evaluation", self.shared_memory)

        self._register_task_routes()
        self._planning_task_registered = False
        self._planning_enabled = True
        self.match_log_path = project_root / 'AI' / 'logs' / 'mindweave.jsonl'
        self.shared_memory.set("mindweave_ai_status", "initialized")
        logger.info("Project: Mindweave AI initialized with Knowledge, Planning, Evaluation, Language, and Safety agents")

    def _register_task_routes(self) -> None:
        manager = self.collab.collaboration_manager
        if manager is None:
            logger.warning("Collaboration manager unavailable. Falling back to local handlers.")
            return

        routes = {
            "cognitive_puzzle": (self.reasoning_agent, [self._execute_reasoning, self._execute_planning]),
            "npc_dialogue": (self.language_agent, [self._execute_language]),
            "stress_event": (self.safety_agent, [self._execute_safety]),
            "debrief_reflection": (self.evaluation_agent, [self._execute_evaluation, self._execute_language]),
            "safety_audit": (self.safety_agent, [self._execute_safety]),
        }

        for task_type, (agent, handlers) in routes.items():
            adapter_name = f"mindweave_{task_type}"
            adapter = AgentAdapter(
                name=adapter_name,
                agent=agent,
                handlers=handlers,
                capabilities=[task_type],
            )
            manager.register_agent(adapter_name, adapter, capabilities=[task_type])

        logger.info("Mindweave collaboration routes registered for %d task types", len(routes))

    def _build_event_envelope(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = datetime.utcnow().isoformat()
        return {
            "session_id": payload.get("session_id", "local-session"),
            "player_id": payload.get("player_id", "player-unknown"),
            "task_type": payload.get("task_type", "cognitive_puzzle"),
            "game_state_snapshot": payload.get("game_state_snapshot", payload.get("game_state", {})),
            "telemetry": payload.get("telemetry", {}),
            "safety_context": payload.get("safety_context", {}),
            "requested_action": payload.get("requested_action", "analyze"),
            "timestamp": now,
        }

    def _route_event(self, event: dict[str, Any]) -> dict[str, Any]:
        task_type = event["task_type"]
        manager = self.collab.collaboration_manager
        if manager is None:
            return {"status": "fallback", "task_type": task_type}

        try:
            result = manager.run_task(task_type, event, retries=1)
            return {"status": "routed", "task_type": task_type, "result": result}
        except Exception as exc:  # noqa: BLE001
            logger.warning("Route failed for task_type=%s: %s", task_type, exc)
            return {"status": "route_error", "task_type": task_type, "error": str(exc)}

    def _execute_knowledge(self, event: dict[str, Any]) -> Any:
        context = event.get("requested_action", "mindweave")
        query_fn = getattr(self.knowledge_agent, "query", None)
        if callable(query_fn):
            return query_fn(context)
        return {"note": "knowledge agent query unavailable"}

    def _execute_planning(self, event: dict[str, Any]) -> Any:
        if not self._planning_enabled:
            return {"note": "planning disabled"}

        fallback_task = Task(
            name="mindweave_route_fallback",
            task_type=TaskType.PRIMITIVE,
            start_time=10,
            deadline=120,
            duration=10,
        )
        goal_task = Task(
            name=f"mindweave_{event.get('task_type', 'task')}",
            task_type=TaskType.ABSTRACT,
            methods=[[fallback_task]],
            goal_state={"resolved": True},
            context=event,
        )

        if not self._planning_task_registered and hasattr(self.planning_agent, "register_task"):
            self.planning_agent.register_task(goal_task)
            self._planning_task_registered = True

        plan = self.planning_agent.generate_plan(goal_task)
        if not isinstance(plan, list):
            self._planning_enabled = False
            return {"note": "planning unavailable", "plan": None}
        return {"plan_steps": len(plan), "plan": plan}

    def _execute_evaluation(self, event: dict[str, Any]) -> Any:
        evaluate_fn = getattr(self.evaluation_agent, "evaluate", None)
        if callable(evaluate_fn):
            return evaluate_fn(event)
        return {"note": "evaluation method unavailable"}

    def _execute_language(self, event: dict[str, Any]) -> Any:
        execute_fn = getattr(self.language_agent, "execute", None)
        if callable(execute_fn):
            return execute_fn(event)

        # Progressive fallback to common language-agent contracts.
        for method_name in ("chat", "generate", "respond", "process"):
            language_fn = getattr(self.language_agent, method_name, None)
            if callable(language_fn):
                return language_fn(event)

        return {"note": "language execution unavailable"}

    def _extract_language_reply(self, route_result: dict[str, Any], fallback_message: str) -> str:
        if route_result.get("status") != "routed":
            return fallback_message

        result = route_result.get("result", {})
        if isinstance(result, dict):
            payload = result.get("result", result)
            if isinstance(payload, str) and payload.strip():
                return payload.strip()
            if isinstance(payload, dict):
                for key in ("reply", "response", "text", "message", "data"):
                    value = payload.get(key)
                    if isinstance(value, str) and value.strip():
                        return value.strip()

        return fallback_message

    def _execute_reasoning(self, event: dict[str, Any]) -> Any:
        reason_fn = getattr(self.reasoning_agent, "infer", None)
        if callable(reason_fn):
            return reason_fn(event)
        execute_fn = getattr(self.reasoning_agent, "execute", None)
        if callable(execute_fn):
            return execute_fn(event)
        return {"note": "reasoning method unavailable"}

    def _execute_safety(self, event: dict[str, Any]) -> Any:
        risk_score = float(event.get("safety_context", {}).get("risk_score", 0.0) or 0.0)
        assessment = self.collab.assess_risk(risk_score=risk_score, task_type=event.get("task_type", "general"))
        return assessment.to_dict()

    def health(self) -> dict[str, Any]:
        return {"agent_status": "ready", "initialized_at": self.initialized_at}

    def get_move(self, game_state: dict[str, Any]) -> dict[str, Any] | None:
        event = self._build_event_envelope(
            {
                "task_type": "cognitive_puzzle",
                "game_state_snapshot": game_state,
                "requested_action": "suggest_move",
            }
        )
        route_result = self._route_event(event)
        self.shared_memory.set("mindweave:last_route", route_result)

        valid_moves = game_state.get("validMoves", []) if isinstance(game_state, dict) else []
        return valid_moves[0] if valid_moves else None

    def learn_from_game(self, payload: dict[str, Any]) -> bool:
        event = self._build_event_envelope(payload if isinstance(payload, dict) else {})
        route_result = self._route_event(event)
        self.shared_memory.set("mindweave:last_learning_event", route_result)
        return True

    def chat(self, payload: dict[str, Any]) -> dict[str, Any]:
        message = str(payload.get("message", "")).strip()
        if not message:
            return {"error": "message is required"}

        event = self._build_event_envelope(
            {
                "session_id": payload.get("session_id"),
                "player_id": payload.get("player_id"),
                "task_type": payload.get("task_type", "npc_dialogue"),
                "game_state_snapshot": payload.get("game_state_snapshot", {}),
                "telemetry": payload.get("telemetry", {}),
                "safety_context": payload.get("safety_context", {}),
                "requested_action": message,
            }
        )
        route_result = self._route_event(event)

        lower_text = message.lower()
        task_type = event.get("task_type", "npc_dialogue")

        if task_type == "debrief_reflection":
            if any(token in lower_text for token in ("strategy", "reflect", "transfer", "real-world", "collaboration")):
                response = "Debrief accepted. You demonstrated metacognitive transfer and emotional regulation insight."
                emotion, analysis, eq_delta = "calm", "Reflective / Integrated", 4
            else:
                response = "Debrief received, but include explicit strategy and transfer language for stronger consolidation."
                emotion, analysis, eq_delta = "neutral", "Reflection Shallow", 0
        elif task_type == "cognitive_puzzle":
            response = "Cognitive route validated. Prioritize chunking, pattern rehearsal, and error correction loops."
            emotion, analysis, eq_delta = "thinking", "Executive Processing", 1
        elif any(token in lower_text for token in ("understand", "help", "calm", "support", "hear")):
            response = "Your empathy parameters are acceptable. My logic loops are stabilizing. Proceed with the temporal hack."
            emotion, analysis, eq_delta = "calm", "Regulated / Stable", 5
        elif any(token in lower_text for token in ("hurry", "now", "fix")):
            response = "Your aggressive syntax triggers my defense subroutines! The grid cannot be forced!"
            emotion, analysis, eq_delta = "stress", "Agitated / Defensive", -15
        else:
            response = "Input acknowledged. However, the emotional context is ambiguous. Please recalibrate your active listening protocols."
            emotion, analysis, eq_delta = "neutral", "Ambiguous", 0

        self.shared_memory.set("mindweave:last_chat", {"event": event, "route": route_result})
        return {
            "reply": response,
            "emotion": emotion,
            "analysis": analysis,
            "eq_delta": eq_delta,
            "route": route_result,
        }

_AI_INSTANCE: MindweaveAI | None = None
_AI_LOCK = threading.Lock()


def initialize_ai() -> MindweaveAI:
    global _AI_INSTANCE
    with _AI_LOCK:
        if _AI_INSTANCE is None:
            _AI_INSTANCE = MindweaveAI()
            logger.info("Mindweave AI initialized at %s", _AI_INSTANCE.initialized_at)
        else:
            logger.info("Mindweave AI already initialized at %s", _AI_INSTANCE.initialized_at)
    return _AI_INSTANCE
