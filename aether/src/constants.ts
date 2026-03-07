import { ActionCard, ActionType, TileType } from './types';

export const BOARD_SIZE = 5;
export const POWER_WELLS = [
  { row: 0, col: 0 },
  { row: 0, col: 4 },
  { row: 4, col: 0 },
  { row: 4, col: 4 },
];

export const TILE_TYPES: TileType[] = ['STRAIGHT', 'CURVE', 'T_JUNCTION'];

export const TILE_CONNECTIONS: Record<TileType, [boolean, boolean, boolean, boolean]> = {
  STRAIGHT: [true, false, true, false], // N-S
  CURVE: [true, true, false, false],    // N-E
  T_JUNCTION: [false, true, true, true], // E-S-W
  CROSS: [true, true, true, true],
};

export const INITIAL_DECK_SIZE = 15;

export const ACTION_TYPES: ActionType[] = ['PLACE', 'SHIFT', 'ROTATE', 'ADVANCE', 'ATTUNE'];

export const generateDeck = (): ActionCard[] => {
  // Return a fixed set of cards, one for each action type
  // This ensures "all options all the time" as requested
  return ACTION_TYPES.map((action) => ({
    id: `card-${action.toLowerCase()}`,
    actions: [action],
  }));
};
