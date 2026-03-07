import { GameState, Position, ActionType, PlayerId } from '../types';
import { BOARD_SIZE, POWER_WELLS } from '../constants';
import { isValidMove, executeAction, getPathProgress } from './gameLogic';

interface AIMove {
  cardId: string;
  actionIndex: number;
  target: Position;
  score?: number;
}

// Inspired by SLAI Planning Agent: https://github.com/The-Outsider-97/SLAI/blob/main/src/agents/planning_agent.py
// Implements a depth-limited search (lookahead) to plan multi-step turns.

export const getBestMove = (gameState: GameState): AIMove | null => {
  if (!gameState || !gameState.faceUpCards || !gameState.board || !gameState.players) {
      console.error("Invalid gameState in getBestMove", gameState);
      return null;
  }

  try {
      // Robust 1-ply search to ensure stability
      const possibleMoves = getAllPossibleMoves(gameState);
      
      if (possibleMoves.length === 0) return null;

      let bestMove: AIMove | null = null;
      let bestScore = -Infinity;

      // Evaluate all moves
      for (const move of possibleMoves) {
          // Defensive checks
          if (!gameState.faceUpCards) continue;
          const card = gameState.faceUpCards.find(c => c.id === move.cardId);
          if (!card || !card.actions) continue;
          
          const action = card.actions[move.actionIndex];
          if (!action) continue;
          
          // Execute action on a clone
          const result = executeAction(gameState, action, move.target);
          if (result.success) {
              const score = evaluateState(result.newState, gameState.activePlayer);
              if (score > bestScore) {
                  bestScore = score;
                  bestMove = move;
              }
          }
      }
      
      // Fallback: If no best move found (e.g. all scores -Infinity?), pick random valid move
      if (!bestMove && possibleMoves.length > 0) {
          return possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      }

      return bestMove;
  } catch (error) {
      console.error("Error in getBestMove:", error);
      return null;
  }
};

const getAllPossibleMoves = (gameState: GameState): AIMove[] => {
    const moves: AIMove[] = [];
    if (!gameState.faceUpCards) return moves;
    const { faceUpCards } = gameState;
    
    // For each card
    for (const card of faceUpCards) {
        if (!card || !card.actions) continue;
        // For each action on card
        for (let i = 0; i < card.actions.length; i++) {
            const action = card.actions[i];
            if (!action) continue;
            
            const targets = getValidTargets(gameState, action);
            
            for (const target of targets) {
                moves.push({
                    cardId: card.id,
                    actionIndex: i,
                    target
                });
            }
        }
    }
    return moves;
};

const getValidTargets = (gameState: GameState, action: ActionType): Position[] => {
    const targets: Position[] = [];
    const { board, activePlayer, players } = gameState;
    const player = players[activePlayer];

    if (!player) return [];

    // Helper to add if not already present (though grid generation is unique)
    const add = (r: number, c: number) => targets.push({ row: r, col: c });

    switch (action) {
        case 'PLACE':
            for(let r=0; r<BOARD_SIZE; r++) {
                for(let c=0; c<BOARD_SIZE; c++) {
                    if (!board[r][c]) add(r, c);
                }
            }
            break;
            
        case 'ROTATE':
            for(let r=0; r<BOARD_SIZE; r++) {
                for(let c=0; c<BOARD_SIZE; c++) {
                    const tile = board[r][c];
                    if (tile && (!tile.hasResonator || tile.resonatorOwner === activePlayer)) {
                        add(r, c);
                    }
                }
            }
            break;
            
        case 'ADVANCE':
            if (player.position) {
                for(let r=0; r<BOARD_SIZE; r++) {
                    for(let c=0; c<BOARD_SIZE; c++) {
                        if (isValidMove(board, player.position, { row: r, col: c })) {
                            add(r, c);
                        }
                    }
                }
            }
            break;
            
        case 'ATTUNE':
            if (player.position) {
                const { row, col } = player.position;
                const tile = board[row][col];
                if (tile && !tile.hasResonator && player.resonators > 0) {
                    add(row, col);
                }
            }
            break;
            
        case 'SHIFT':
            // Top Edge (Shifts Cols Down)
            for(let c=0; c<BOARD_SIZE; c++) add(0, c);
            // Bottom Edge (Shifts Cols Up)
            for(let c=0; c<BOARD_SIZE; c++) add(BOARD_SIZE-1, c);
            // Left Edge (Shifts Rows Right) - Exclude corners to avoid ambiguity if any
            // Based on gameLogic, (0,0) is Top, so Row 0 is hard to shift.
            // We just add all edge tiles and let executeAction decide.
            for(let r=1; r<BOARD_SIZE-1; r++) add(r, 0);
            // Right Edge (Shifts Rows Left)
            for(let r=1; r<BOARD_SIZE-1; r++) add(r, BOARD_SIZE-1);
            break;
    }
    return targets;
};

