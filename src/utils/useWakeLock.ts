import { useEffect } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };

// Keeps the screen from sleeping while active (a running game clock, or court view on a TV).
// Quietly does nothing in browsers that don't support it.
export const useWakeLock = (active: boolean) => {
  useEffect(() => {
    const nav = navigator as NavigatorWithWakeLock;
    if (!active || !nav.wakeLock) return;
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const l = await nav.wakeLock!.request('screen');
        if (cancelled) { l.release().catch(() => {}); return; }
        lock = l;
      } catch { /* not allowed right now (battery saver, hidden tab) */ }
    };
    // The browser drops the lock when the tab is hidden; ask again when it's back
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) lock.release().catch(() => {});
    };
  }, [active]);
};
