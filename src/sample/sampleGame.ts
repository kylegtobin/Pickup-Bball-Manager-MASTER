import { v4 as uuidv4 } from 'uuid';
import { GameState, Player } from '../types';

// Made-up names only. Never put real players here.
const SAMPLE_CHAMPIONS = ['Marcus', 'Dev', 'Theo', 'Andre', 'Luis'];
const SAMPLE_CHALLENGERS = ['Sam', 'Jordan', 'Nate', 'Chris', 'Omar'];
const SAMPLE_WAITING = ['Ben', 'Rico', 'Tyler', 'Kofi', 'Matt', 'Eli', 'Jay'];

const toPlayers = (names: string[]): Player[] => names.map(name => ({ id: uuidv4(), name }));

export const isSampleLink = (): boolean =>
  new URLSearchParams(window.location.search).get('sample') === '1';

// Fresh state each call, so Reset gets new IDs and a clean game.
export const createSampleGameState = (): Partial<GameState> => ({
  champions: toPlayers(SAMPLE_CHAMPIONS),
  challengers: toPlayers(SAMPLE_CHALLENGERS),
  waitingQueue: toPlayers(SAMPLE_WAITING),
  status: 'READY',
});
