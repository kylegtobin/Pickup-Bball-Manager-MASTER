import { parseBackup } from './backup';

const night = { id: 'n1', startedAt: 1, endedAt: 2, gamesPlayed: 1, playersTonight: ['Avery'], bestStreak: null,
  games: [{ n: 1, startedAt: null, endedAt: 2, winner: 'champions', winners: [{ id: 'a', name: 'Avery' }], losers: [] }] };

test('reads a backup made by the app', () => {
  const r = parseBackup(JSON.stringify({ app: 'Pickup Basketball Manager', kind: 'night-backup', version: 1, night }));
  expect(r.ok).toBe(true);
  if (r.ok) { expect(r.backup.night.gamesPlayed).toBe(1); expect(r.backup.state).toBeNull(); }
});

test('keeps the live state when the backup has one', () => {
  const r = parseBackup(JSON.stringify({ app: 'Pickup Basketball Manager', kind: 'night-backup', version: 1, night, state: { champions: [], challengers: [], waitingQueue: [] } }));
  expect(r.ok && r.backup.state).toBeTruthy();
});

test('turns away files that are not backups, damaged, or from a newer version', () => {
  expect(parseBackup('not json').ok).toBe(false);
  expect(parseBackup(JSON.stringify({ hello: 1 })).ok).toBe(false);
  expect(parseBackup(JSON.stringify({ app: 'Pickup Basketball Manager', kind: 'night-backup', version: 2, night })).ok).toBe(false);
  expect(parseBackup(JSON.stringify({ app: 'Pickup Basketball Manager', kind: 'night-backup', version: 1, night: { ...night, games: [{ bad: true }] } })).ok).toBe(false);
});

test('a backup of tonight gets its own id so it never replaces a past night', () => {
  const r = parseBackup(JSON.stringify({ app: 'Pickup Basketball Manager', kind: 'night-backup', version: 1, night: { ...night, id: 'tonight' } }));
  expect(r.ok && r.backup.night.id).not.toBe('tonight');
});

const wrap = (extra: object) => JSON.stringify({ app: 'Pickup Basketball Manager', kind: 'night-backup', version: 1, night, ...extra });
const p = (id: string, name: string) => ({ id, name, rid: `r-${id}` });

test('an older backup with a running clock comes back paused at the time left when it was made', () => {
  const runningSince = Date.parse('2026-10-17T20:00:00Z');
  const state = { champions: [], challengers: [], waitingQueue: [], clock: { lengthMs: 720000, remainingMs: 720000, runningSince, buzzerScore: null } };
  const r = parseBackup(wrap({ exportedAt: '2026-10-17T20:08:00Z', state }));
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.backup.state!.clock.runningSince).toBeNull();
    expect(r.backup.state!.clock.remainingMs).toBe(4 * 60 * 1000);
  }
});

test('damaged live data is turned away instead of crashing later', () => {
  const ok = { champions: [p('a', 'Avery')], challengers: [], waitingQueue: [] };
  expect(parseBackup(wrap({ state: ok })).ok).toBe(true);
  expect(parseBackup(wrap({ state: { ...ok, champions: [{ id: 'a' }] } })).ok).toBe(false); // player with no name
  expect(parseBackup(wrap({ state: { ...ok, champions: Array.from({ length: 6 }, (_, i) => p(`x${i}`, `X${i}`)) } })).ok).toBe(false);
  expect(parseBackup(wrap({ state: { ...ok, clock: { lengthMs: 720000, remainingMs: 'soon', runningSince: null, buzzerScore: null } } })).ok).toBe(false);
  expect(parseBackup(wrap({ state: { ...ok, score: { champions: -1, challengers: 0 } } })).ok).toBe(false);
  expect(parseBackup(wrap({ state: { ...ok, waitingQueue: [p('a', 'Avery')] } })).ok).toBe(false); // in two places
  expect(parseBackup(wrap({ state: { ...ok, waitingQueue: [{ id: 'g', players: [{ name: 'No id' }] }] } })).ok).toBe(false);
});

test('missing or damaged bookkeeping is turned away', () => {
  const ok = { champions: [p('a', 'Avery')], challengers: [], waitingQueue: [] };
  expect(parseBackup(wrap({ state: { ...ok, replacementTracking: null } })).ok).toBe(false);
  expect(parseBackup(wrap({ state: { ...ok, sittingOut: [{ player: p('z', 'Zed') }] } })).ok).toBe(false);
  expect(parseBackup(wrap({ state: { ...ok, sittingOut: [{ player: p('z', 'Zed'), at: 1, from: 'champions', index: 0, gameNo: 0, spotFilled: false }] } })).ok).toBe(true);
  expect(parseBackup(wrap({ state: { ...ok, gameStartTime: 'later' } })).ok).toBe(false);
});

test('every tracking entry and working list is checked, not just the containers', () => {
  const ok = { champions: [p('a', 'Avery')], challengers: [], waitingQueue: [] };
  expect(parseBackup(wrap({ state: { ...ok, replacementTracking: { replacements: [null] } } })).ok).toBe(false);
  expect(parseBackup(wrap({ state: { ...ok, replacementTracking: { replacements: [{ playerId: 'a', originalPosition: 0 }] } } })).ok).toBe(true);
  expect(parseBackup(wrap({ state: { ...ok, tempChampions: [null] } })).ok).toBe(false);
  expect(parseBackup(wrap({ state: { ...ok, shootoutTeam: { id: 'g', players: [] } } })).ok).toBe(false);
});

test('a waiting group has to say it is a group', () => {
  const ok = { champions: [p('a', 'Avery')], challengers: [], waitingQueue: [{ type: 'PreviousTeam', id: 'g', players: [p('b', 'Bryn')] }] };
  expect(parseBackup(wrap({ state: ok })).ok).toBe(true);
  expect(parseBackup(wrap({ state: { ...ok, waitingQueue: [{ id: 'g', players: [p('b', 'Bryn')] }] } })).ok).toBe(false);
});

test('a player marked as a group (with no players) is turned away', () => {
  const ok = { champions: [p('a', 'Avery')], challengers: [], waitingQueue: [{ ...p('k', 'Kip'), type: 'PreviousTeam' }] };
  expect(parseBackup(wrap({ state: ok })).ok).toBe(false);
});
