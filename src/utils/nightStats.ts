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
  return { count: top, names: rows.filter(r => r.n === top).map(r => r.name) };
};

export const nightLeaders = (games: GameRecord[]) => {
  const rows = playerTotals(games);
  return {
    mostWins: leader(rows.map(r => ({ name: r.name, n: r.wins }))),
    mostGames: leader(rows.map(r => ({ name: r.name, n: r.games }))),
  };
};

// "Ben", "Ben & Rico", "Ben, Rico & 2 more"
export const joinNames = (names: string[], max = 3) => {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  return `${names.slice(0, max - 1).join(', ')} & ${names.length - (max - 1)} more`;
};
