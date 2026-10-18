import { decide, newClock, timeLeft, clockState, formatClock, Clock, Score } from './score';

const s = (champions: number, challengers: number): Score => ({ champions, challengers });
const live = newClock();
const expired = (buzzer: Score): Clock => ({ ...newClock(), remainingMs: 0, buzzerScore: buzzer });

test('first to 11, win by 2', () => {
  expect(decide(s(11, 9), live).winner).toBe('champions');
  expect(decide(s(11, 10), live).winner).toBeNull();
  expect(decide(s(12, 10), live)).toEqual({ winner: 'champions', endedBy: 'points', nextBucket: false });
  expect(decide(s(12, 11), live).winner).toBeNull(); // 10-11 then +2
  expect(decide(s(10, 12), live).winner).toBe('challengers'); // 10-10 then +2
});

test('15 or more ends it, even by one or with a two that goes past', () => {
  expect(decide(s(15, 14), live)).toEqual({ winner: 'champions', endedBy: 'cap', nextBucket: false });
  expect(decide(s(14, 16), live)).toEqual({ winner: 'challengers', endedBy: 'cap', nextBucket: false });
  expect(decide(s(14, 14), live).winner).toBeNull();
});

test('time up: the leader wins; tied means next bucket wins, even below 11', () => {
  expect(decide(s(9, 7), expired(s(9, 7)))).toEqual({ winner: 'champions', endedBy: 'time', nextBucket: false });
  expect(decide(s(6, 6), expired(s(6, 6)))).toEqual({ winner: null, endedBy: null, nextBucket: true });
  expect(decide(s(6, 8), expired(s(6, 6)))).toEqual({ winner: 'challengers', endedBy: 'sudden', nextBucket: false });
  expect(decide(s(7, 6), expired(s(6, 6))).winner).toBe('champions');
});

test('a running clock counts down from real time and never below zero', () => {
  const c: Clock = { ...newClock(), runningSince: 1000 };
  expect(timeLeft(c, 1000 + 60_000)).toBe(11 * 60_000);
  expect(timeLeft(c, 1000 + 13 * 60_000)).toBe(0);
  expect(clockState(newClock())).toBe('not-started');
  expect(clockState({ ...newClock(), remainingMs: 300_000 })).toBe('paused');
  expect(clockState(c, 2000)).toBe('running');
  expect(clockState(c, 1000 + 13 * 60_000)).toBe('time');
  expect(formatClock(12 * 60_000)).toBe('12:00');
  expect(formatClock(61_500)).toBe('1:02');
});

test('a tied buzzer wins as next bucket even when the basket reaches 11 or 15', () => {
  expect(decide(s(12, 10), expired(s(10, 10))).endedBy).toBe('sudden');
  expect(decide(s(15, 14), expired(s(14, 14))).endedBy).toBe('sudden');
  expect(decide(s(10, 10), expired(s(10, 10))).nextBucket).toBe(true);
});
