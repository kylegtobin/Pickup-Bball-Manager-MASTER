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
}
