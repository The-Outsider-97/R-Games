"""Application entry point for R-Games.

Responsibilities:
1. Start and host the backend server.
2. Initialize game AI when a user selects a game.
3. Return launch metadata so the client can route to the chosen game frontend.
"""

from __future__ import annotations

import argparse
import importlib
import json
import logging
from dataclasses import dataclass
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent

# Add project root to sys.path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

# Add AI folder to sys.path so 'src' and 'logs' can be imported as top-level packages
ai_root = project_root / "AI"
sys.path.insert(0, str(ai_root))

try:
    from src.agents.agent_factory import AgentFactory
    from src.agents.collaborative.shared_memory import SharedMemory
    from src.agents.planning.planning_types import Task, TaskType
    from logs.logger import get_logger
except ImportError as e:
    print(f"Error importing modules: {e}")
    raise

logger = get_logger("AI_Main")


@dataclass(frozen=True)
class GameConfig:
    key: str
    display_name: str
    ai_module: str
    ai_initializer: str
    launch_url: str


GAMES: dict[str, GameConfig] = {
    "chronos": GameConfig(
        key="chronos",
        display_name="Chronos",
        ai_module="ai_chronos",
        ai_initializer="initialize_ai",
        launch_url="/chronos/index.html",
    ),
    "aether_shift": GameConfig(
        key="aether_shift",
        display_name="Aether Shift",
        ai_module="ai_aether",
        ai_initializer="initialize_ai",
        launch_url="/aether/index.html",
    ),
    "mindweave": GameConfig(
        key="mindweave",
        display_name="Mindweave",
        ai_module="ai_mindweave",
        ai_initializer="initialize_ai",
        launch_url="/mindweave/index.html",
    ),
}


class GameRuntime:
    """Keeps active game context and lazy-initialized AI instances."""

    def __init__(self) -> None:
        self.active_game: str | None = None
        self.ai_instances: dict[str, object] = {}

    def _load_initializer(self, config: GameConfig) -> Callable[[], object]:
        module = importlib.import_module(config.ai_module)
        initializer = getattr(module, config.ai_initializer, None)
        if not callable(initializer):
            raise AttributeError(
                f"{config.ai_module}.{config.ai_initializer} is missing or not callable"
            )
        return initializer

    def select_game(self, game_key: str) -> dict[str, str]:
        config = GAMES.get(game_key)
        if config is None:
            raise KeyError(f"Unknown game '{game_key}'")

        if game_key not in self.ai_instances:
            logger.info("Initializing AI runtime for %s", config.display_name)
            initializer = self._load_initializer(config)
            self.ai_instances[game_key] = initializer()

        self.active_game = game_key
        return {
            "game": config.key,
            "name": config.display_name,
            "launch_url": config.launch_url,
            "message": f"{config.display_name} initialized. Launching now...",
        }


runtime = GameRuntime()


class RequestHandler(SimpleHTTPRequestHandler):
    """Static file server + game launcher APIs."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _send_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 (http method naming)
        if self.path == "/api/games":
            self._send_json(
                {
                    "games": [
                        {
                            "key": game.key,
                            "name": game.display_name,
                            "launch_url": game.launch_url,
                        }
                        for game in GAMES.values()
                    ]
                }
            )
            return

        if self.path == "/api/selected-game":
            self._send_json({"active_game": runtime.active_game})
            return

        if self.path == "/":
            self.path = "/index.html"

        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/api/select-game":
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body or b"{}")
            selected_game = payload.get("game")
            result = runtime.select_game(selected_game)
        except json.JSONDecodeError:
            self._send_json({"error": "Invalid JSON payload"}, HTTPStatus.BAD_REQUEST)
            return
        except KeyError as error:
            self._send_json({"error": str(error)}, HTTPStatus.BAD_REQUEST)
            return
        except Exception as error:  # noqa: BLE001
            logger.exception("Failed during game selection")
            self._send_json(
                {"error": f"Unable to initialize game: {error}"},
                HTTPStatus.INTERNAL_SERVER_ERROR,
            )
            return

        self._send_json(result)


def run(host: str = "0.0.0.0", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), RequestHandler)
    logger.info("R-Games launcher running at http://%s:%d", host, port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down server")
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="R-Games launcher backend")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    run(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
