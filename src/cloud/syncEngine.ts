import { GameState } from '../types';
import { toPublicState, gamesForPush, gamesSignature, PublicState, PushGame } from './publicState';

// Sends the courtside screen's night to the database so phones can follow along.
// - Only one screen writes: it claims the run first. Another screen has to take over on purpose.
// - Every send is the whole picture of a night, so while the connection is down only the latest picture of
//   each night is kept. Those wait in this browser's storage until the database has them, so a night
//   finished offline still reaches the phones after a reload or the next night starting.
// - Each send carries a higher version than the last, so a late retry can't overwrite newer news.
// - Once stopped (sharing paused, signed out, turned off), an engine never writes again, even if a slow
//   request it started comes back later.
// Nothing on the courtside screen ever waits on this.

export type PushResult = 'ok' | 'stale' | 'taken';

export interface SyncApi {
  claim(runId: string, device: string, force: boolean): Promise<{ claimed: boolean; writer: string | null }>;
  pushNight(a: { runId: string; device: string; nightId: string; version: number; state: PublicState; startedAt: number | null; endedAt: number | null }): Promise<PushResult>;
  pushGames(runId: string, device: string, nightId: string, version: number, games: PushGame[]): Promise<PushResult>;
  serverVersion(nightId: string): Promise<number | null>;
}

export interface NightJob {
  nightId: string;
  state: PublicState;
  startedAt: number | null;
  endedAt: number | null;
  games: PushGame[];
  gamesSig: string;
}

// Where unsent nights wait between page loads
export interface PendingStore {
  load(): NightJob[];
  save(jobs: NightJob[]): void;
}

export const memoryStore = (): PendingStore => {
  let jobs: NightJob[] = [];
  return { load: () => jobs, save: j => { jobs = j; } };
};

export const localPendingStore = (runId: string): PendingStore => {
  const key = `pbm-cloud-pending-${runId}`;
  return {
    load: () => {
      try {
        const raw = JSON.parse(window.localStorage.getItem(key) || '[]');
        return Array.isArray(raw) ? raw.filter(j => j && typeof j.nightId === 'string' && j.state && Array.isArray(j.games)) : [];
      } catch { return []; }
    },
    save: jobs => {
      try {
        if (jobs.length === 0) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(jobs));
      } catch { /* full or blocked: the night still runs */ }
    },
  };
};

export type SyncStatus = 'starting' | 'live' | 'offline' | 'taken' | 'stopped';

export interface SyncSnapshot {
  status: SyncStatus;
  lastSyncedAt: number | null;
  writer: string | null; // The other screen, when status is 'taken'
  pending: boolean; // Something is waiting to go out
}

export interface SyncOptions {
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  debounceMs?: number;
  heartbeatMs?: number;
  onChange?: (s: SyncSnapshot) => void;
  store?: PendingStore;
}

const RETRY_MS = [2000, 5000, 10000, 20000, 30000];

export class SyncEngine {
  private snap: SyncSnapshot = { status: 'starting', lastSyncedAt: null, writer: null, pending: false };
  private version = 0;
  private pending = new Map<string, NightJob>(); // night -> latest unsent picture, oldest night first
  private latest: NightJob | null = null; // The newest picture of tonight, sent or not (re-sent after a take-over)
  private sentGames = new Map<string, string>(); // night -> games signature the database has
  private lastNight: { nightId: string; state: PublicState; startedAt: number | null; games: PushGame[]; gamesSig: string } | null = null;
  private lastKey = '';
  private flushing = false;
  private again = false;
  private debounce: unknown = null;
  private retry: unknown = null;
  private beat: unknown = null;
  private failures = 0;
  private stopped = false;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;
  private readonly debounceMs: number;
  private readonly heartbeatMs: number;
  private readonly store: PendingStore;

