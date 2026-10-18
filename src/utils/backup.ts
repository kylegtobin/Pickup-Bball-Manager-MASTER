import { GameState, NightSummary, Player, WaitingQueueItem } from '../types';
import { timeLeft } from './score';

export interface ParsedBackup {
  night: NightSummary;
  state: GameState | null; // Present when the backup was taken mid-night (Download backup in Recap)
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isCount = (x: unknown): x is number => isNum(x) && x >= 0 && Number.isInteger(x);
const isTime = (x: unknown) => x === null || isNum(x);
const isStrArr = (x: unknown) => Array.isArray(x) && x.every(v => typeof v === 'string');

const isRef = (x: unknown) => isObj(x) && isStr(x.id) && isStr(x.name);
const isPlayer = (x: unknown): x is Player => isRef(x) && ((x as Obj).rid === undefined || isStr((x as Obj).rid)) && ((x as Obj).away === undefined || isNum((x as Obj).away));
const isGroup = (x: unknown) => isObj(x) && x.type === 'PreviousTeam' && isStr(x.id) && Array.isArray(x.players) && x.players.length > 0 && x.players.length <= 5 && x.players.every(isPlayer);
// Decided the same way the app decides: a group says so with its type; a player has no type and no players
const isQueueItem = (x: unknown): x is WaitingQueueItem =>
  isObj(x) && (x.type === 'PreviousTeam' ? isGroup(x) : x.type === undefined && !('players' in x) && isPlayer(x));
const isScore = (x: unknown) => isObj(x) && isCount(x.champions) && isCount(x.challengers);
const isClock = (x: unknown) =>
  isObj(x) && isNum(x.lengthMs) && x.lengthMs > 0 && isNum(x.remainingMs) && x.remainingMs >= 0 && x.remainingMs <= x.lengthMs &&
  isTime(x.runningSince) && (x.buzzerScore === null || isScore(x.buzzerScore));

const isGame = (g: unknown) => {
  if (!isObj(g)) return false;
  if (!isCount(g.n) || !isNum(g.endedAt) || !isTime(g.startedAt ?? null)) return false;
  if (g.winner !== 'champions' && g.winner !== 'challengers') return false;
  if (!Array.isArray(g.winners) || !g.winners.every(isRef) || !Array.isArray(g.losers) || !g.losers.every(isRef)) return false;
  if (g.final !== undefined && !isScore(g.final)) return false;
  if (g.shootout !== undefined) {
    const s = g.shootout;
    if (!isObj(s) || !isCount(s.spots) || !Array.isArray(s.shooters) || !s.shooters.every(isRef) || !Array.isArray(s.picked) || !s.picked.every(isRef)) return false;
  }
  return true;
};

// The live part of a backup: every player and number has to make sense before it can go on the courts
const checkState = (s: unknown): string | null => {
  if (!isObj(s)) return 'missing';
  const teamOk = (t: unknown) => Array.isArray(t) && t.length <= 5 && t.every(isPlayer);
  if (!teamOk(s.champions) || !teamOk(s.challengers)) return 'teams';
  if (!Array.isArray(s.waitingQueue) || !s.waitingQueue.every(isQueueItem)) return 'line';
  if (s.score !== undefined && !isScore(s.score)) return 'score';
  if (s.clock !== undefined && !isClock(s.clock)) return 'clock';
  if (s.games !== undefined && (!Array.isArray(s.games) || !s.games.every(isGame))) return 'games';
  if (s.playersTonight !== undefined && !isStrArr(s.playersTonight)) return 'players';
  const isEntry = (e: unknown) => isObj(e) && isPlayer(e.player) && isNum(e.at) && isCount(e.index)
    && (e.from === 'champions' || e.from === 'challengers' || e.from === 'line')
    && (e.gameNo === undefined || isCount(e.gameNo)) && (e.spotFilled === undefined || typeof e.spotFilled === 'boolean')
    && (e.groupId === undefined || isStr(e.groupId)) && (e.behindId === undefined || e.behindId === null || isStr(e.behindId))
    && (e.teamIds === undefined || isStrArr(e.teamIds));
  if (s.sittingOut !== undefined && (!Array.isArray(s.sittingOut) || !s.sittingOut.every(isEntry))) return 'sitting';
  // Fields that can be empty must still be the right kind when they're there
  if (!isTime(s.gameStartTime ?? null) || !isTime(s.sessionStartedAt ?? null) || !isTime(s.lastResultAt ?? null)) return 'times';
  if (s.nightId !== undefined && s.nightId !== null && !isStr(s.nightId)) return 'night';
  if (s.bestStreak !== undefined && s.bestStreak !== null && !(isObj(s.bestStreak) && isCount(s.bestStreak.count) && isStrArr(s.bestStreak.names))) return 'streak';
  const isTracking = (r: unknown) => isObj(r) && isStr(r.playerId) && isCount(r.originalPosition) && (r.teamId === undefined || isStr(r.teamId));
  if (s.replacementTracking !== undefined && !(isObj(s.replacementTracking) && Array.isArray(s.replacementTracking.replacements) && s.replacementTracking.replacements.every(isTracking))) return 'tracking';
  // Working lists the rules use between steps
  const playerList = (x: unknown) => x === undefined || (Array.isArray(x) && x.every(isPlayer));
  if (!playerList(s.tempChampions) || !playerList(s.pendingIndividuals) || !playerList(s.selectedShootoutPlayers)) return 'working';
  if (s.tempQueueBeforeLosers !== undefined && !(Array.isArray(s.tempQueueBeforeLosers) && s.tempQueueBeforeLosers.every(isQueueItem))) return 'working';
  if (s.tempLosersToAdd !== undefined && s.tempLosersToAdd !== null && !isGroup(s.tempLosersToAdd)) return 'working';
  if (s.shootoutTeam !== undefined && s.shootoutTeam !== null && !isGroup(s.shootoutTeam)) return 'working';
  for (const k of ['championStreak', 'gamesPlayed', 'elapsedMinutes', 'requiredPlayers'] as const) {
    if (s[k] !== undefined && !isCount(s[k])) return k;
  }
  // Nobody can be in two places at once
  const ids = [
    ...(s.champions as Player[]), ...(s.challengers as Player[]),
    ...(s.waitingQueue as WaitingQueueItem[]).flatMap(i => ('players' in i ? i.players : [i])),
    ...((s.sittingOut as { player: Player }[] | undefined) ?? []).map(e => e.player),
  ].map(p => p.id);
  if (new Set(ids).size !== ids.length) return 'duplicates';
  return null;
};

// Checks a backup file made by this app and pulls out the night (and live state, if any).
export const parseBackup = (text: string): { ok: true; backup: ParsedBackup } | { ok: false; error: string } => {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a backup from this app." }; }
  if (!isObj(data) || data.app !== 'Pickup Basketball Manager' || data.kind !== 'night-backup') {
    return { ok: false, error: "That file isn't a backup from this app." };
  }
  if (typeof data.version !== 'number' || data.version > 1) return { ok: false, error: 'That backup is from a newer version of the app.' };
  const n = data.night;
  if (!isObj(n) || !Array.isArray(n.games) || !isStrArr(n.playersTonight) || !isCount(n.gamesPlayed)) {
    return { ok: false, error: 'That backup is missing the night it should contain.' };
  }
  if (!n.games.every(isGame)) return { ok: false, error: 'Some games in that backup look damaged.' };
  const night: NightSummary = {
    id: typeof n.id === 'string' && n.id !== '' && n.id !== 'tonight' ? n.id : `restored-${Number(n.startedAt) || Date.now()}`,
    startedAt: isNum(n.startedAt) ? n.startedAt : null,
    endedAt: isNum(n.endedAt) ? n.endedAt : Date.now(),
    gamesPlayed: n.gamesPlayed,
    playersTonight: n.playersTonight as string[],
    bestStreak: isObj(n.bestStreak) && isCount(n.bestStreak.count) && isStrArr(n.bestStreak.names)
      ? { count: n.bestStreak.count, names: n.bestStreak.names as string[] } : null,
    games: n.games as NightSummary['games'],
  };

  let state: GameState | null = null;
  if (data.state !== undefined && data.state !== null) {
    const problem = checkState(data.state);
    if (problem) return { ok: false, error: "The live part of that backup looks damaged, so it can't be picked back up." };
    state = data.state as GameState;
    // Older backups saved a running clock: stop it at the time left when the file was made
    const c = state.clock;
    if (c && c.runningSince !== null) {
      const madeAt = typeof data.exportedAt === 'string' ? Date.parse(data.exportedAt) : NaN;
      const at = Number.isFinite(madeAt) ? madeAt : c.runningSince;
      state = { ...state, clock: { ...c, remainingMs: timeLeft(c, at), runningSince: null } };
    }
  }
  return { ok: true, backup: { night, state } };
};
