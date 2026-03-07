export type PlayerId = 1 | 2;
export type Color = 'red' | 'blue' | 'neutral';
export type TileType = 'STRAIGHT' | 'CURVE' | 'T_JUNCTION' | 'CROSS';
export type Direction = 0 | 90 | 180 | 270;

export interface Position {
  row: number;
  col: number;
}

export interface Tile {
  id: string;
  type: TileType;
  rotation: Direction;
  color: Color;
  hasResonator: boolean;
  resonatorOwner?: PlayerId;
  playersPresent: PlayerId[]; // Meeples on this tile
}

export interface Player {
  id: PlayerId;
  name: string;
  color: 'red' | 'blue';
  homeRow: number;
  goalRow: number;
  resonators: number; // Count of available resonators
  position: Position | null; // Null if not on board yet (start at home edge)
}

export type ActionType = 'PLACE' | 'SHIFT' | 'ROTATE' | 'ADVANCE' | 'ATTUNE';

export interface ActionCard {
  id: string;
  actions: ActionType[];
}

export type GameMode = 'PVP' | 'PVAI';

export interface GameState {
  mode: GameMode;
  board: (Tile | null)[][];
  players: Record<PlayerId, Player>;
  activePlayer: PlayerId;
  turn: number;
  actionsRemaining: number;
  deck: ActionCard[];
  faceUpCards: ActionCard[];
  selectedCardId: string | null;
  selectedActionIndex: number | null; // 0 or 1
  winner: PlayerId | null;
  winReason: string | null;
  powerWells: Position[];
  capturedWells: { [key: string]: PlayerId }; // "row,col" -> PlayerId
  showGuide: boolean;
}
