import React from 'react';
import { ActionCard } from '../types';
import { motion } from 'motion/react';

interface ActionDeckProps {
  cards: ActionCard[];
  selectedCardId: string | null;
  selectedActionIndex: number | null;
  onSelect: (cardId: string, actionIndex: number) => void;
  disabled: boolean;
}

const ActionDeck: React.FC<ActionDeckProps> = ({ cards, selectedCardId, selectedActionIndex, onSelect, disabled }) => {
  return (
    <div className="grid gap-3">
      {cards.map((card) => (
        <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
                relative overflow-hidden rounded-xl border transition-all duration-200
                ${selectedCardId === card.id ? 'border-indigo-500 ring-1 ring-indigo-500 bg-neutral-800' : 'border-neutral-700 bg-neutral-900 hover:border-neutral-500'}
                ${disabled ? 'opacity-50 pointer-events-none' : ''}
            `}
        >
            <div className="flex divide-x divide-neutral-700 h-20">
                {card.actions.map((action, index) => {
                    const isSelected = selectedCardId === card.id && selectedActionIndex === index;
                    return (
                        <button
                            key={index}
                            onClick={() => onSelect(card.id, index)}
                            className={`
                                flex-1 flex flex-col items-center justify-center gap-1 hover:bg-white/5 transition-colors
                                ${isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'text-neutral-400'}
                            `}
                        >
                            <span className="text-xs font-mono font-bold tracking-widest">{action}</span>
                            {/* Icon placeholder based on action */}
                            <div className="w-8 h-1 bg-current opacity-20 rounded-full" />
                        </button>
                    );
                })}
            </div>
            
            {/* Card ID/Decor */}
            <div className="absolute bottom-0 right-2 text-[8px] text-neutral-700 font-mono">
                CMD-{card.id.slice(-4)}
            </div>
        </motion.div>
      ))}
    </div>
  );
};

export default ActionDeck;
