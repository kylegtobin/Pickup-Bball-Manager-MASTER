import { GameState, NightSummary } from '../types';

export interface ParsedBackup {
  night: NightSummary;
  state: GameState | null; // Present when the backup was taken mid-night (Download backup in Recap)
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isStrArr = (x: unknown) => Array.isArray(x) && x.every(v => typeof v === 'string');

// Checks a backup file made by this app and pulls out the night (and live state, if any).
export const parseBackup = (text: string): { ok: true; backup: ParsedBackup } | { ok: false; error: string } => {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a backup from this app." }; }
  if (!isObj(data) || data.app !== 'Pickup Basketball Manager' || data.kind !== 'night-backup') {
    return { ok: false, error: "That file isn't a backup from this app." };
  }
  if (typeof data.version !== 'number' || data.version > 1) return { ok: false, error: 'That backup is from a newer version of the app.' };
  const n = data.night;
  if (!isObj(n) || !Array.isArray(n.games) || !isStrArr(n.playersTonight) || typeof n.gamesPlayed !== 'number') {
    return { ok: false, error: 'That backup is missing the night it should contain.' };
  }
  const gamesOk = (n.games as unknown[]).every(g => isObj(g) && Array.isArray(g.winners) && Array.isArray(g.losers) && (g.winner === 'champions' || g.winner === 'challengers'));
  if (!gamesOk) return { ok: false, error: 'Some games in that backup look damaged.' };
  const night: NightSummary = {
    id: typeof n.id === 'string' && n.id !== 'tonight' ? n.id : `restored-${Number(n.startedAt) || Date.now()}`,
    startedAt: typeof n.startedAt === 'number' ? n.startedAt : null,
    endedAt: typeof n.endedAt === 'number' ? n.endedAt : Date.now(),
    gamesPlayed: n.gamesPlayed as number,
    playersTonight: n.playersTonight as string[],
    bestStreak: isObj(n.bestStreak) && typeof n.bestStreak.count === 'number' && isStrArr(n.bestStreak.names)
      ? { count: n.bestStreak.count as number, names: n.bestStreak.names as string[] } : null,
    games: n.games as NightSummary['games'],
  };
  const s = data.state;
  const state = isObj(s) && Array.isArray(s.champions) && Array.isArray(s.challengers) && Array.isArray(s.waitingQueue)
    ? (s as unknown as GameState) : null;
  return { ok: true, backup: { night, state } };
};
