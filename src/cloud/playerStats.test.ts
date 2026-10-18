import { playerLines, nightAwards, gamesFor } from './playerStats';
import { ViewGame } from './runView';

const ref = (name: string) => ({ id: `r-${name}`, name });
let t = 0;
const g = (night: string, winner: 'champions' | 'challengers', winners: string[], losers: string[], extra: Partial<ViewGame> = {}): ViewGame => ({
  id: `g${++t}`, nightId: night, n: t, endedAt: t * 1000, winner, winners: winners.map(ref), losers: losers.map(ref), ...extra,
});
const by = (lines: ReturnType<typeof playerLines>, name: string) => lines.find(l => l.name === name)!;

describe('player stats', () => {
  beforeEach(() => { t = 0; });

  test('record, win %, days played and wins as Challengers', () => {
    const games = [
      g('n1', 'champions', ['Marcus T.', 'Speedy'], ['Sam K.']),
      g('n1', 'challengers', ['Sam K.'], ['Marcus T.', 'Speedy']),
      g('n2', 'champions', ['Speedy'], ['J-Dog']),
    ];
    const lines = playerLines(games);
    const speedy = by(lines, 'Speedy');
    expect([speedy.games, speedy.wins, speedy.losses, speedy.winPct, speedy.days]).toEqual([3, 2, 1, 67, 2]);
    expect(by(lines, 'Sam K.').winsAsChallengers).toBe(1);
    expect(lines[0].name).toBe('Speedy'); // most wins first
  });

  test('a streak counts wins in a row within one night, and a loss or a new night starts over', () => {
    const games = [
      g('n1', 'champions', ['Ben A.'], ['X']), g('n1', 'champions', ['Ben A.'], ['Y']), g('n1', 'champions', ['Ben A.'], ['Z']),
      g('n1', 'challengers', ['Z'], ['Ben A.']),
      g('n2', 'champions', ['Ben A.'], ['X']), g('n2', 'champions', ['Ben A.'], ['Y']),
    ];
    const ben = by(playerLines(games), 'Ben A.');
    expect(ben.bestStreak).toBe(3);
    expect(ben.mostWinsInNight).toBe(3);
  });

  test('games are put in order before counting streaks, whatever order they arrive in', () => {
    const games = [
      g('n1', 'champions', ['Ben A.'], ['X']), g('n1', 'challengers', ['X'], ['Ben A.']), g('n1', 'champions', ['Ben A.'], ['Y']),
    ].reverse(); // newest first, as the phone page gets them
    expect(by(playerLines(games), 'Ben A.').bestStreak).toBe(1);
  });

  test('names match across nights ignoring capitals and spaces', () => {
    const lines = playerLines([g('n1', 'champions', ['Kofi O.'], ['A']), g('n2', 'champions', [' kofi o. '], ['B'])]);
    expect(by(lines, 'Kofi O.').wins).toBe(2);
    expect(lines.filter(l => l.key === 'kofi o.')).toHaveLength(1);
  });

  test('most wins together needs at least 2 and names the teammate', () => {
    const games = [
      g('n1', 'champions', ['Ben A.', 'Rico M.'], ['X']), g('n1', 'champions', ['Ben A.', 'Rico M.', 'Eli S.'], ['Y']),
    ];
    const lines = playerLines(games);
    expect(by(lines, 'Ben A.').together).toEqual({ name: 'Rico M.', wins: 2 });
    expect(by(lines, 'Eli S.').together).toBeNull();
  });

  test('shootouts: times shot and times picked', () => {
    const games = [g('n1', 'champions', ['A'], ['B'], { shootout: { spots: 1, shooters: [ref('Jay L.'), ref('Matt D.')], picked: [ref('Jay L.')] } })];
    const lines = playerLines(games);
    expect([by(lines, 'Jay L.').shootouts, by(lines, 'Jay L.').shootoutsPicked]).toEqual([1, 1]);
    expect([by(lines, 'Matt D.').shootouts, by(lines, 'Matt D.').shootoutsPicked]).toEqual([1, 0]);
  });

  test('team points only from games with a score, and close games are decided by 2 or fewer', () => {
    const games = [
      g('n1', 'champions', ['Ben A.'], ['Sam K.'], { final: { champions: 11, challengers: 9 } }),
      g('n1', 'challengers', ['Sam K.'], ['Ben A.'], { final: { champions: 4, challengers: 11 } }),
      g('n1', 'champions', ['Ben A.'], ['Sam K.']), // no score kept
    ];
    const ben = by(playerLines(games), 'Ben A.');
    expect([ben.scoredGames, ben.pointsFor, ben.pointsAgainst, ben.closeWins, ben.closeLosses]).toEqual([2, 15, 20, 1, 0]);
  });

  test('nightly awards are positive and shared on ties', () => {
    const awards = nightAwards([g('n1', 'champions', ['Ben A.', 'Rico M.'], ['X']), g('n1', 'champions', ['Ben A.', 'Rico M.'], ['Y'])]);
    expect(awards.find(a => a.title === 'Most wins')).toEqual({ title: 'Most wins', names: ['Ben A.', 'Rico M.'], value: '2 wins' });
    expect(awards.find(a => a.title === 'Longest streak')!.value).toBe('2 straight');
    expect(nightAwards([])).toEqual([]);
  });

  test('a player\'s own games', () => {
    const games = [g('n1', 'champions', ['Ben A.'], ['X']), g('n1', 'champions', ['Y'], ['Z'])];
    expect(gamesFor(games, 'ben a.')).toHaveLength(1);
  });
});
