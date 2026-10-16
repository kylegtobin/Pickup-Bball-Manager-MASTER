import { planChallengers, previewNextUp } from './formChallengers';
import { Player, PreviousTeam, WaitingQueueItem } from '../types';

const p = (name: string): Player => ({ id: name, name });
const group = (id: string, ...names: string[]): PreviousTeam => ({ type: 'PreviousTeam', id, players: names.map(p) });
const names = (players: Player[]) => players.map(x => x.name);

describe('planChallengers (who fills the Challengers)', () => {
  test('takes the first five individuals in line order', () => {
    const plan = planChallengers(['A', 'B', 'C', 'D', 'E', 'F'].map(p));
    expect(names(plan.picked)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(plan.shootout).toBeNull();
    expect(plan.rest).toEqual([p('F')]);
  });

  test('takes a whole group when it fits the open spots', () => {
    const plan = planChallengers([p('A'), p('B'), group('g', 'C', 'D', 'E'), p('F')]);
    expect(names(plan.picked)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(plan.shootout).toBeNull();
    expect(plan.rest).toEqual([p('F')]);
  });

  test('a group bigger than the open spots shoots for them, and only that group', () => {
    const g = group('g', 'S1', 'S2', 'S3', 'S4', 'S5');
    const plan = planChallengers([p('A'), p('B'), g, p('Late1'), p('Late2')]);
    expect(names(plan.picked)).toEqual(['A', 'B']);
    expect(plan.shootout).toEqual({ team: g, spots: 3 });
    expect(plan.rest).toEqual([p('Late1'), p('Late2')]); // people behind the group wait, they don't jump it
  });

  test('a group of 5 at the front of an empty line takes all five spots (same teams run it back)', () => {
    const plan = planChallengers([group('losers', 'L1', 'L2', 'L3', 'L4', 'L5')]);
    expect(plan.picked).toHaveLength(5);
    expect(plan.shootout).toBeNull();
  });

  test('open spots for a shootout are always between 1 and 4', () => {
    for (let ahead = 1; ahead <= 4; ahead++) {
      const line: WaitingQueueItem[] = [...Array.from({ length: ahead }, (_, i) => p(`I${i}`)), group('g', 'a', 'b', 'c', 'd', 'e')];
      expect(planChallengers(line).shootout?.spots).toBe(5 - ahead);
    }
  });
});

describe('previewNextUp (court view)', () => {
  test('five or more waiting: just the next five', () => {
    const next = previewNextUp(['A', 'B', 'C', 'D', 'E', 'F'].map(p));
    expect(names(next.picked)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(next.shootout).toBeNull();
  });

  test('two waiting, then a group: the group shoots for 3', () => {
    const next = previewNextUp([p('Eli'), p('Jay'), group('g', 'Sam', 'Jordan', 'Nate', 'Chris', 'Omar')]);
    expect(names(next.picked)).toEqual(['Eli', 'Jay']);
    expect(next.shootout?.spots).toBe(3);
    expect(names(next.shootout?.players ?? [])).toEqual(['Sam', 'Jordan', 'Nate', 'Chris', 'Omar']);
  });

  test("two waiting and nothing else: this game's losers shoot for 3", () => {
    const next = previewNextUp([p('Kai'), p('Leo')]);
    expect(names(next.picked)).toEqual(['Kai', 'Leo']);
    expect(next.shootout).toEqual({ spots: 3, players: null });
  });

  test('nobody waiting: the losing team comes straight back', () => {
    const next = previewNextUp([]);
    expect(next.picked).toEqual([]);
    expect(next.losersFill).toBe(5);
    expect(next.shootout).toBeNull();
  });
});