  constructor(private api: SyncApi, private runId: string, private device: string, private opts: SyncOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? (id => clearTimeout(id as ReturnType<typeof setTimeout>));
    this.debounceMs = opts.debounceMs ?? 600;
    this.heartbeatMs = opts.heartbeatMs ?? 45000;
    this.store = opts.store ?? memoryStore();
    // Nights a previous page load didn't get to send (finished offline, for example)
    this.store.load().forEach(j => this.pending.set(j.nightId, j));
    this.snap = { ...this.snap, pending: this.pending.size > 0 };
  }

  get snapshot() { return this.snap; }

  private set(patch: Partial<SyncSnapshot>) {
    if (this.stopped && patch.status !== 'stopped') return;
    this.snap = { ...this.snap, ...patch, pending: patch.pending ?? this.pending.size > 0 };
    this.opts.onChange?.(this.snap);
  }

  private persist() {
    if (!this.stopped) this.store.save(Array.from(this.pending.values()));
  }

  async start(force = false) {
    if (this.stopped) return;
    try {
      const r = await this.api.claim(this.runId, this.device, force);
      if (this.stopped) return;
      if (!r.claimed) { this.set({ status: 'taken', writer: r.writer }); return; }
      this.failures = 0;
      if (force) {
        // The other screen may have sent a different picture and game list: send ours again
        this.sentGames.clear();
        if (this.latest && !this.pending.has(this.latest.nightId)) { this.pending.set(this.latest.nightId, this.latest); this.persist(); }
      }
      this.set({ status: 'live', writer: null });
      this.scheduleBeat();
      await this.flush();
    } catch {
      if (this.stopped) return;
      this.set({ status: 'offline' });
      this.scheduleRetry(() => this.start(force));
    }
  }

  // Another screen had the run. Take it on purpose.
  takeOver() { return this.start(true); }

  // Call with every change to the night. Cheap: it only remembers the latest and sends it shortly.
  update(state: GameState) {
    if (this.stopped) return;
    const now = this.now();
    if (state.nightId) {
      const pub = toPublicState(state, now);
      const games = gamesForPush(state.nightId, state.games);
      const gamesSig = gamesSignature(games);
      // Nothing the phones show has changed (a pop-up opened, a toast): nothing to send
      const key = `${state.nightId}|${gamesSig}|${JSON.stringify({ ...pub, sentAt: 0 })}`;
      if (key === this.lastKey) return;
      this.lastKey = key;
      const job: NightJob = { nightId: state.nightId, state: pub, startedAt: state.sessionStartedAt, endedAt: null, games, gamesSig };
      this.pending.set(job.nightId, job);
      this.latest = job;
      this.lastNight = { nightId: state.nightId, state: pub, startedAt: state.sessionStartedAt, games, gamesSig };
    } else if (this.lastNight) {
      // The night was finished (or cleared): tell the phones it's over, with its final game list
      const { nightId, state: last, startedAt, games, gamesSig } = this.lastNight;
      this.pending.set(nightId, { nightId, state: { ...last, sentAt: now }, startedAt, endedAt: now, games, gamesSig });
      this.lastNight = null;
      this.latest = null;
      this.lastKey = '';
    } else {
      return; // Nothing tonight yet
    }
    this.persist();
    this.set({ pending: true });
    if (this.debounce) this.clearTimer(this.debounce);
    this.debounce = this.setTimer(() => { this.debounce = null; void this.flush(); }, this.debounceMs);
  }

  // Send now (the browser came back online, or the page is closing)
  flushNow() {
    if (this.stopped) return Promise.resolve();
    if (this.debounce) { this.clearTimer(this.debounce); this.debounce = null; }
    if (this.retry) { this.clearTimer(this.retry); this.retry = null; }
    if (this.snap.status === 'offline' && this.pending.size === 0) return this.start();
    return this.flush();
  }

  stop() {
    this.set({ status: 'stopped' });
    this.stopped = true;
    [this.debounce, this.retry, this.beat].forEach(t => t && this.clearTimer(t));
    this.debounce = this.retry = this.beat = null;
  }

  private nextVersion() {
    this.version = Math.max(this.version + 1, this.now());
    return this.version;
  }

