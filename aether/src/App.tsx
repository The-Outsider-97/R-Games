/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { createInitialState, executeAction } from './utils/gameLogic';
import { getBestMove } from './utils/aiLogic';
import { GameState, PlayerId, ActionType, Position, TileType, Direction } from './types';
import Board from './components/Board';
import ActionDeck from './components/ActionDeck';
import PlayerPanel from './components/PlayerPanel';
import { BOARD_SIZE, POWER_WELLS } from './constants';
import { Info, X } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
      const initial = createInitialState();
      // If PVAI, AI (Player 2) starts.
      if (initial.mode === 'PVAI') {
          initial.activePlayer = 2; 
      }
      return initial;
  });
  const [notification, setNotification] = useState<string>('');

  // AI Turn Effect
  useEffect(() => {
    if (gameState.mode === 'PVAI' && gameState.activePlayer === 2 && !gameState.winner) {
        const timer = setTimeout(() => {
            const move = getBestMove(gameState);
            if (move) {
                // Select card first (visual feedback could be added here)
                setGameState(prev => ({
                    ...prev,
                    selectedCardId: move.cardId,
                    selectedActionIndex: move.actionIndex
                }));
                
                // Execute after short delay
                setTimeout(() => {
                    const card = gameState.faceUpCards.find(c => c.id === move.cardId);
                    if (card) {
                        const action = card.actions[move.actionIndex];
                        handleActionExecution(action, move.target);
                    }
                }, 500);
            } else {
                // AI couldn't find a move? Skip turn or just log
                setNotification("AI is confused and skips turn.");
                // Force turn switch to prevent lock (simplified)
                setGameState(prev => ({ ...prev, activePlayer: 1, actionsRemaining: 2 }));
            }
        }, 1000);
        return () => clearTimeout(timer);
    }
  }, [gameState.activePlayer, gameState.mode, gameState.actionsRemaining, gameState.winner]); // Re-run when these change

  // --- Actions ---

  const handleCardSelect = (cardId: string, actionIndex: number) => {
    if (gameState.winner) return;
    if (gameState.mode === 'PVAI' && gameState.activePlayer === 2) return; // Block input during AI turn

    setGameState(prev => ({
      ...prev,
      selectedCardId: cardId,
      selectedActionIndex: actionIndex,
    }));
    
    const card = gameState.faceUpCards.find(c => c.id === cardId);
    const action = card?.actions[actionIndex];
    
    let helpText = '';
    switch(action) {
        case 'PLACE': helpText = 'Click an EMPTY tile to place a new path.'; break;
        case 'ROTATE': helpText = 'Click a TILE to rotate it 90 degrees.'; break;
        case 'SHIFT': helpText = 'Click an EDGE tile to slide that row or column.'; break;
        case 'ADVANCE': helpText = 'Click an ADJACENT connected tile to move your Architect.'; break;
        case 'ATTUNE': helpText = 'Click YOUR CURRENT tile to place a Resonator (locks tile).'; break;
    }
    setNotification(helpText);
  };

  const handleTileClick = (row: number, col: number) => {
    if (gameState.winner) return;
    if (gameState.mode === 'PVAI' && gameState.activePlayer === 2) return; // Block input during AI turn

    if (!gameState.selectedCardId || gameState.selectedActionIndex === null) {
      setNotification('Please select an action card first.');
      return;
    }

    const card = gameState.faceUpCards.find(c => c.id === gameState.selectedCardId);
    if (!card) return;

    const action = card.actions[gameState.selectedActionIndex];
    handleActionExecution(action, { row, col });
  };

  const handleActionExecution = (action: ActionType, target: Position) => {
      // Use the refactored executeAction from gameLogic
      // Pass current state, get new state
      // We need to pass the *current* state from the ref or state updater if we were inside a callback,
      // but here we are at top level or inside an effect that has access to 'gameState'.
      // Note: Inside the AI effect, 'gameState' is a dependency, so it's fresh.
      
      // However, executeAction is pure.
      const result = executeAction(gameState, action, target);
      
      if (result.success) {
          setGameState(result.newState);
          setNotification(result.message);
      } else {
          setNotification(result.message);
      }
  };

  const toggleMode = () => {
      setGameState(prev => {
          const newMode = prev.mode === 'PVP' ? 'PVAI' : 'PVP';
          // Reset game when switching modes
          const newState = createInitialState();
          newState.mode = newMode;
          if (newMode === 'PVAI') {
              newState.activePlayer = 2; // AI starts
          }
          return newState;
      });
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-200 font-sans selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Header / Status - Mobile */}
        <div className="lg:col-span-12 flex justify-between items-center border-b border-white/10 pb-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tighter text-white flex items-center gap-3">
                    AETHER SHIFT
                    <button 
                        onClick={() => setGameState(prev => ({...prev, showGuide: !prev.showGuide}))}
                        className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 p-1.5 rounded-full transition-colors"
                        title="Toggle Guide"
                    >
                        <Info size={16} />
                    </button>
                </h1>
                <p className="text-neutral-500 text-sm font-mono">TACTICAL SPATIAL WARFARE</p>
            </div>
            <div className="text-right">
                <div className={`text-xl font-bold ${gameState.activePlayer === 1 ? 'text-red-500' : 'text-blue-500'}`}>
                    {gameState.players[gameState.activePlayer].name}'s Turn
                </div>
                <div className="text-xs text-neutral-400 font-mono">
                    ACTIONS: {gameState.actionsRemaining}
                </div>
                <div className="mt-2">
                    <button 
                        onClick={toggleMode}
                        className="text-[10px] uppercase tracking-widest border border-white/20 px-2 py-1 rounded hover:bg-white/10"
                    >
                        Mode: {gameState.mode === 'PVP' ? '2 Player' : 'Vs AI (AI Starts)'}
                    </button>
                </div>
            </div>
        </div>

        {/* Left Panel: Player 1 & Controls */}
        <div className="lg:col-span-3 space-y-6">
            <PlayerPanel player={gameState.players[1]} isActive={gameState.activePlayer === 1} capturedWells={gameState.capturedWells} />
            
            <div className="bg-neutral-800/50 p-4 rounded-xl border border-white/5">
                <h3 className="text-xs font-mono text-neutral-500 mb-2 uppercase">System Log</h3>
                <div className="h-24 overflow-y-auto text-sm text-neutral-300 font-mono">
                    {notification || "System ready. Awaiting input."}
                </div>
            </div>
        </div>

        {/* Center: Board */}
        <div className="lg:col-span-6 flex justify-center items-start relative">
            <Board 
                gameState={gameState} 
                onTileClick={handleTileClick}
            />
            
            {/* Guide Overlay */}
            {gameState.showGuide && (
                <div className="absolute top-4 right-4 max-w-xs bg-neutral-900/90 backdrop-blur border border-indigo-500/30 p-4 rounded-xl shadow-xl z-40 text-sm">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-indigo-400">Quick Guide</h4>
                        <button onClick={() => setGameState(prev => ({...prev, showGuide: false}))} className="text-neutral-500 hover:text-white">
                            <X size={14} />
                        </button>
                    </div>
                    <ul className="space-y-2 text-neutral-300 list-disc pl-4">
                        <li><strong>Goal:</strong> Connect your edge (Red: Top, Blue: Bottom) to the opposite side OR capture 3 Power Wells.</li>
                        <li><strong>Turn:</strong> Pick 2 actions from the cards below.</li>
                        <li><strong>Shift:</strong> Click edge tiles to slide rows/cols.</li>
                        <li><strong>Attune:</strong> Lock a tile & capture Wells.</li>
                    </ul>
                </div>
            )}
        </div>

        {/* Right Panel: Player 2 & Deck */}
        <div className="lg:col-span-3 space-y-6">
            <PlayerPanel player={gameState.players[2]} isActive={gameState.activePlayer === 2} capturedWells={gameState.capturedWells} />
            
            <div className="space-y-4">
                <h3 className="text-xs font-mono text-neutral-500 uppercase">Action Deck</h3>
                <ActionDeck 
                    cards={gameState.faceUpCards} 
                    selectedCardId={gameState.selectedCardId}
                    selectedActionIndex={gameState.selectedActionIndex}
                    onSelect={handleCardSelect}
                    disabled={!!gameState.winner || (gameState.mode === 'PVAI' && gameState.activePlayer === 2)}
                />
            </div>
        </div>

      </div>

      {/* Winner Overlay */}
      {gameState.winner && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-neutral-900 border border-white/20 p-8 rounded-2xl max-w-md text-center shadow-2xl">
                <h2 className="text-4xl font-bold text-white mb-2">VICTORY</h2>
                <p className={`text-xl mb-6 ${gameState.winner === 1 ? 'text-red-500' : 'text-blue-500'}`}>
                    {gameState.players[gameState.winner].name} Wins!
                </p>
                <p className="text-neutral-400 mb-8 font-mono text-sm">{gameState.winReason}</p>
                <button 
                    onClick={() => window.location.reload()}
                    className="bg-white text-black px-6 py-3 rounded-full font-bold hover:bg-neutral-200 transition"
                >
                    Initialize New Session
                </button>
            </div>
        </div>
      )}
    </div>
  );
}

