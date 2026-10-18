import { GameState, GameRecord, Player, WaitingQueueItem } from '../types';
import { Score, Clock } from '../utils/score';

// What the phones see. Only what's on the courtside screen anyway: names, the line, the score.
// Nothing else from this device (saved regulars, undo steps, settings) ever leaves it.
export interface PublicPlayer { id: string; name: string }
export interface PublicGroup { type: 'PreviousTeam'; id: string; players: PublicPlayer[] }
export type PublicQueueItem = PublicPlayer | PublicGroup;

export interface PublicState {
  v: 1;
  sentAt: number; // The courtside screen's clock when this was sent, to line up clocks on the phone
  nightId: string | null;
  champions: PublicPlayer[];
  challengers: PublicPlayer[];
  waitingQueue: PublicQueueItem[];
  score: Score;
  clock: Clock;
  gameStartTime: number | null;
  championStreak: number;
  gamesPlayed: number;
  bestStreak: { count: number; names: string[] } | null;
  playersTonight: string[];
  sessionStartedAt: number | null;
  shootout: { spots: number; players: PublicPlayer[] } | null;
}

const player = (p: Player): PublicPlayer => ({ id: p.id, name: p.name });
const item = (i: WaitingQueueItem): PublicQueueItem =>
  'players' in i ? { type: 'PreviousTeam', id: i.id, players: i.players.map(player) } : player(i);

export const toPublicState = (s: GameState, now = Date.now()): PublicState => ({
  v: 1,
  sentAt: now,
  nightId: s.nightId,
  champions: s.champions.map(player),
  challengers: s.challengers.map(player),
  waitingQueue: s.waitingQueue.map(item),
  score: s.score,
  clock: s.clock,
  gameStartTime: s.gameStartTime,
  championStreak: s.championStreak,
  gamesPlayed: s.gamesPlayed,
  bestStreak: s.bestStreak,
  playersTonight: s.playersTonight,
  sessionStartedAt: s.sessionStartedAt,
  shootout: s.status === 'SHOOTOUT' && s.shootoutTeam ? { spots: s.requiredPlayers, players: s.shootoutTeam.players.map(player) } : null,
});

// Games without an id (older saves) get one from their number and time, so they can be matched up
export const gameId = (nightId: string, g: GameRecord) => (g.id ? g.id : `${nightId}-g${g.n}-${g.endedAt}`).slice(0, 64);

// Players in game results are named by what the phones already show (their name), never by the id this
// device keeps for a saved regular, so nothing private leaves the courtside computer.
const publicRef = (p: { name: string }) => ({ id: `name:${p.name.trim().toLowerCase()}`.slice(0, 90), name: p.name });

export const gamesForPush = (nightId: string, games: GameRecord[]) =>
  games.map(g => ({
    id: gameId(nightId, g),
    n: Math.max(1, g.n),
    startedAt: g.startedAt,
    endedAt: g.endedAt,
    winner: g.winner,
    winners: g.winners.map(publicRef),
    losers: g.losers.map(publicRef),
    ...(g.shootout ? { shootout: { spots: g.shootout.spots, shooters: g.shootout.shooters.map(publicRef), picked: g.shootout.picked.map(publicRef) } } : {}),
    ...(g.final ? { final: g.final } : {}),
    ...(g.endedBy ? { endedBy: g.endedBy } : {}),
  }));

export type PushGame = ReturnType<typeof gamesForPush>[number];

// Changes whenever anything sent about the games changes (a result, an undo, a corrected score, shootout picks)
export const gamesSignature = (games: PushGame[]) => JSON.stringify(games);