  private async sendNight(job: NightJob): Promise<{ result: PushResult; version: number }> {
    let version = this.nextVersion();
    const send = (v: number) => this.api.pushNight({ runId: this.runId, device: this.device, nightId: job.nightId, version: v, state: { ...job.state, sentAt: this.now() }, startedAt: job.startedAt, endedAt: job.endedAt });
    let result = await send(version);
    if (result === 'stale' && !this.stopped) {
      // The database already has a higher version (another screen with a faster clock wrote before).
      // Jump past it and send once more.
      const have = await this.api.serverVersion(job.nightId);
      if (this.stopped) return { result, version };
      if (have !== null) this.version = Math.max(this.version, have);
      version = this.nextVersion();
      result = await send(version);
    }
    return { result, version };
  }

  private async flush(): Promise<void> {
    if (this.stopped || this.snap.status === 'taken' || this.snap.status === 'starting') return;
    if (this.flushing) { this.again = true; return; }
    this.flushing = true;
    try {
      // Oldest night first, so a night finished offline closes before tonight carries on
      while (!this.stopped && this.pending.size > 0) {
        const job = this.pending.values().next().value as NightJob;
        const night = await this.sendNight(job);
        if (this.stopped) return;
        if (night.result === 'taken') { this.lostClaim(); return; }
        // A finished night always sends its final game list (even an empty one, after an Undo);
        // otherwise only when the list changed
        if (night.result === 'ok' && (job.endedAt !== null || this.sentGames.get(job.nightId) !== job.gamesSig)) {
          const g = await this.api.pushGames(this.runId, this.device, job.nightId, night.version, job.games);
          if (this.stopped) return;
          if (g === 'taken') { this.lostClaim(); return; }
          this.sentGames.set(job.nightId, job.gamesSig);
        }
        if (this.pending.get(job.nightId) === job) this.pending.delete(job.nightId);
        this.persist();
      }
      this.failures = 0;
      this.set({ status: 'live', lastSyncedAt: this.now() });
    } catch {
      if (this.stopped) return;
      this.set({ status: 'offline' });
      this.scheduleRetry(() => this.flush());
    } finally {
      this.flushing = false;
    }
    if (this.again && !this.stopped) { this.again = false; await this.flush(); }
  }

  private lostClaim() {
    this.again = false;
    if (this.beat) { this.clearTimer(this.beat); this.beat = null; }
    void this.api.claim(this.runId, this.device, false)
      .then(r => {
        if (this.stopped) return;
        if (!r.claimed) { this.set({ status: 'taken', writer: r.writer }); return; }
        this.set({ status: 'live', writer: null });
        this.scheduleBeat();
        void this.flush();
      })
      .catch(() => { if (!this.stopped) this.set({ status: 'taken', writer: null }); });
  }

  private scheduleRetry(fn: () => void) {
    if (this.stopped) return;
    if (this.retry) this.clearTimer(this.retry);
    const ms = RETRY_MS[Math.min(this.failures, RETRY_MS.length - 1)];
    this.failures += 1;
    this.retry = this.setTimer(() => { this.retry = null; if (!this.stopped) fn(); }, ms);
  }

  // Every so often, say this screen is still here (a quiet screen loses the run after 2 minutes)
  private scheduleBeat() {
    if (this.stopped) return;
    if (this.beat) this.clearTimer(this.beat);
    this.beat = this.setTimer(async () => {
      this.beat = null;
      if (this.stopped || this.snap.status === 'taken') return;
      try {
        const r = await this.api.claim(this.runId, this.device, false);
        if (this.stopped) return;
        if (!r.claimed) { this.set({ status: 'taken', writer: r.writer }); return; }
        if (this.snap.status === 'offline') { this.set({ status: 'live' }); void this.flush(); }
      } catch {
        if (this.stopped) return;
        this.set({ status: 'offline' });
      }
      this.scheduleBeat();
    }, this.heartbeatMs);
  }
}
