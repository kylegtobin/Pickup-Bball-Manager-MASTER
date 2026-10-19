import { GameRecord } from '../types';

export interface Leader { names: string[]; count: number }

// Per-player totals for one night, worked out from the game log
export const playerTotals = (games: GameRecord[]) => {
  const totals = new Map<string, { name: string; games: number; wins: number }>();
  const bump = (id: string, name: string, won: boolean) => {
    const t = totals.get(id) ?? { name, games: 0, wins: 0 };
    t.games += 1;
    if (won) t.wins += 1;
    t.name = name;
    totals.set(id, t);
  };
  games.forEach(g => {
    g.winners.forEach(p => bump(p.id, p.name, true));
    g.losers.forEach(p => bump(p.id, p.name, false));
  });
  return Array.from(totals.values());
};

const leader = (rows: { name: string; n: number }[]): Leader | null => {
  const top = Math.max(0, ...rows.map(r => r.n));
  if (top === 0) return null;
  const names = rows.filter(r => r.n === top).map(r => r.name);
  // A team of 5 can share it; more than that (half the gym) isn't much of a shout-out
  if (names.length > 5) return null;
  return { count: top, names };
};

export const nightLeaders = (games: GameRecord[]) => {
  const rows = playerTotals(games);
  return {
    mostWins: leader(rows.map(r => ({ name: r.name, n: r.wins }))),
    mostGames: leader(rows.map(r => ({ name: r.name, n: r.games }))),
  };
};

// Names for an award, the same everywhere (the recap image, the recap and the phone's awards card):
// "Ben", "Ben & Rico", then "Ben + 4 more" once there are 3 or more. Alphabetical, so the same players
// always read the same way wherever they show up.
export const awardNames = (list: string[]) => {
  const names = [...list].sort((a, b) => a.localeCompare(b));
  return names.length <= 1 ? (names[0] ?? '') : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} +\u00A0${names.length - 1}\u00A0more`; // "+ 4 more" never splits across lines
};

// "Ben", "Ben & Rico", "Ben, Rico & 2 more"
export const joinNames = (names: string[], max = 3) => {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  return `${names.slice(0, max - 1).join(', ')} & ${names.length - (max - 1)} more`;
};
