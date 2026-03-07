"""Mindweave AI initialization module."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger("r-games.ai.mindweave")

@dataclass
class MindweaveAI:
    game: str = "mindweave"
    initialized_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

def initialize_ai() -> MindweaveAI:
    ai = MindweaveAI()
    logger.info("Mindweave AI initialized at %s", ai.initialized_at)
    return ai
