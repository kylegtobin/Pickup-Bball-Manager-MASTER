import { Score, Clock, EndedBy } from '../utils/score';

export interface Player {
  id: string;
  name: string;
  rid?: string; // Stable id of this player across nights (a saved regular on this device)
}

// A saved regular: someone who has signed in on this device before
export interface Regular {
  id: string;
  name: string;
  nights: number;
  lastNight: string | number | null; // id of the last night they signed in (older saves used a timestamp)
}

// A finished night kept in this device's archive
export interface NightSummary {
  id: string;
  startedAt: number | null;
  endedAt: number;
  gamesPlayed: number;
  playersTonight: string[];
  bestStreak: { count: number; names: string[] } | null;
  games: GameRecord[];
}

// Who played in a finished game. id is the stable regular id when there is one.
export interface PlayerRef {
  id: string;
  name: string;
}

export interface GameRecord {
  id?: string; // Stable id for this game (older saves don't have one)
  n: number; // Game number tonight, starting at 1
  startedAt: number | null;
  endedAt: number;
  winner: 'champions' | 'challengers';
  winners: PlayerRef[];
  losers: PlayerRef[];
  // The shootout that followed this game, if there was one
  shootout?: { spots: number; shooters: PlayerRef[]; picked: PlayerRef[] };
  // Final score when it was kept (sides as they were during the game), and how it ended
  final?: Score;
  endedBy?: EndedBy;
}

// Someone stepping off for a bit (water, a call, a tweak). They keep their name, not their spot on court.
export interface SittingOut {
  player: Player;
  at: number; // When they sat down
  from: 'champions' | 'challengers' | 'line';
  index: number; // Their place in line when they sat down (line only)
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
  games: GameRecord[]; // Every finished game tonight, in order
  nightId: string | null; // Stable id for tonight, set at the first sign-in
  sittingOut: SittingOut[]; // Here tonight but off the court and out of the line for now
  // Scoreboard for the game being played
  score: Score;
  clock: Clock;
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
