import { SUPABASE_URL, SUPABASE_KEY } from './config';
import { PublicState } from './publicState';
import { GameRecord, PlayerRef } from '../types';
import { Score, EndedBy } from '../utils/score';

// What the phone page gets for a run link. Plain fetch, no sign-in, no extra library.

export interface ViewGame {
  id: string;
  nightId: string;
  n: number;
  endedAt: number;
  winner: 'champions' | 'challengers';
  winners: PlayerRef[];
  losers: PlayerRef[];
  final?: Score;
  endedBy?: EndedBy;
  shootout?: GameRecord['shootout'];
}

export interface RunView {
  run: { name: string; gym: string | null; courtSeenAt: number | null; code: string | null };
  night: { id: string; state: PublicState | null; updatedAt: number; startedAt: number | null; endedAt: number | null } | null;
  games: ViewGame[]; // newest first
  // How far this phone's clock is from the courtside screen's: add to a courtside time to get phone time
  skewMs: number;
  serverOffsetMs: number; // add to a server time to get phone time
  receivedAt: number;
}

const ms = (x: unknown): number | null => {
  if (typeof x !== 'string' && typeof x !== 'number') return null;
  const t = typeof x === 'number' ? x : Date.parse(x);
  return Number.isFinite(t) ? t : null;
};
const refs = (x: unknown): PlayerRef[] =>
  Array.isArray(x) ? x.filter(p => p && typeof p.id === 'string' && typeof p.name === 'string').map(p => ({ id: p.id, name: p.name })) : [];

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Turn the database's answer into what the page shows. Anything odd is dropped rather than trusted.
export const parseRunView = (raw: Raw | null, phoneNow = Date.now()): RunView | null => {
  if (!raw || typeof raw !== 'object' || !raw.run) return null;
  const serverTime = ms(raw.serverTime) ?? phoneNow;
  const n = raw.night;
  const state = n && n.state && typeof n.state === 'object' && n.state.v === 1 ? (n.state as PublicState) : null;
  const updatedAt = n ? ms(n.updatedAt) ?? serverTime : serverTime;
  // Courtside time → server time (when it was saved) → phone time
  const skewMs = state && Number.isFinite(state.sentAt) ? (updatedAt - state.sentAt) + (phoneNow - serverTime) : 0;
  const games: ViewGame[] = Array.isArray(raw.games) ? raw.games
    .filter((g: Raw) => g && typeof g.id === 'string' && (g.winner === 'champions' || g.winner === 'challengers'))
    .map((g: Raw) => ({
      id: g.id,
      nightId: String(g.nightId ?? ''),
      n: Number(g.n) || 0,
      endedAt: ms(g.endedAt) ?? 0,
      winner: g.winner,
      winners: refs(g.winners),
      losers: refs(g.losers),
      ...(g.final && Number.isFinite(g.final.champions) && Number.isFinite(g.final.challengers) ? { final: { champions: g.final.champions, challengers: g.final.challengers } } : {}),
      ...(typeof g.endedBy === 'string' ? { endedBy: g.endedBy as EndedBy } : {}),
      ...(g.shootout && Array.isArray(g.shootout.picked) ? { shootout: { spots: Number(g.shootout.spots) || 0, shooters: refs(g.shootout.shooters), picked: refs(g.shootout.picked) } } : {}),
    })) : [];
  return {
    run: { name: String(raw.run.name ?? 'Pickup run'), gym: raw.run.gym ? String(raw.run.gym) : null, courtSeenAt: ms(raw.run.courtSeenAt),
      code: typeof raw.run.code === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(raw.run.code) ? raw.run.code : null },
    night: n ? { id: String(n.id), state, updatedAt, startedAt: ms(n.startedAt), endedAt: ms(n.endedAt) } : null,
    games,
    skewMs,
    serverOffsetMs: phoneNow - serverTime,
    receivedAt: phoneNow,
  };
};

export type FetchResult = { ok: true; view: RunView } | { ok: false; reason: 'gone' | 'offline' };

export const fetchRunView = async (token: string, fetcher: typeof fetch = fetch): Promise<FetchResult> => {
  try {
    const res = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/get_run_view`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, reason: 'offline' };
    const raw = await res.json();
    const view = parseRunView(raw);
    return view ? { ok: true, view } : { ok: false, reason: 'gone' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
};

// A run found by its 6-character code, or the site's home run. Either way the answer includes the run's
// link token, so the phone can keep following that run by its link.
export type FindResult = { ok: true; token: string } | { ok: false; reason: 'none' | 'offline' };
const find = async (fn: string, body: object, fetcher: typeof fetch): Promise<FindResult> => {
  try {
    const res = await fetcher(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return { ok: false, reason: 'offline' };
    const raw = await res.json();
    const token = raw && typeof raw.token === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(raw.token) ? raw.token : null;
    return token ? { ok: true, token } : { ok: false, reason: 'none' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
};
// Letters and digits that can't be mixed up: no I, O, 0 or 1
export const normalizeCode = (typed: string) => typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const looksLikeCode = (typed: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(normalizeCode(typed));
export const findRunByCode = (code: string, fetcher: typeof fetch = fetch) => find('get_run_view_by_code', { p_code: normalizeCode(code) }, fetcher);
export const findHomeRun = (fetcher: typeof fetch = fetch) => find('get_home_run_view', {}, fetcher);

// Player totals across games, matched by name (the same person on a different night is the same name)
export interface Totals { name: string; games: number; wins: number }
export const totalsByName = (games: { winners: PlayerRef[]; losers: PlayerRef[] }[]): Totals[] => {
  const m = new Map<string, Totals>();
  const bump = (p: PlayerRef, won: boolean) => {
    const k = p.name.trim().toLowerCase();
    if (!k) return;
    const t = m.get(k) ?? { name: p.name.trim(), games: 0, wins: 0 };
    t.games += 1;
    if (won) t.wins += 1;
    m.set(k, t);
  };
  games.forEach(g => { g.winners.forEach(p => bump(p, true)); g.losers.forEach(p => bump(p, false)); });
  return Array.from(m.values()).sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));
};
