import React, { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { createInitialState, executeAction } from './utils/gameLogic.js';
import { requestAetherMove } from './services/aetherAiClient.js';
import Board from './components/Board.js';
import ActionDeck from './components/ActionDeck.js';
import PlayerPanel from './components/PlayerPanel.js';

export default function App() {
  const [gameState, setGameState] = useState(() => createInitialState());
  const [notification, setNotification] = useState('');

  useEffect(() => {
    if (gameState.mode !== 'PVAI' || gameState.activePlayer !== 2 || gameState.winner) return;
    const timer = setTimeout(async () => {
      const move = await requestAetherMove(gameState);
      if (!move) {
        setNotification('AI skipped turn.');
        setGameState((prev) => ({ ...prev, activePlayer: 1, actionsRemaining: 2 }));
        return;
      }

      setGameState((prev) => ({ ...prev, selectedCardId: move.cardId, selectedActionIndex: move.actionIndex }));
      setTimeout(() => {
        const card = gameState.faceUpCards.find((c) => c.id === move.cardId);
        const action = card?.actions?.[move.actionIndex];
        if (action) handleActionExecution(action, move.target);
      }, 350);
    }, 800);
    return () => clearTimeout(timer);
  }, [gameState.activePlayer, gameState.mode, gameState.winner]);

  const handleCardSelect = (cardId, actionIndex) => {
    if (gameState.winner || (gameState.mode === 'PVAI' && gameState.activePlayer === 2)) return;
    setGameState((prev) => ({ ...prev, selectedCardId: cardId, selectedActionIndex: actionIndex }));
  };

  const handleTileClick = (row, col) => {
    if (gameState.winner || (gameState.mode === 'PVAI' && gameState.activePlayer === 2)) return;
    if (!gameState.selectedCardId || gameState.selectedActionIndex === null) return;

    const card = gameState.faceUpCards.find((c) => c.id === gameState.selectedCardId);
    const action = card?.actions?.[gameState.selectedActionIndex];
    if (action) handleActionExecution(action, { row, col });
  };

  const handleActionExecution = (action, target) => {
    const result = executeAction(gameState, action, target);
    if (result.success) {
      setGameState(result.newState);
    }
    setNotification(result.message);
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 font-sans selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12 flex justify-between items-center border-b border-white/10 pb-4">
          <h1 className="text-3xl font-bold tracking-tighter text-white flex items-center gap-3">AETHER SHIFT <Info size={16} /></h1>
          <div className={`text-xl font-bold ${gameState.activePlayer === 1 ? 'text-red-500' : 'text-blue-500'}`}>{gameState.players[gameState.activePlayer].name}'s Turn</div>
        </div>
        <div className="lg:col-span-3 space-y-6"><PlayerPanel player={gameState.players[1]} isActive={gameState.activePlayer === 1} capturedWells={gameState.capturedWells} /><div className="bg-neutral-800/50 p-4 rounded-xl border border-white/5">{notification || 'System ready.'}</div></div>
        <div className="lg:col-span-6 flex justify-center items-start relative"><Board gameState={gameState} onTileClick={handleTileClick} /></div>
        <div className="lg:col-span-3 space-y-6"><PlayerPanel player={gameState.players[2]} isActive={gameState.activePlayer === 2} capturedWells={gameState.capturedWells} /><ActionDeck cards={gameState.faceUpCards} selectedCardId={gameState.selectedCardId} selectedActionIndex={gameState.selectedActionIndex} onSelect={handleCardSelect} disabled={!!gameState.winner || (gameState.mode === 'PVAI' && gameState.activePlayer === 2)} /></div>
      </div>
    </div>
  );
}