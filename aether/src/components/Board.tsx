import React from 'react';
import { GameState, Position, Tile as TileType } from '../types';
import Tile from './Tile';
import { BOARD_SIZE } from '../constants';
import { motion } from 'motion/react';

interface BoardProps {
  gameState: GameState;
  onTileClick: (row: number, col: number) => void;
}

const Board: React.FC<BoardProps> = ({ gameState, onTileClick }) => {
  return (
    <div className="relative p-4 bg-neutral-950 rounded-xl shadow-2xl border border-white/5">
      {/* Grid Background */}
      <div 
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
      >
        {gameState.board.map((row, rIndex) => (
          row.map((tile, cIndex) => (
            <Tile 
              key={tile ? tile.id : `empty-${rIndex}-${cIndex}`}
              tile={tile}
              row={rIndex}
              col={cIndex}
              onClick={() => onTileClick(rIndex, cIndex)}
              players={gameState.players}
              isPowerWell={gameState.powerWells.some(pw => pw.row === rIndex && pw.col === cIndex)}
              capturedBy={gameState.capturedWells[`${rIndex},${cIndex}`]}
            />
          ))
        ))}
      </div>
      
      {/* Decorative Borders indicating Home Edges */}
      <div className="absolute -top-3 left-0 right-0 h-1 bg-red-500/50 rounded-full blur-[2px]" />
      <div className="absolute -bottom-3 left-0 right-0 h-1 bg-blue-500/50 rounded-full blur-[2px]" />
    </div>
  );
};

export default Board;

