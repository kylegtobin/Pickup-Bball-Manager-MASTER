import { SyncEngine, SyncApi, PushResult, SyncSnapshot, memoryStore, PendingStore } from './syncEngine';
import { defaultGameState } from '../rules/lineup';
import { GameState, Player } from '../types';

// A pretend database with one run, and a pretend clock, so every case runs instantly and offline.
class FakeDb {
  writer: string | null = null;
  seenAt = 0;
  nights = new Map<string, { version: number; state: unknown; endedAt: number | null }>();
  games = new Map<string, { id: string; voided: boolean; shootout?: unknown }[]>();
  gamesVersion = new Map<string, number>();
  hold: Promise<void> | null = null; // when set, the next pushNight waits for it (a slow request)
  down = false;
  calls: string[] = [];
  constructor(private clock: () => number) {}
  api: SyncApi = {
    claim: async (_run, device, force) => {
      this.calls.push(`claim:${device}${force ? ':force' : ''}`);
      if (this.down) throw new Error('Failed to fetch');
      if (this.writer === null || this.writer === device || force || this.clock() - this.seenAt > 120000) {
        this.writer = device;
        this.seenAt = this.clock();
        return { claimed: true, writer: device };
      }
      return { claimed: false, writer: this.writer };
    },
    pushNight: async a => {
      this.calls.push(`night:${a.nightId}:${a.version}`);
      if (this.down) throw new Error('Failed to fetch');
      if (this.hold) { const h = this.hold; this.hold = null; await h; }
      if (this.writer !== a.device) return 'taken' as PushResult;
      this.seenAt = this.clock();
      const have = this.nights.get(a.nightId);
      if (have && have.version >= a.version) return 'stale' as PushResult;
      this.nights.set(a.nightId, { version: a.version, state: a.state, endedAt: a.endedAt });
      return 'ok' as PushResult;
    },
    pushGames: async (_run, device, nightId, version, games) => {
      this.calls.push(`games:${nightId}:${games.length}`);
      if (this.down) throw new Error('Failed to fetch');
      if (this.writer !== device) return 'taken' as PushResult;
      if ((this.gamesVersion.get(nightId) ?? 0) >= version) return 'stale' as PushResult;
      this.gamesVersion.set(nightId, version);
      const ids = new Set(games.map(g => g.id));
      const list = (this.games.get(nightId) ?? []).map(g => ({ ...g, voided: !ids.has(g.id) }));
      games.forEach(g => {
        const at = list.find(x => x.id === g.id);
        if (at) { at.voided = false; at.shootout = g.shootout; } else list.push({ id: g.id, voided: false, ...(g.shootout ? { shootout: g.shootout } : {}) });
      });
      this.games.set(nightId, list);
      return 'ok' as PushResult;
    },
    serverVersion: async nightId => this.nights.get(nightId)?.version ?? null,
  };
}

const makeClock = () => {
  let t = 1_760_000_000_000;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const id = next++; timers.push({ at: t + ms, fn, id }); return id; },
    clearTimer: (id: unknown) => { timers = timers.filter(x => x.id !== id); },
    async advance(ms: number) {
      const end = t + ms;
      for (;;) {
        await settle();
        const due = timers.filter(x => x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter(x => x !== due);
        t = due.at;
        due.fn();
      }
      t = end;
      await settle();
    },
  };
};
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

const p = (name: string): Player => ({ id: `id-${name}`, name });
const night = (over: Partial<GameState> = {}): GameState => ({
  ...defaultGameState,
  nightId: 'night-1',
  sessionStartedAt: 1_759_999_000_000,
  champions: ['Arlo', 'Bryn', 'Cale', 'Dove', 'Emry'].map(p),
  challengers: ['Fenn', 'Gray', 'Hale', 'Isla', 'Jory'].map(p),
  waitingQueue: [p('Kemp')],
  playersTonight: ['Arlo', 'Bryn', 'Cale', 'Dove', 'Emry', 'Fenn', 'Gray', 'Hale', 'Isla', 'Jory', 'Kemp'],
  ...over,
});
const game = (n: number, id = `g${n}`) => ({ id, n, startedAt: null, endedAt: 1_760_000_000_000 + n, winner: 'champions' as const, winners: [p('Arlo')], losers: [p('Fenn')] });

