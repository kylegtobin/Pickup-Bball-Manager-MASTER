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
