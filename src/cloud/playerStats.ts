import { ViewGame } from './runView';

// Player stats for the phone page, worked out from the recorded games. Players are matched by name
// (first name and last initial), so the same name on another night is the same person.

export interface PlayerLine {
  key: string; // lowercase name
  name: string;
  games: number;
  wins: number;
  losses: number;
  winPct: number; // 0-100, rounded
  days: number; // nights they played at least one game
  bestStreak: number; // most wins in a row within one night
  mostWinsInNight: number;
  winsAsChallengers: number; // beat the team holding the court
  shootouts: number; // times they shot
  shootoutsPicked: number; // times they got a spot
  scoredGames: number; // games where someone kept score
  pointsFor: number; // team points while they played (scored games only)
  pointsAgainst: number;
  closeWins: number; // won by 2 or fewer (scored games only)
  closeLosses: number;
  together: { name: string; wins: number } | null; // most wins with one teammate (2 or more)
}

const keyOf = (name: string) => name.trim().toLowerCase();
const pct = (w: number, g: number) => (g ? Math.round((w / g) * 100) : 0);

// Oldest first, so streaks read in the order games were played
const chronological = (games: ViewGame[]) =>
  [...games].sort((a, b) => a.endedAt - b.endedAt || a.n - b.n);

export const playerLines = (games: ViewGame[]): PlayerLine[] => {
  const lines = new Map<string, PlayerLine>();
  const nights = new Map<string, Set<string>>();
  const nightWins = new Map<string, Map<string, number>>(); // player -> night -> wins
  const run = new Map<string, { night: string; streak: number }>();
  const mates = new Map<string, Map<string, { name: string; wins: number }>>();

  const line = (name: string): PlayerLine => {
    const k = keyOf(name);
    let l = lines.get(k);
    if (!l) {
      l = { key: k, name: name.trim(), games: 0, wins: 0, losses: 0, winPct: 0, days: 0, bestStreak: 0, mostWinsInNight: 0, winsAsChallengers: 0,
        shootouts: 0, shootoutsPicked: 0, scoredGames: 0, pointsFor: 0, pointsAgainst: 0, closeWins: 0, closeLosses: 0, together: null };
      lines.set(k, l);
    }
    return l;
  };

  chronological(games).forEach(g => {
    const scored = g.final ? { win: Math.max(g.final.champions, g.final.challengers), lose: Math.min(g.final.champions, g.final.challengers) } : null;
    const side = (won: boolean, people: { name: string }[]) => people.forEach(p => {
      if (!keyOf(p.name)) return;
      const l = line(p.name);
      l.games += 1;
      if (won) l.wins += 1; else l.losses += 1;
      if (won && g.winner === 'challengers') l.winsAsChallengers += 1;
      (nights.get(l.key) ?? nights.set(l.key, new Set()).get(l.key)!).add(g.nightId);
      if (won) {
        const per = nightWins.get(l.key) ?? nightWins.set(l.key, new Map()).get(l.key)!;
        per.set(g.nightId, (per.get(g.nightId) ?? 0) + 1);
      }
      const r = run.get(l.key);
      const streak = won ? (r && r.night === g.nightId ? r.streak + 1 : 1) : 0;
      run.set(l.key, { night: g.nightId, streak });
      l.bestStreak = Math.max(l.bestStreak, streak);
      if (scored) {
        l.scoredGames += 1;
        l.pointsFor += won ? scored.win : scored.lose;
        l.pointsAgainst += won ? scored.lose : scored.win;
        if (scored.win - scored.lose <= 2) { if (won) l.closeWins += 1; else l.closeLosses += 1; }
      }
    });
    side(true, g.winners);
    side(false, g.losers);
    // Wins together
    g.winners.forEach(a => g.winners.forEach(b => {
      const ka = keyOf(a.name), kb = keyOf(b.name);
      if (!ka || !kb || ka === kb) return;
      const m = mates.get(ka) ?? mates.set(ka, new Map()).get(ka)!;
      const t = m.get(kb) ?? { name: b.name.trim(), wins: 0 };
      t.wins += 1;
      m.set(kb, t);
    }));
    if (g.shootout) {
      const picked = new Set(g.shootout.picked.map(p => keyOf(p.name)));
      g.shootout.shooters.forEach(p => {
        if (!keyOf(p.name)) return;
        const l = line(p.name);
        l.shootouts += 1;
        if (picked.has(keyOf(p.name))) l.shootoutsPicked += 1;
      });
    }
  });

  lines.forEach(l => {
    l.winPct = pct(l.wins, l.games);
    l.days = nights.get(l.key)?.size ?? 0;
    l.mostWinsInNight = Math.max(0, ...Array.from(nightWins.get(l.key)?.values() ?? []));
    const best = Array.from(mates.get(l.key)?.values() ?? []).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))[0];
    l.together = best && best.wins >= 2 ? best : null;
  });
  return Array.from(lines.values()).sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || b.games - a.games || a.name.localeCompare(b.name));
};

export interface Award { title: string; names: string[]; value: string }

// Tonight's shout-outs. Positive only, and ties are shared by up to 3 people
// (when half the gym is tied it isn't much of an award).
export const nightAwards = (games: ViewGame[]): Award[] => {
  const lines = playerLines(games);
  if (!lines.length) return [];
  const top = (pick: (l: PlayerLine) => number, title: string, unit: (n: number) => string): Award | null => {
    const best = Math.max(...lines.map(pick));
    if (best <= 0) return null;
    const names = lines.filter(l => pick(l) === best).map(l => l.name);
    if (names.length > 3) return null;
    return { title, names, value: unit(best) };
  };
  return [
    top(l => l.wins, 'Most wins', n => `${n} ${n === 1 ? 'win' : 'wins'}`),
    top(l => l.games, 'Iron man', n => `${n} ${n === 1 ? 'game' : 'games'}`),
    top(l => (l.bestStreak >= 2 ? l.bestStreak : 0), 'Longest streak', n => `${n} straight`),
  ].filter((a): a is Award => a !== null);
};

// One player's games, newest first
export const gamesFor = (games: ViewGame[], name: string) => {
  const k = keyOf(name);
  return games.filter(g => g.winners.some(p => keyOf(p.name) === k) || g.losers.some(p => keyOf(p.name) === k));
};