const setup = (device = 'deviceAAAA', db?: FakeDb, clock = makeClock(), store: PendingStore = memoryStore()) => {
  const fake = db ?? new FakeDb(clock.now);
  const seen: SyncSnapshot[] = [];
  const e = new SyncEngine(fake.api, 'run-1', device, { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, onChange: s => seen.push(s), store });
  return { e, db: fake, clock, seen };
};

test('claims the run, then sends the night and its games', async () => {
  const { e, db, clock } = setup();
  e.update(night({ games: [game(1)] }));
  await e.start();
  await clock.advance(1000);
  expect(e.snapshot.status).toBe('live');
  expect(db.nights.get('night-1')).toBeTruthy();
  expect(db.games.get('night-1')!.map(g => [g.id, g.voided])).toEqual([['g1', false]]);
  expect(e.snapshot.lastSyncedAt).not.toBeNull();
});

test('only what the phones show leaves the device', async () => {
  const { e, db, clock } = setup();
  const s = night({ notification: { message: 'private toast', type: 'info' } });
  s.champions[0] = { ...s.champions[0], rid: 'regular-123' };
  e.update(s);
  await e.start();
  await clock.advance(1000);
  const sent = JSON.stringify(db.nights.get('night-1')!.state);
  expect(sent).not.toContain('private toast');
  expect(sent).not.toContain('regular-123');
  expect(sent).not.toContain('replacementTracking');
  expect(sent).toContain('Arlo');
});

test('many quick changes become one send, and a change nobody sees sends nothing', async () => {
  const { e, db, clock } = setup();
  await e.start();
  for (let i = 0; i < 5; i++) e.update(night({ score: { champions: i, challengers: 0 } }));
  await clock.advance(1000);
  expect(db.calls.filter(c => c.startsWith('night:'))).toHaveLength(1);
  e.update(night({ score: { champions: 4, challengers: 0 }, showShootoutModal: true, notification: { message: 'x', type: 'info' } }));
  await clock.advance(1000);
  expect(db.calls.filter(c => c.startsWith('night:'))).toHaveLength(1);
});

test('offline: keeps only the latest picture and sends it when the connection is back', async () => {
  const { e, db, clock } = setup();
  await e.start();
  db.down = true;
  e.update(night({ score: { champions: 1, challengers: 0 } }));
  await clock.advance(1000);
  expect(e.snapshot.status).toBe('offline');
  expect(e.snapshot.pending).toBe(true);
  e.update(night({ score: { champions: 5, challengers: 3 } }));
  await clock.advance(1000);
  db.down = false;
  await clock.advance(30000);
  expect(e.snapshot.status).toBe('live');
  expect(e.snapshot.pending).toBe(false);
  expect((db.nights.get('night-1')!.state as { score: unknown }).score).toEqual({ champions: 5, challengers: 3 });
});

test('starting while offline keeps trying until it can claim', async () => {
  const { e, db, clock } = setup();
  db.down = true;
  e.update(night());
  await e.start();
  expect(e.snapshot.status).toBe('offline');
  db.down = false;
  await clock.advance(10000);
  expect(e.snapshot.status).toBe('live');
  expect(db.nights.has('night-1')).toBe(true);
});

