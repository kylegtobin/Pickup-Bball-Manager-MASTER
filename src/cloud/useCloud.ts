import React from 'react';
import type { Session } from '@supabase/supabase-js';
import { GameState } from '../types';
import type { SyncEngine, SyncSnapshot } from './syncEngine';
import { screenId, readCloudSwitch, setCloudSwitch, savedRunId, saveRunId, sharingPaused, setSharingPaused } from './config';
import type { RunInfo } from './live';

type LiveModule = typeof import('./live');

export interface CloudController {
  on: boolean; // Phone view is switched on for this browser
  ready: boolean;
  session: Session | null;
  runs: RunInfo[];
  run: RunInfo | null;
  sync: SyncSnapshot | null;
  paused: boolean;
  error: string | null;
  sendCode: (email: string) => Promise<boolean>;
  verifyCode: (email: string, code: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  createRun: (name: string, gym: string) => Promise<void>;
  resetLink: () => Promise<boolean>;
  takeOver: () => void;
  setPaused: (paused: boolean) => void;
  clearError: () => void;
  turnOff: () => void; // Switch phone view off on this browser (stops sharing; stays signed in)
}

const message = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  if (/rate limit|too many/i.test(m)) return 'Too many emails for now. Wait a few minutes and try again.';
  if (/expired|invalid/i.test(m)) return "That code didn't work. Check it, or send a new one.";
  if (/fetch|network/i.test(m)) return "Can't reach the server. Check the internet connection.";
  return m;
};

// Everything the courtside screen needs for phone view. Does nothing (loads nothing) while switched off.
export const useCloud = (gameState: GameState, enabled: boolean): CloudController => {
  const [on, setOn] = React.useState(readCloudSwitch);
  const active = on && enabled;
  const [mod, setMod] = React.useState<LiveModule | null>(null);
  const [session, setSession] = React.useState<Session | null>(null);
  const [runs, setRuns] = React.useState<RunInfo[]>([]);
  const [runId, setRunId] = React.useState<string | null>(savedRunId);
  const [sync, setSync] = React.useState<SyncSnapshot | null>(null);
  const [paused, setPausedState] = React.useState(sharingPaused);
  // A sign-in link opened somewhere it can't finish (another device or browser) comes back with an error
  const [error, setError] = React.useState<string | null>(() => {
    try {
      const u = new URL(window.location.href);
      const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
      if (!u.searchParams.has('error_description') && !hash.has('error_description')) return null;
      ['error', 'error_code', 'error_description'].forEach(k => u.searchParams.delete(k));
      window.history.replaceState(window.history.state, '', u.pathname + u.search);
      return "That sign-in link didn't work. Open it on the same computer that asked for it, or send a new one.";
    } catch { return null; }
  });
  const engine = React.useRef<SyncEngine | null>(null);
  const latest = React.useRef(gameState);
  latest.current = gameState;

  // Load the server code only when it's needed
  React.useEffect(() => {
    if (!active || mod) return;
    let gone = false;
    import('./live').then(m => { if (!gone) setMod(m); }).catch(() => setError("Couldn't load phone view. Check the internet connection."));
    return () => { gone = true; };
  }, [active, mod]);

  // Who's signed in on this browser
  React.useEffect(() => {
    if (!mod || !active) return;
    let gone = false;
    mod.cloud.session().then(s => { if (!gone) setSession(s); }).catch(() => undefined);
    const off = mod.cloud.onAuth(s => setSession(s));
    return () => { gone = true; off(); };
  }, [mod, active]);

  // A sign-in link leaves a code in the address bar; tidy it away once it's used
  React.useEffect(() => {
    if (!session) return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('code')) {
        u.searchParams.delete('code');
        window.history.replaceState(null, '', u.pathname + (u.search === '?' ? '' : u.search) + u.hash);
      }
    } catch { /* fine */ }
  }, [session]);

  // This account's runs
  const userId = session?.user.id ?? null;
  React.useEffect(() => {
    if (!mod || !userId) { setRuns([]); return; }
    let gone = false;
    mod.cloud.myRuns().then(list => {
      if (gone) return;
      setRuns(list);
      setRunId(id => {
        const keep = id && list.some(r => r.id === id) ? id : list.length === 1 ? list[0].id : null;
        saveRunId(keep);
        return keep;
      });
    }).catch(e => { if (!gone) setError(message(e)); });
    return () => { gone = true; };
  }, [mod, userId]);

  const run = runs.find(r => r.id === runId) ?? null;
  const syncRun = run?.id ?? null;

  // Run the sync while signed in, a run is chosen, and sharing isn't paused
  React.useEffect(() => {
    if (!mod || !userId || !syncRun || paused || !active) { setSync(null); return; }
    let e: SyncEngine | null = null;
    let gone = false;
    const flush = () => { void e?.flushNow(); };
    // Which screen this is (this browser and this tab) takes a moment to settle, then sharing starts
    void screenId().then(id => {
      if (gone) return;
      e = new mod.SyncEngine(mod.syncApi, syncRun, id, { onChange: setSync, store: mod.localPendingStore(syncRun) });
      engine.current = e;
      e.update(latest.current);
      void e.start();
    });
    window.addEventListener('online', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      gone = true;
      window.removeEventListener('online', flush);
      window.removeEventListener('pagehide', flush);
      e?.stop();
      if (engine.current === e) engine.current = null;
    };
  }, [mod, userId, syncRun, paused, active]);

  React.useEffect(() => { engine.current?.update(gameState); }, [gameState]);

  const guard = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    setError(null);
    try { return await fn(); } catch (e) { setError(message(e)); return fallback; }
  };

  return {
    on,
    ready: !!mod,
    session,
    runs,
    run,
    sync,
    paused,
    error,
    sendCode: email => guard(async () => { await mod!.cloud.sendCode(email); return true; }, false),
    verifyCode: (email, code) => guard(async () => { await mod!.cloud.verifyCode(email, code); return true; }, false),
    signOut: () => guard(async () => { await mod!.cloud.signOut(); saveRunId(null); setRunId(null); }, undefined),
    createRun: (name, gym) => guard(async () => {
      const r = await mod!.cloud.createRun(name, gym || null);
      setRuns(list => [...list, r]);
      setRunId(r.id);
      saveRunId(r.id);
    }, undefined),
    resetLink: () => guard(async () => {
      if (!run) return false;
      const fresh = await mod!.cloud.resetLink(run.id);
      setRuns(list => list.map(r => (r.id === run.id ? fresh : r)));
      return true;
    }, false),
    takeOver: () => { void engine.current?.takeOver(); },
    setPaused: p => { setSharingPaused(p); setPausedState(p); },
    clearError: () => setError(null),
    turnOff: () => {
      setCloudSwitch(false);
      setOn(false);
      // Stop the sign-in library's background work too (it stays signed in for next time)
      void mod?.shutdown();
    },
  };
};
