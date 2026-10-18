import { calculateGamesBehindIndividual, calculateGamesBehindTeam, calculateWaitTimeInfo, formatWaitTime, minutesIntoGame } from './waitTimeUtils';
import { newClock, Clock } from './score';
import { Player, PreviousTeam } from '../types';

const p = (name: string): Player => ({ id: name, name });
const group = (n: number): PreviousTeam => ({ type: 'PreviousTeam', id: `g${n}`, players: Array.from({ length: n }, (_, i) => p(`g${i}`)) });

describe('games until up', () => {
  test('individuals: 0-4 ahead is 1 game, 5-9 is 2, and 20+ is 5+', () => {
    expect(calculateGamesBehindIndividual(0)).toBe(1);
    expect(calculateGamesBehindIndividual(4)).toBe(1);
    expect(calculateGamesBehindIndividual(5)).toBe(2);
    expect(calculateGamesBehindIndividual(9)).toBe(2);
    expect(calculateGamesBehindIndividual(20)).toBe('5+');
  });

  test('a group split across two games shows a range', () => {
    expect(calculateGamesBehindTeam(0, 5)).toBe(1);
    expect(calculateGamesBehindTeam(2, 5)).toBe('1-2');
    expect(calculateGamesBehindTeam(5, 5)).toBe(2);
  });
});

describe('estimated wait', () => {
  test('12 minutes per game, minus how long this game has run', () => {
    const line = [p('A'), p('B'), p('C'), p('D'), p('E'), p('F')];
    expect(calculateWaitTimeInfo(line, 0, 0).waitMinutes).toBe(12);
    expect(calculateWaitTimeInfo(line, 0, 5).waitMinutes).toBe(7);
    expect(calculateWaitTimeInfo(line, 5, 5).waitMinutes).toBe(19); // second game: 24 - 5
  });

  test('never below 0, which means you are very close to up', () => {
    expect(calculateWaitTimeInfo([p('A')], 0, 12).waitMinutes).toBe(0);
  });

  test('a group split across games gets the half-game estimate', () => {
    const line = [p('A'), p('B'), group(5)];
    const info = calculateWaitTimeInfo(line, 2, 0);
    expect(info.gamesBehind).toBe('1-2');
    expect(info.waitMinutes).toBe(18);
  });

  test('an hour or more reads as 1 Hour+', () => {
    expect(formatWaitTime(60)).toBe('1 Hour+');
    expect(formatWaitTime(24)).toBe('24 min');
  });
});

describe('waits follow the scoreboard clock when it is in use', () => {
  const NOW = 1_000_000_000;
  const line = [p('A'), p('B'), p('C'), p('D'), p('E'), p('F')];
  const wait = (clock: Clock | undefined, elapsed: number, i = 0) => calculateWaitTimeInfo(line, i, minutesIntoGame(clock, elapsed, NOW)).waitMinutes;

  test('clock not touched: minutes since the game began, like before', () => {
    expect(wait(newClock(), 3)).toBe(9);
    expect(wait(undefined, 3)).toBe(9);
  });

  test('clock set to 10:00 before tip-off: next group waits 10, the group after waits 22', () => {
    const c = { ...newClock(), remainingMs: 10 * 60_000 };
    expect(wait(c, 0)).toBe(10);
    expect(wait(c, 0, 5)).toBe(22);
  });

  test('running clock with 9:38 left rounds up to 10, whatever the wall clock says', () => {
    const c = { ...newClock(), remainingMs: 10 * 60_000, runningSince: NOW - 22_000 };
    expect(wait(c, 0)).toBe(10);
    expect(wait(c, 7)).toBe(10);
  });

  test('a paused clock holds the estimate', () => {
    const c = { ...newClock(), remainingMs: 4 * 60_000 + 30_000 };
    expect(wait(c, 11)).toBe(5);
  });

  test('time is up but the game is not recorded yet: about a minute', () => {
    const c = { ...newClock(), remainingMs: 0, buzzerScore: { champions: 10, challengers: 10 } };
    expect(wait(c, 12)).toBe(1);
    expect(wait(c, 12, 5)).toBe(13);
  });
});
