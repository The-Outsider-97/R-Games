import React from 'react';
import { Tile as TileModel, PlayerId, Player } from '../types';
import { motion } from 'motion/react';
import { TILE_CONNECTIONS } from '../constants';
import { User, Box, Zap } from 'lucide-react';

interface TileProps {
  tile: TileModel | null;
  row: number;
  col: number;
  onClick: () => void;
  players: Record<PlayerId, Player>;
  isPowerWell: boolean;
  capturedBy?: PlayerId;
}

const Tile: React.FC<TileProps> = ({ tile, row, col, onClick, players, isPowerWell, capturedBy }) => {
  
  // Render path lines based on BASE connections (Rotation 0)
  // We will rotate the container div to match tile.rotation
  const renderBasePaths = () => {
    if (!tile) return null;
    
    if (!TILE_CONNECTIONS) {
      console.error("TILE_CONNECTIONS is undefined");
      return null;
    }

    // Get BASE connections for this type
    const connections = TILE_CONNECTIONS[tile.type];
    if (!connections) {
      console.error(`No connections defined for tile type: ${tile.type}`);
      return null;
    }

    const [n, e, s, w] = connections;
    
    const pathColor = tile.color === 'red' ? 'bg-red-500' : tile.color === 'blue' ? 'bg-blue-500' : 'bg-neutral-400';
    const glow = tile.color === 'red' ? 'shadow-[0_0_10px_rgba(239,68,68,0.5)]' : tile.color === 'blue' ? 'shadow-[0_0_10px_rgba(59,130,246,0.5)]' : '';

    const rotation = typeof tile.rotation === 'number' ? tile.rotation : 0;

    return (
      <motion.div 
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        animate={{ rotate: rotation }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
      >
        {/* Center Hub */}
        <div className={`w-4 h-4 rounded-full ${pathColor} ${glow} z-10`} />
        
        {/* Arms - using absolute positioning relative to the rotated container */}
        {n && <div className={`absolute top-0 w-2 h-[50%] ${pathColor} ${glow}`} />}
        {s && <div className={`absolute bottom-0 w-2 h-[50%] ${pathColor} ${glow}`} />}
        {w && <div className={`absolute left-0 h-2 w-[50%] ${pathColor} ${glow}`} />}
        {e && <div className={`absolute right-0 h-2 w-[50%] ${pathColor} ${glow}`} />}
      </motion.div>
    );
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`
        relative w-16 h-16 md:w-20 md:h-20 rounded-lg cursor-pointer
        flex items-center justify-center
        transition-colors duration-200
        ${tile ? 'bg-neutral-800' : 'bg-neutral-900 border-2 border-dashed border-neutral-800'}
        ${isPowerWell ? 'ring-2 ring-yellow-500/30' : ''}
        hover:bg-neutral-700
      `}
      onClick={onClick}
    >
      {/* Power Well Indicator */}
      {isPowerWell && (
        <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
            <Zap className={`w-12 h-12 ${capturedBy ? (capturedBy === 1 ? 'text-red-500' : 'text-blue-500') : 'text-yellow-500'}`} />
        </div>
      )}

      {/* Tile Paths (Rotated Layer) */}
      {renderBasePaths()}

      {/* Resonator (Static Layer - stays upright) */}
      {tile?.hasResonator && (
        <div className="absolute top-1 right-1 z-20">
            <Box className={`w-4 h-4 ${tile.resonatorOwner === 1 ? 'text-red-400 fill-red-400' : 'text-blue-400 fill-blue-400'}`} />
        </div>
      )}

      {/* Players (Meeples) (Static Layer - stays upright) */}
      {tile?.playersPresent.length > 0 && (
        <div className="absolute z-30 flex gap-1">
            {tile.playersPresent.map(pid => (
                <div key={pid} className={`
                    w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-lg
                    ${pid === 1 ? 'bg-red-600' : 'bg-blue-600'}
                `}>
                    <User size={14} className="text-white" />
                </div>
            ))}
        </div>
      )}
      
      {/* Debug/Coords */}
      {/* <span className="absolute bottom-0 left-1 text-[8px] text-neutral-600">{row},{col}</span> */}
    </motion.div>
  );
};

export default Tile;