// ... (imports remain same)

const evaluateState = (gameState: GameState, playerId: PlayerId): number => {
    if (!gameState) return -Infinity;
    if (!gameState.players) return -Infinity;
    if (!gameState.capturedWells) return -Infinity;
    if (!gameState.players[playerId]) return -Infinity;

    let score = 0;
    
    // 1. Victory Check (Immediate Win is best)
    if (gameState.winner === playerId) return 1000000;
    if (gameState.winner && gameState.winner !== playerId) return -1000000;

    const player = gameState.players[playerId];
    const opponentId = playerId === 1 ? 2 : 1;
    const opponent = gameState.players[opponentId];

    if (!player || !opponent) return 0;

    // 2. Power Wells (Prioritize heavily)
    // Own wells: 5000 points each (3 needed to win)
    const myWells = Object.values(gameState.capturedWells).filter(id => id === playerId).length;
    score += myWells * 5000;
    
    // Opponent wells: Penalize heavily to block them
    const oppWells = Object.values(gameState.capturedWells).filter(id => id === opponentId).length;
    score -= oppWells * 6000; // Slightly higher penalty to prioritize blocking if they are close to winning

    // If opponent has 2 wells, BLOCKING IS CRITICAL
    if (oppWells === 2) score -= 20000;

    // 3. Path Progress (Connectivity)
    const myPathProgress = getPathProgress(gameState, playerId);
    score += myPathProgress * 100;

    const oppPathProgress = getPathProgress(gameState, opponentId);
    score -= oppPathProgress * 120; // Penalize opponent progress more than rewarding own

    // 4. Architect Position (Heuristic)
    // Distance from current position to goal row
    if (player.position) {
        const dist = Math.abs(player.position.row - player.goalRow);
        score += (BOARD_SIZE - dist) * 200; // Closer is better
        
        // Bonus for being on a power well (if not captured)
        const wellKey = `${player.position.row},${player.position.col}`;
        const onWell = POWER_WELLS.some(w => w.row === player.position!.row && w.col === player.position!.col);
        if (onWell && !gameState.capturedWells[wellKey]) {
            score += 1000; // Go to uncaptured wells
        }
    }
    
    // 5. Resonators placed (good to lock tiles)
    score += (4 - player.resonators) * 50;

    // 6. Mobility (Number of valid moves from current pos)
    // This encourages keeping paths open
    if (player.position) {
        let mobility = 0;
        const neighbors = [
            { r: player.position.row - 1, c: player.position.col },
            { r: player.position.row + 1, c: player.position.col },
            { r: player.position.row, c: player.position.col - 1 },
            { r: player.position.row, c: player.position.col + 1 },
        ];
        for(const n of neighbors) {
            if (isValidMove(gameState.board, player.position, { row: n.r, col: n.c })) {
                mobility++;
            }
        }
        score += mobility * 10;
    }

    // 7. Random factor removed for deterministic behavior
    // score += Math.random() * 20;

    return score;
}
