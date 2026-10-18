// The night's rules that don't need React: who's where, open spots, sitting out, and what gets saved.
// GameContext uses these; keeping them here makes them easy to test and, later, to share with the server.
import { v4 as uuidv4 } from 'uuid';
import { Player, PreviousTeam, WaitingQueueItem, GameState, Regular, PlayerRef, NightSummary, SittingOut } from '../types';
import { Side, newScore, newClock, timeLeft } from '../utils/score';

// Helper function to check if an item is a PreviousTeam
export const isPreviousTeam = (item: WaitingQueueItem): item is PreviousTeam => {
  return typeof item === 'object' && item !== null && 'type' in item && item.type === 'PreviousTeam';
};

// Helper function to check for duplicate player IDs across all teams and queue
export const checkForDuplicatePlayers = (state: GameState): { hasDuplicates: boolean, duplicateIds: string[] } => {
  const allPlayers: Player[] = [];
  const playerIds = new Set<string>();
  const duplicateIds: string[] = [];
  
  // Add champions
  state.champions.forEach(player => {
    if (playerIds.has(player.id)) {
      duplicateIds.push(player.id);
    } else {
      playerIds.add(player.id);
    }
    allPlayers.push(player);
  });
  
  // Add challengers
  state.challengers.forEach(player => {
    if (playerIds.has(player.id)) {
      duplicateIds.push(player.id);
    } else {
      playerIds.add(player.id);
    }
    allPlayers.push(player);
  });
  
  // Add waiting queue
  state.waitingQueue.forEach(item => {
    if (!isPreviousTeam(item)) {
      // Individual player
      if (playerIds.has(item.id)) {
        duplicateIds.push(item.id);
      } else {
        playerIds.add(item.id);
      }
      allPlayers.push(item);
    } else {
      // Team of players
      item.players.forEach(player => {
        if (playerIds.has(player.id)) {
          duplicateIds.push(player.id);
        } else {
          playerIds.add(player.id);
        }
        allPlayers.push(player);
      });
    }
  });
  
  return { 
    hasDuplicates: duplicateIds.length > 0,
    duplicateIds
  };
};

// Helper function to create a deep clone of a player with a new ID
export const clonePlayerWithNewId = (player: Player): Player => {
  return {
    ...player,
    id: uuidv4() // Generate a new ID to ensure uniqueness
  };
};


export const defaultGameState: GameState = {
  champions: [],
  challengers: [],
  waitingQueue: [],
  manualMode: false,
  showShootoutModal: false,
  shootoutTeam: null,
  requiredPlayers: 0,
  pendingIndividuals: [],
  status: 'INITIAL', 
  tempChampions: [],
  tempLosersToAdd: null,
  tempQueueBeforeLosers: [],
  notification: null,
  selectedShootoutPlayers: [],
  replacementTracking: {
    replacements: []
  },
  gameStartTime: null,
  elapsedMinutes: 0,
  championStreak: 0,
  gamesPlayed: 0,
  bestStreak: null,
  sessionStartedAt: null,
  lastResultAt: null,
  playersTonight: [],
  games: [],
  nightId: null,
  sittingOut: [],
  score: newScore(),
  clock: newClock()
};

// PENDING_QUEUE_UPDATE and FORMING_CHALLENGERS only exist for a moment while a result is processed.
export const isStable = (status: GameState['status']) =>
  status !== 'PENDING_QUEUE_UPDATE' && status !== 'FORMING_CHALLENGERS';

export const countPlayers = (s: GameState) =>
  s.champions.length + s.challengers.length +
  s.waitingQueue.reduce((n, item) => n + (isPreviousTeam(item) ? item.players.length : 1), 0);

// A night worth keeping: anyone signed in, or any game played, even if everyone has gone home
export const hasNight = (s: GameState) => countPlayers(s) > 0 || s.games.length > 0 || s.playersTonight.length > 0;

// Who is where. Undo records a step whenever this changes (not on clock ticks or mode switches).
// The game count is part of it, so a result is always a step even when nobody moves
// (with exactly 10 players, a Champions win puts the same two teams right back on).
export const rosterSignature = (s: GameState) => JSON.stringify([
  s.games.length,
  s.score.champions,
  s.score.challengers,
  s.champions.map(p => p.id),
  s.challengers.map(p => p.id),
  s.waitingQueue.map(item => (isPreviousTeam(item) ? [item.id, item.players.map(p => (p.away ? `~${p.id}` : p.id))] : item.away ? `~${item.id}` : item.id)),
  (s.sittingOut ?? []).map(e => e.player.id),
]);

