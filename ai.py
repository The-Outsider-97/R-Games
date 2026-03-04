import sys
import os
import json
import logging
import numpy as np
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

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

# Configure logging
logger = get_logger("AI_Main")

class AIPlayer:
    def __init__(self):
        logger.info("Initializing AI Player...")
        self.shared_memory = SharedMemory()
        self.factory = AgentFactory()
        
        # Create agents
        try:
            self.knowledge_agent = self.factory.create("knowledge", self.shared_memory)
            # Load Chronos strategy into knowledge agent
            try:
                self.knowledge_agent.load_from_directory()
                logger.info("Knowledge Agent loaded documents from templates.")
            except Exception as ke:
                logger.warning(f"Knowledge Agent failed to load documents: {ke}")

            self.planning_agent = self.factory.create("planning", self.shared_memory)
            self.execution_agent = self.factory.create("execution", self.shared_memory)
            self.learning_agent = self.factory.create("learning", self.shared_memory)
            
            logger.info("AI Player initialized with Knowledge, Planning, Execution, and Learning agents.")
        except Exception as e:
            logger.error(f"Failed to initialize AI Player: {e}", exc_info=True)
            # We don't raise here to allow the server to start even if agents fail
            pass

    def get_move(self, game_state):
        try:
            valid_moves = game_state.get('validMoves', [])
            if not valid_moves:
                logger.warning("No valid moves provided in game state.")
                return None
            
            # 1. Knowledge Retrieval: Get strategy context
            strategy_context = ""
            try:
                # Query for Chronos-specific strategies
                knowledge_response = self.knowledge_agent.query("Chronos game strategy and piece value")
                if knowledge_response and 'results' in knowledge_response:
                    strategy_context = " ".join([r.get('content', '') for r in knowledge_response['results']])
                logger.info(f"Knowledge Agent retrieved strategy context: {strategy_context[:100]}...")
            except Exception as e:
                logger.warning(f"Knowledge Agent query failed: {e}")

            # 2. Planning: Generate a high-level plan for the current state
            plan = None
            try:
                # Create a formal Task for the planning agent
                goal_task = Task(
                    name="select_best_move",
                    task_type=TaskType.ABSTRACT,
                    goal_state={"move_selected": True},
                    context={
                        "game_state": game_state,
                        "strategy": strategy_context
                    }
                )
                plan = self.planning_agent.generate_plan(goal_task)
                logger.info(f"Planning Agent generated plan with {len(plan) if plan else 0} steps.")
            except Exception as e:
                logger.warning(f"Planning Agent failed to generate plan: {e}")

            # 3. Execution: Score each valid move and select the best one
            # We'll use the ExecutionAgent's action selector logic conceptually
            best_move = None
            max_score = -float('inf')

            for move in valid_moves:
                score = self._score_move(move, game_state, strategy_context, plan)
                if score > max_score:
                    max_score = score
                    best_move = move

            logger.info(f"AI selected move with score {max_score}: {best_move}")
            return best_move

        except Exception as e:
            logger.error(f"Error in get_move: {e}", exc_info=True)
            # Fallback to random move if everything fails
            import random
            return random.choice(game_state.get('validMoves', [])) if game_state.get('validMoves') else None

    def _score_move(self, move, game_state, strategy, plan):
        """
        Heuristic scoring function that incorporates agent 'intelligence'.
        """
        score = 0
        
        # Piece values from rulebook
        PIECE_VALUES = {
            'Strategos': 3,
            'Warden': 2,
            'Scout': 1
        }
        
        move_type = move.get('type')
        params = move.get('params', {})
        target = params.get('target', {})
        tr, tc = target.get('r'), target.get('c')
        unit_id = move.get('unitId')
        
        # Find the unit acting
        acting_unit = None
        for u in game_state.get('board', []):
            if u.get('id') == unit_id:
                acting_unit = u
                break
        
        if not acting_unit:
            return -1000

        # 1. Core Control (High Priority)
        # Multipliers: Center = 2x, Adjacent = 1x
        if tr == 4 and tc == 4:
            score += 100  # Center core is extremely valuable
        elif self._is_core_cell(tr, tc):
            score += 40  # Adjacent core is valuable
            
        # 2. Attack (High Priority)
        if move_type == 'attack':
            # Attacking is good, especially high-value targets
            target_unit_type = target.get('type')
            target_value = PIECE_VALUES.get(target_unit_type, 1)
            score += 50 * target_value
            
            # If we can eliminate the Strategos, it's a winning move
            if target_unit_type == 'Strategos':
                score += 1000
            
        # 3. Piece Protection & Value
        # Moving high value pieces to safety or better positions
        unit_type = acting_unit.get('type')
        unit_value = PIECE_VALUES.get(unit_type, 1)
        
        if unit_type == 'Strategos':
            # Keep Strategos safe but active
            if self._is_core_cell(tr, tc):
                score += 30
            else:
                score += 10
        
        # 4. Planning Alignment
        if plan and isinstance(plan, list):
            for step in plan:
                # If the plan suggests a specific unit or action type
                if hasattr(step, 'name') and step.name == move_type:
                    score += 25
                if hasattr(step, 'context') and step.context.get('unit_id') == unit_id:
                    score += 20

        # 5. Strategic Context (from Knowledge Agent)
        if "core control" in strategy.lower() and self._is_core_cell(tr, tc):
            score += 15
        if "aggressive" in strategy.lower() and move_type == 'attack':
            score += 15

        # 6. Random factor for variety
        import random
        score += random.uniform(0, 5)
        
        return score

    def _is_core_cell(self, r, c):
        # 3x3 core in the center of 9x9 board (3,3 to 5,5)
        return 3 <= r <= 5 and 3 <= c <= 5

    def learn_from_game(self, result):
        try:
            logger.info(f"Learning from game result: {result.get('outcome')}")
            # Pass the result to the learning agent
            if self.learning_agent:
                # We simulate an observation for the learning agent
                # In a real RL setup, this would update the policy weights
                self.learning_agent.observe(
                    task_embedding=np.zeros(256), # Dummy embedding
                    best_agent_strategy_name="planning" if result.get('outcome') == 'win' else 'rl'
                )
            return True
        except Exception as e:
            logger.error(f"Error in learn_from_game: {e}", exc_info=True)
            return False

