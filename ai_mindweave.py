"""Mindweave AI initialization module."""

# Goal:
# Select a practical subset of SLAI agents for Project: MindWeave and map them to game systems that are designed for far-transfer outcomes (IQ, executive function, EQ, and metacognition).
#
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

from http.server import BaseHTTPRequestHandler, HTTPServer
from dataclasses import dataclass, field
from urllib.parse import urlparse
from datetime import datetime
from pathlib import Path
from typing import Any

# Add project root to sys.path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

# Add AI folder to sys.path so 'src' and 'logs' can be imported as top-level packages
ai_root = project_root / "AI"
sys.path.insert(0, str(ai_root))

try:
    from src.agents.agent_factory import AgentFactory
    # from src.agents.collaborative_agent import CollaborativeAgent # I don't know how to properly integrate this agent without causing double initialization
    from src.agents.collaborative.shared_memory import SharedMemory
    from src.agents.planning.planning_types import Task, TaskType
    from logs.logger import get_logger
except ImportError as e:
    print(f"Error importing modules: {e}")
    raise

logger = get_logger("Project: Mindweave")

@dataclass
class MindweaveAI:
    game: str = "mindweave"
    initialized_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def __post_init__(self) -> None:
        self.shared_memory = SharedMemory()
        self.factory = AgentFactory()
        # self.collab = CollaborativeAgent()

        self.knowledge_agent = self.factory.create("knowledge", self.shared_memory)
        self.planning_agent = self.factory.create("planning", self.shared_memory)
        self.evaluation_agent = self.factory.create("evaluation", self.shared_memory)
        self.language_agent = self.factory.create("language", self.shared_memory)
        self.safety_agent = self.factory.create("safety", self.shared_memory)

        self._planning_task_registered = False
        self._planning_enabled = True
        self.match_log_path = project_root / 'AI' / 'logs' / 'mindweave.jsonl'
        self.shared_memory.set("mindweave_ai_status", "initialized")
        logger.info("Project: Mindweave AI initialized with Knowledge, Planning, Evaluation, Language, and Safety agents")

    def health(self) -> dict[str, Any]:
        return {"agent_status": "ready", "initialized_at": self.initialized_at}

    def get_move(self, game_state: dict[str, Any]) -> dict[str, Any] | None:
        valid_moves = game_state.get("validMoves", []) if isinstance(game_state, dict) else []
        return valid_moves[0] if valid_moves else None

    def learn_from_game(self, payload: dict[str, Any]) -> bool:
        _ = payload
        return True

def initialize_ai() -> MindweaveAI:
    ai = MindweaveAI()
    logger.info("Mindweave AI initialized at %s", ai.initialized_at)
    return ai
