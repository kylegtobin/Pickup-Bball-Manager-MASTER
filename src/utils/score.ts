// House scoring rules: buckets are 1s and 2s, first to 11 win by 2, 15 or more ends it,
// games are 12 minutes. When time runs out the team ahead wins; tied means next bucket wins.

export type Side = 'champions' | 'challengers';
export interface Score { champions: number; challengers: number }
export interface Clock {
  lengthMs: number;
  remainingMs: number; // Time left when the clock last stopped (or started)
  runningSince: number | null; // When it was last started, null while stopped
  buzzerScore: Score | null; // The score when time ran out, null until then
}
export type EndedBy = 'points' | 'cap' | 'time' | 'sudden' | 'manual';

export const TARGET = 11;
export const CAP = 15;
export const WIN_BY = 2;
export const GAME_MS = 12 * 60 * 1000;

export const newScore = (): Score => ({ champions: 0, challengers: 0 });
export const newClock = (): Clock => ({ lengthMs: GAME_MS, remainingMs: GAME_MS, runningSince: null, buzzerScore: null });

export const timeLeft = (clock: Clock, now = Date.now()): number =>
  clock.runningSince === null ? clock.remainingMs : Math.max(0, clock.remainingMs - (now - clock.runningSince));

export const clockState = (clock: Clock, now = Date.now()): 'not-started' | 'running' | 'paused' | 'time' => {
  if (clock.buzzerScore || timeLeft(clock, now) === 0) return 'time';
  if (clock.runningSince !== null) return 'running';
  return clock.remainingMs === clock.lengthMs ? 'not-started' : 'paused';
};

export const formatClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export interface Outcome {
  winner: Side | null;
  endedBy: EndedBy | null;
  nextBucket: boolean; // Time is up and it's tied: next basket wins
}

// Who has won, if anyone, from the score and whether time is up.
export const decide = (score: Score, clock: Clock, now = Date.now()): Outcome => {
  const { champions: a, challengers: b } = score;
  const lead: Side | null = a > b ? 'champions' : b > a ? 'challengers' : null;
  const top = Math.max(a, b);
  const timeUp = !!clock.buzzerScore || timeLeft(clock, now) === 0;
  const buzzer = clock.buzzerScore;
  // Tied when time ran out: whatever the score, the next bucket decides it
  if (timeUp && buzzer && buzzer.champions === buzzer.challengers) {
    return lead ? { winner: lead, endedBy: 'sudden', nextBucket: false } : { winner: null, endedBy: null, nextBucket: true };
  }
  if (top >= CAP && lead) return { winner: lead, endedBy: 'cap', nextBucket: false };
  if (top >= TARGET && Math.abs(a - b) >= WIN_BY && lead) return { winner: lead, endedBy: 'points', nextBucket: false };
  if (timeUp) return lead ? { winner: lead, endedBy: 'time', nextBucket: false } : { winner: null, endedBy: null, nextBucket: true };
  return { winner: null, endedBy: null, nextBucket: false };
};

export const endedByText = (e: EndedBy | null | undefined) =>
  e === 'cap' ? 'first to 15' : e === 'time' ? 'on time' : e === 'sudden' ? 'next bucket after time' : e === 'points' ? 'win by 2' : '';