// Someone in line who could step onto the court right now (not sitting out)
export const hasAvailableWaiter = (s: GameState) =>
  s.waitingQueue.some(item => (isPreviousTeam(item) ? item.players.some(p => !p.away) : !item.away));

// After anyone sits out, comes back, leaves or signs in: if a team is short, either the runner moves
// someone up from the line (when someone's available) or new sign-ins fill it (when nobody is).
// Nobody who signs in can jump ahead of people already waiting.
// Worked out from the lineup itself every time, never from an older status, so moves, Undo and
// older saves all end up following the same rule.
export const reconcileVacancy = (s: GameState): GameState => {
  const settable = s.status === 'INITIAL' || s.status === 'WAITING_FOR_PLAYERS' || s.status === 'WAITING_FOR_MANUAL_REPLACEMENT' || s.status === 'READY';
  if (!settable) return s;
  const full = s.champions.length === 5 && s.challengers.length === 5;
  if (full) {
    // Both teams are complete again: the game is on (manual mode stays as the runner left it)
    return s.status === 'READY' ? s : { ...s, status: 'READY' };
  }
  // Someone available to move up: arranging controls on, so the runner can place them (also after a restore)
  if (hasAvailableWaiter(s)) return s.status === 'WAITING_FOR_MANUAL_REPLACEMENT' && s.manualMode ? s : { ...s, status: 'WAITING_FOR_MANUAL_REPLACEMENT', manualMode: true };
  if (s.status === 'WAITING_FOR_MANUAL_REPLACEMENT') return { ...s, status: 'INITIAL', manualMode: false };
  if (s.status === 'READY') return { ...s, status: 'INITIAL' };
  return s;
};

// Sign-ins (or someone coming back) may go straight onto a short team only when nobody available is waiting
export const canFillDirectly = (s: GameState) =>
  (s.champions.length < 5 || s.challengers.length < 5) && !hasAvailableWaiter(s) &&
  (s.status === 'INITIAL' || s.status === 'WAITING_FOR_PLAYERS' || s.status === 'WAITING_FOR_MANUAL_REPLACEMENT' || s.status === 'READY');

// Saves from before Oct 18 kept people who sat out in line in a separate list, and court spots without
// a record of whether they were filled. Line sitters go back into the line (at the end, still sitting
// out); court spots whose history isn't known can't be claimed back.
export const migrateSitters = (s: GameState): GameState => {
  const list = s.sittingOut ?? [];
  if (!list.some(e => e.from === 'line' || e.spotFilled === undefined)) return { ...s, sittingOut: list };
  const toLine = list.filter(e => e.from === 'line').map(e => ({ ...e.player, away: e.player.away ?? e.at }));
  const court = list.filter(e => e.from !== 'line').map(e => (e.spotFilled === undefined ? { ...e, spotFilled: true } : e));
  return { ...s, sittingOut: court, waitingQueue: [...s.waitingQueue, ...toLine] };
};

export const ref = (p: Player): PlayerRef => ({ id: p.rid ?? p.id, name: p.name });

export const summarize = (s: GameState): NightSummary => ({
  id: s.nightId ?? uuidv4(),
  startedAt: s.sessionStartedAt,
  endedAt: Date.now(),
  gamesPlayed: s.gamesPlayed,
  playersTonight: s.playersTonight,
  bestStreak: s.bestStreak,
  games: s.games,
});

// Marks time up on the clock if the 12 minutes have run out (keeps the score at the buzzer)
export const withBuzzer = (prev: GameState, now: number) => {
  const c = prev.clock;
  if (c.buzzerScore || timeLeft(c, now) > 0) return c;
  return { ...c, remainingMs: 0, runningSince: null, buzzerScore: { ...prev.score } };
};
// The night with the clock stopped at the time left as of `at`, so a backup never loses or gains time
export const pausedSnapshot = (s: GameState, at = Date.now()): GameState => {
  const c = s.clock;
  return c.runningSince === null ? s : { ...s, clock: { ...c, remainingMs: timeLeft(c, at), runningSince: null } };
};

// A night from outside the app (a backup): anything missing or of the wrong kind falls back to the
// default, so a damaged field can't crash the app later
export const withDefaults = (raw: Partial<GameState>): GameState => {
  const out = { ...defaultGameState } as Record<string, unknown>;
  const src = raw as Record<string, unknown>;
  (Object.keys(defaultGameState) as (keyof GameState)[]).forEach(k => {
    const v = src[k];
    const d = defaultGameState[k] as unknown;
    if (v === undefined || v === null) return;
    if (d === null) { out[k] = v; return; } // nullable fields are checked by the backup reader
    if (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d && !Array.isArray(v)) out[k] = v;
  });
  const rt = out.replacementTracking as { replacements?: unknown };
  if (!rt || !Array.isArray(rt.replacements)) out.replacementTracking = { replacements: [] };
  return out as unknown as GameState;
};

