export interface Player {
  id: string;
  name: string;
}

export interface PreviousTeam {
  type: 'PreviousTeam';
  id: string;
  players: Player[];
}

export type WaitingQueueItem = Player | PreviousTeam;

export const isPreviousTeam = (item: WaitingQueueItem): item is PreviousTeam => {
  return 'players' in item;
};

export type GameStatus = 
  | 'INITIAL'
  | 'READY'
  | 'PENDING_QUEUE_UPDATE'
  | 'FORMING_CHALLENGERS'
  | 'WAITING_FOR_PLAYERS'
  | 'SHOOTOUT'
  | 'WAITING_FOR_MANUAL_REPLACEMENT';

export interface GameState {
  champions: Player[];
  challengers: Player[];
  waitingQueue: WaitingQueueItem[];
  manualMode: boolean;
  showShootoutModal: boolean;
  shootoutTeam: PreviousTeam | null;
  requiredPlayers: number;
  pendingIndividuals: Player[];
  status: GameStatus;
  notification: { message: string; type: 'success' | 'error' | 'info' } | null;
  tempChampions: Player[];
  tempLosersToAdd: PreviousTeam | null;
  tempQueueBeforeLosers: WaitingQueueItem[];
  selectedShootoutPlayers: Player[];
  replacementTracking: {
    replacements: {
      playerId: string;
      originalPosition: number;
      teamId?: string;  // If they were in a Previous Team
    }[];
  };
  gameStartTime: number | null; // Timestamp when game started
  elapsedMinutes: number; // Minutes elapsed in the current game (capped at 12)
  // Tonight's story, for the win streak badge and the recap
  championStreak: number; // Wins in a row by the team currently holding Champions
  gamesPlayed: number;
  bestStreak: { count: number; names: string[] } | null;
  sessionStartedAt: number | null; // First sign-in of the night
  lastResultAt: number | null;
  playersTonight: string[]; // Everyone who signed in tonight, even if they left
}

// New wait time related types
export type GamesBehindCategory = 
  | 1
  | '1-2'
  | 2
  | '2-3'
  | 3
  | '3-4'
  | 4 
  | '4-5'
  | '5+';

export interface WaitTimeInfo {
  gamesBehind: GamesBehindCategory;
  waitMinutes: number;
  color: string;
}