# Initialize AI Player instance
ai_player = None

def initialize_ai():
    global ai_player
    if ai_player is None:
        try:
            ai_player = AIPlayer()
        except Exception as e:
            logger.critical(f"Failed to initialize AI Player on startup: {e}")

class AIRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path
        
        # API Routes
        if path in ('/health', '/api/ai/health'):
            self._set_headers()
            status = "ready" if ai_player else "initializing"
            self.wfile.write(json.dumps({"status": "healthy", "agent_status": status}).encode('utf-8'))
            return

        # Static File Serving
        if path == '/':
            path = '/index.html'
        
        # Remove leading slash to get relative path
        relative_path = path.lstrip('/')
        file_path = project_root / relative_path
        
        if file_path.exists() and file_path.is_file():
            # Security check: ensure file is within project root
            try:
                file_path.resolve().relative_to(project_root.resolve())
            except ValueError:
                self._set_headers(403)
                self.wfile.write(json.dumps({"error": "Forbidden"}).encode('utf-8'))
                return

            import mimetypes
            mime_type, _ = mimetypes.guess_type(file_path)
            if mime_type is None:
                mime_type = 'application/octet-stream'
            
            self.send_response(200)
            self.send_header('Content-type', mime_type)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

    def do_POST(self):
        parsed_path = urlparse(self.path)
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data.decode('utf-8'))
        except json.JSONDecodeError:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Invalid JSON"}).encode('utf-8'))
            return

        if parsed_path.path in ('/move', '/api/ai/move'):
            if not ai_player:
                self._set_headers(503)
                self.wfile.write(json.dumps({"error": "AI Player not initialized"}).encode('utf-8'))
                return

            move = ai_player.get_move(data)
            if move:
                self._set_headers()
                self.wfile.write(json.dumps({"move": move}).encode('utf-8'))
            else:
                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "No valid move found"}).encode('utf-8'))

        elif parsed_path.path in ('/learn', '/api/ai/learn'):
            if not ai_player:
                self._set_headers(503)
                self.wfile.write(json.dumps({"error": "AI Player not initialized"}).encode('utf-8'))
                return

            success = ai_player.learn_from_game(data)
            if success:
                self._set_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Learning updated"}).encode('utf-8'))
            else:
                self._set_headers(500)
                self.wfile.write(json.dumps({"error": "Learning update failed"}).encode('utf-8'))
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode('utf-8'))

def run(server_class=HTTPServer, handler_class=AIRequestHandler):
    initialize_ai()
    # Use PYTHON_PORT environment variable if available, otherwise default to 5000
    port = int(os.environ.get('PYTHON_PORT', 5000))
    server_address = ('0.0.0.0', port)
    httpd = server_class(server_address, handler_class)
    logger.info(f"Starting AI Server on port {port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    httpd.server_close()
    logger.info("AI Server stopped.")

if __name__ == "__main__":
    run()