export const everyoneIn = (s: GameState): Player[] => [
  ...s.champions, ...s.challengers,
  ...s.waitingQueue.flatMap(item => (isPreviousTeam(item) ? item.players : [item])),
  ...(s.sittingOut ?? []).map(e => e.player),
];

// Takes someone out of the line (or their group), wherever they are in it
export const removeFromLine = (s: GameState, playerId: string): GameState => ({
  ...s,
  waitingQueue: s.waitingQueue.flatMap((item): WaitingQueueItem[] => {
    if (!isPreviousTeam(item)) return item.id === playerId ? [] : [item];
    const players = item.players.filter(p => p.id !== playerId);
    return players.length === 0 ? [] : [players.length === item.players.length ? item : { ...item, players }];
  }),
});

// Someone new took an open spot on this team: the oldest unfilled spot from this game is no longer
// waiting for the person who sat out from it
export const markSpotFilled = (s: GameState, side: Side): GameState => {
  const list = s.sittingOut ?? [];
  const i = list.findIndex(e => e.from === side && e.gameNo === s.games.length && e.spotFilled === false);
  if (i < 0) return s;
  return { ...s, sittingOut: list.map((e, j) => (j === i ? { ...e, spotFilled: true } : e)) };
};

// Matches people from a backup to the names saved on this device (same id, or else same name)
export const reconcileRegulars = (regulars: Regular[], people: PlayerRef[], nightId: string | null) => {
  const map: Record<string, string> = {};
  const added: Regular[] = [];
  people.forEach(p => {
    if (map[p.id] !== undefined) return;
    const byId = regulars.find(r => r.id === p.id) ?? added.find(r => r.id === p.id);
    if (byId) { map[p.id] = byId.id; return; }
    const byName = regulars.find(r => r.name.toLowerCase() === p.name.toLowerCase()) ?? added.find(r => r.name.toLowerCase() === p.name.toLowerCase());
    if (byName) { map[p.id] = byName.id; return; }
    added.push({ id: p.id, name: p.name, nights: 1, lastNight: nightId });
    map[p.id] = p.id;
  });
  return { map, added };
};

export const remapRef = (map: Record<string, string>) => (r: PlayerRef): PlayerRef => ({ ...r, id: map[r.id] ?? r.id });
export const remapNight = (night: NightSummary, map: Record<string, string>): NightSummary => {
  const m = remapRef(map);
  return {
    ...night,
    games: night.games.map(g => ({
      ...g,
      winners: g.winners.map(m),
      losers: g.losers.map(m),
      shootout: g.shootout ? { ...g.shootout, shooters: g.shootout.shooters.map(m), picked: g.shootout.picked.map(m) } : g.shootout,
    })),
  };
};

// Where someone coming back from sitting out belongs:
// - their own spot on court, only during the same game and only if nobody has taken it
// - their waiting group, if it's still in line (so a shootout still applies to them)
// - just ahead of whoever was behind them, if that person is still waiting
// - otherwise the end of the line (their turn came and went while they sat)
export const placeReturning = (s: GameState, e: SittingOut):
  { where: 'court' } | { where: 'group'; groupId: string } | { where: 'before'; beforeId: string } | { where: 'end' } => {
  if (e.from !== 'line') {
    const team = s[e.from];
    const sameGame = e.gameNo === undefined || e.gameNo === s.games.length;
    const untouched = e.spotFilled === undefined
      ? !e.teamIds || team.every(p => e.teamIds!.includes(p.id)) // older saves
      : !e.spotFilled;
    if (sameGame && untouched && team.length < 5) return { where: 'court' };
    return { where: 'end' };
  }
  if (e.groupId) {
    const g = s.waitingQueue.find(item => isPreviousTeam(item) && item.id === e.groupId) as PreviousTeam | undefined;
    if (g && g.players.length < 5 && s.shootoutTeam?.id !== g.id) return { where: 'group', groupId: g.id };
    return { where: 'end' };
  }
  if (e.behindId) {
    if (s.waitingQueue.some(item => item.id === e.behindId)) return { where: 'before', beforeId: e.behindId };
    return { where: 'end' };
  }
  return { where: 'end' };
};
