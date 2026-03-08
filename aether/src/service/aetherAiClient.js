import { getAllPossibleMoves, getBestMove } from '../utils/aiLogic.js';

export const requestAetherMove = async (gameState) => {
  const validMoves = getAllPossibleMoves(gameState);
  if (!validMoves.length) return null;

  try {
    const response = await fetch('/api/ai/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...gameState, validMoves }),
    });

    if (!response.ok) throw new Error(`AI endpoint failed (${response.status})`);

    const payload = await response.json();
    const move = payload.move || payload.choice || null;

    if (!move || !move.cardId || !move.target) return getBestMove(gameState);
    return move;
  } catch (error) {
    console.warn('Falling back to local Aether AI:', error);
    return getBestMove(gameState);
  }
};