test('a second screen waits; taking over moves the run to it and the first one stops writing', async () => {
  const clock = makeClock();
  const a = setup('deviceAAAA', undefined, clock);
  a.e.update(night());
  await a.e.start();
  await clock.advance(1000);

  const b = setup('deviceBBBB', a.db, clock);
  b.e.update(night({ score: { champions: 2, challengers: 0 } }));
  await b.e.start();
  expect(b.e.snapshot.status).toBe('taken');
  expect(b.e.snapshot.writer).toBe('deviceAAAA');

  await b.e.takeOver();
  await clock.advance(1000);
  expect(b.e.snapshot.status).toBe('live');
  expect((a.db.nights.get('night-1')!.state as { score: unknown }).score).toEqual({ champions: 2, challengers: 0 });

  a.e.update(night({ score: { champions: 9, challengers: 9 } }));
  await clock.advance(1000);
  expect(a.e.snapshot.status).toBe('taken');
  expect((a.db.nights.get('night-1')!.state as { score: unknown }).score).toEqual({ champions: 2, challengers: 0 });
});

test("a screen that's been quiet for two minutes loses the run without anyone pressing take over", async () => {
  const clock = makeClock();
  const a = setup('deviceAAAA', undefined, clock);
  a.e.update(night());
  await a.e.start();
  a.e.stop(); // the courtside laptop closed
  await clock.advance(3 * 60 * 1000);
  const b = setup('deviceBBBB', a.db, clock);
  await b.e.start();
  expect(b.e.snapshot.status).toBe('live');
});

test('the heartbeat keeps the claim fresh during a quiet game', async () => {
  const { e, db, clock } = setup();
  e.update(night());
  await e.start();
  await clock.advance(10 * 60 * 1000);
  expect(clock.now() - db.seenAt).toBeLessThan(60000);
  expect(e.snapshot.status).toBe('live');
});

test('undo takes a game back, and the database marks it voided', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.update(night({ games: [game(1), game(2)] }));
  await clock.advance(1000);
  e.update(night({ games: [game(1)] }));
  await clock.advance(1000);
  expect(db.games.get('night-1')!.map(g => [g.id, g.voided])).toEqual([['g1', false], ['g2', true]]);
});

test('a database ahead of this clock (another screen wrote with a faster clock) is caught up with', async () => {
  const { e, db, clock } = setup();
  db.nights.set('night-1', { version: clock.now() + 10_000_000, state: {}, endedAt: null });
  db.writer = 'deviceAAAA';
  db.seenAt = clock.now();
  e.update(night({ score: { champions: 7, challengers: 1 } }));
  await e.start();
  await clock.advance(1000);
  expect((db.nights.get('night-1')!.state as { score: unknown }).score).toEqual({ champions: 7, challengers: 1 });
});

test('finishing the night tells the phones it is over', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.update(night({ games: [game(1)] }));
  await clock.advance(1000);
  e.update({ ...defaultGameState });
  await clock.advance(1000);
  expect(db.nights.get('night-1')!.endedAt).not.toBeNull();
  expect(db.games.get('night-1')!.map(g => [g.id, g.voided])).toEqual([['g1', false]]);
});

test('nothing is sent before the first sign-in of the night', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.update({ ...defaultGameState });
  await clock.advance(5000);
  expect(db.calls.filter(c => c.startsWith('night:'))).toHaveLength(0);
});

test('stop ends all sending and timers', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.stop();
  e.update(night());
  await clock.advance(10 * 60 * 1000);
  expect(db.calls.filter(c => !c.startsWith('claim:deviceAAAA') || c.includes('force'))).toEqual([]);
  expect(db.calls).toHaveLength(1);
  expect(e.snapshot.status).toBe('stopped');
});

test('every send carries a higher version, even with the clock standing still', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.update(night({ score: { champions: 1, challengers: 0 } }));
  await clock.advance(1000);
  e.update(night({ score: { champions: 2, challengers: 0 } }));
  await clock.advance(1000);
  const versions = db.calls.filter(c => c.startsWith('night:')).map(c => Number(c.split(':')[2]));
  expect(versions[1]).toBeGreaterThan(versions[0]);
});

// ---- Astra's overnight review ----

