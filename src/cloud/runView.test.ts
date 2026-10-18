import { parseRunView, fetchRunView, totalsByName } from './runView';
import { toPublicState, gamesForPush } from './publicState';
import { defaultGameState } from '../rules/lineup';

const state = (sentAt: number) => toPublicState({
  ...defaultGameState,
  nightId: 'n1',
  champions: [{ id: 'a', name: 'Arlo', rid: 'r-1' }],
  waitingQueue: [{ type: 'PreviousTeam', id: 't', players: [{ id: 'b', name: 'Bryn', away: 5 }] }],
  status: 'SHOOTOUT',
  requiredPlayers: 2,
  shootoutTeam: { type: 'PreviousTeam', id: 't', players: [{ id: 'b', name: 'Bryn' }] },
}, sentAt);

test('the public picture keeps names and the line, and drops saved-regular ids', () => {
  const s = state(1000);
  expect(s.champions).toEqual([{ id: 'a', name: 'Arlo' }]);
  expect(s.waitingQueue).toEqual([{ type: 'PreviousTeam', id: 't', players: [{ id: 'b', name: 'Bryn', away: 5 }] }]);
  expect(s.shootout).toEqual({ spots: 2, players: [{ id: 'b', name: 'Bryn' }] });
  expect(Object.keys(s)).not.toContain('notification');
});

test('games without an id get a stable one', () => {
  const g = gamesForPush('n1', [{ n: 3, startedAt: null, endedAt: 99, winner: 'champions', winners: [], losers: [] }]);
  expect(g[0].id).toBe('n1-g3-99');
  expect(gamesForPush('n1', [{ n: 3, startedAt: null, endedAt: 99, winner: 'champions', winners: [], losers: [] }])[0].id).toBe(g[0].id);
});

test('lines the courtside clock up with the phone clock', () => {
  // Courtside clock runs 30 s behind the server; the phone runs 10 s ahead of it
  const server = Date.parse('2026-10-18T20:00:00Z');
  const v = parseRunView({
    run: { name: 'Tuesday run', gym: null, courtSeenAt: '2026-10-18T20:00:00Z' },
    night: { id: 'n1', state: state(server - 30000), updatedAt: '2026-10-18T20:00:00Z' },
    games: [],
    serverTime: '2026-10-18T20:00:00Z',
  }, server + 10000)!;
  expect(v.skewMs).toBe(40000);
  expect(v.serverOffsetMs).toBe(10000);
});

test('odd answers are dropped rather than trusted', () => {
  expect(parseRunView(null)).toBeNull();
  expect(parseRunView({})).toBeNull();
  const v = parseRunView({
    run: { name: 'Run' },
    night: { id: 'n1', state: { v: 99 }, updatedAt: 'not a date' },
    games: [{ id: 'g', winner: 'nobody' }, { id: 'h', winner: 'champions', winners: [{ id: 1 }, { id: 'x', name: 'Arlo' }], losers: 'no' }],
  })!;
  expect(v.night!.state).toBeNull();
  expect(v.games).toHaveLength(1);
  expect(v.games[0].winners).toEqual([{ id: 'x', name: 'Arlo' }]);
  expect(v.games[0].losers).toEqual([]);
});

test('stats match players by name across nights', () => {
  const rows = totalsByName([
    { winners: [{ id: '1', name: 'Arlo' }], losers: [{ id: '2', name: 'Bryn' }] },
    { winners: [{ id: '9', name: 'arlo ' }], losers: [{ id: '2', name: 'Bryn' }] },
    { winners: [{ id: '2', name: 'Bryn' }], losers: [{ id: '1', name: 'Arlo' }] },
  ]);
  expect(rows).toEqual([{ name: 'Arlo', games: 3, wins: 2 }, { name: 'Bryn', games: 3, wins: 1 }]);
});

test('a link that no longer works reads as gone; a network failure reads as offline', async () => {
  const ok = (body: unknown) => (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
  expect(await fetchRunView('t'.repeat(32), ok(null))).toEqual({ ok: false, reason: 'gone' });
  const down = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
  expect(await fetchRunView('t'.repeat(32), down)).toEqual({ ok: false, reason: 'offline' });
  const err = (async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
  expect(await fetchRunView('t'.repeat(32), err)).toEqual({ ok: false, reason: 'offline' });
});