test('Must 3: a stopped engine never writes again, even when its slow request comes back', async () => {
  const clock = makeClock();
  const store = memoryStore();
  const a = setup('deviceAAAA', undefined, clock, store);
  await a.e.start();
  let release: () => void = () => undefined;
  a.db.hold = new Promise<void>(r => { release = r; });
  a.e.update(night({ score: { champions: 1, challengers: 0 } }));
  await clock.advance(1000); // score 1 is on its way, held up
  a.e.stop(); // Pause sharing
  const b = setup('deviceAAAA', a.db, clock, store); // Resume
  b.e.update(night({ score: { champions: 8, challengers: 0 } }));
  await b.e.start();
  await clock.advance(1000);
  expect((a.db.nights.get('night-1')!.state as { score: unknown }).score).toEqual({ champions: 8, challengers: 0 });
  release();
  await clock.advance(60000);
  expect((a.db.nights.get('night-1')!.state as { score: unknown }).score).toEqual({ champions: 8, challengers: 0 });
});

test('Must 4: a night finished offline still reaches the phones after a reload and a new night', async () => {
  const clock = makeClock();
  const store = memoryStore();
  const a = setup('deviceAAAA', undefined, clock, store);
  await a.e.start();
  a.e.update(night({ games: [game(1)] }));
  await clock.advance(1000);
  a.db.down = true;
  a.e.update(night({ games: [game(1), game(2)] }));
  a.e.update({ ...defaultGameState }); // Finish night
  await clock.advance(5000);
  a.e.stop(); // reload
  const b = setup('deviceAAAA', a.db, clock, store);
  b.e.update(night({ nightId: 'night-2', games: [] }));
  a.db.down = false;
  await b.e.start();
  await clock.advance(2000);
  expect(a.db.nights.get('night-1')!.endedAt).not.toBeNull();
  expect(a.db.games.get('night-1')!.map(g => [g.id, g.voided])).toEqual([['g1', false], ['g2', false]]);
  expect(a.db.nights.has('night-2')).toBe(true);
  expect(store.load()).toEqual([]);
});

test('Should 5: Undo then Finish offline leaves the undone game voided', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.update(night({ games: [game(1)] }));
  await clock.advance(1000);
  db.down = true;
  e.update(night({ games: [] })); // Undo
  e.update({ ...defaultGameState }); // Finish
  await clock.advance(3000);
  db.down = false;
  await e.flushNow();
  await clock.advance(1000);
  expect(db.nights.get('night-1')!.endedAt).not.toBeNull();
  expect(db.games.get('night-1')!.every(g => g.voided)).toBe(true);
});

test('Should 6: shootout picks made after the result was sent still go up', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.update(night({ games: [game(1)] }));
  await clock.advance(1000);
  const shootout = { spots: 3, shooters: [p('Kemp'), p('Lane'), p('Moss'), p('Nash')], picked: [p('Kemp'), p('Lane'), p('Moss')] };
  e.update(night({ games: [{ ...game(1), shootout }] }));
  await clock.advance(1000);
  expect(JSON.stringify(db.games.get('night-1')![0].shootout)).toContain('Moss');
});

test('Should 9: saved-regular ids never leave in game results', async () => {
  const { e, db, clock } = setup();
  await e.start();
  const g = { ...game(1), winners: [{ id: 'regular-secret-1', name: 'Arlo' }], losers: [{ id: 'regular-secret-2', name: 'Fenn' }] };
  const calls: unknown[] = [];
  const orig = db.api.pushGames;
  db.api.pushGames = async (...args) => { calls.push(args[4]); return orig(...args); };
  e.update(night({ games: [g] }));
  await clock.advance(1000);
  expect(JSON.stringify(calls)).not.toContain('regular-secret');
  expect(JSON.stringify(calls)).toContain('Arlo');
});

test('a late, older game list is refused by the database and changes nothing', async () => {
  const { e, db, clock } = setup();
  await e.start();
  e.update(night({ games: [game(1), game(2)] }));
  await clock.advance(1000);
  const r = await db.api.pushGames('run-1', 'deviceAAAA', 'night-1', 1, []);
  expect(r).toBe('stale');
  expect(db.games.get('night-1')!.filter(x => !x.voided)).toHaveLength(2);
});
