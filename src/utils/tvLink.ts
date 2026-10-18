import React from 'react';
import { GameState } from '../types';

// A second window (on a TV or projector) shows court view and follows the main screen.
// The TV window talks only to the window that opened it, directly, so another tab (even a duplicated
// one) can never take it over, and a reload of the main tab picks the TV straight back up. No server.

export type TvMessage =
  | { type: 'pbm-tv-hello' }
  | { type: 'pbm-tv-state'; state: GameState; sample: boolean; sentAt: number; phoneCode?: string | null };

export const isTvLink = () => {
  try { return new URLSearchParams(window.location.search).has('tv'); } catch { return false; }
};

export const tvSupported = () => typeof window !== 'undefined' && typeof window.open === 'function' && typeof window.postMessage === 'function';

export const TV_BLOCKED_MESSAGE = 'Your browser blocked the second-screen window. Allow pop-ups for this site (the icon at the right of the address bar), then press Second screen again.';

// Returns false when the browser blocked the window, so the button can say what to do
export const openTvWindow = (): boolean => {
  const url = `${window.location.origin}${window.location.pathname}?tv=1`;
  try {
    const w = window.open(url, 'pbm-tv', 'popup=yes,width=1280,height=720');
    if (!w) return false;
    try { w.focus(); } catch { /* fine */ }
    return true;
  } catch {
    return false;
  }
};

// TV windows that have said hello to this tab. Shared by the real night and the sample in this tab,
// so switching between them keeps the TV.
const viewers = new Set<Window>();

const post = (w: Window, msg: TvMessage) => {
  try { w.postMessage(msg, window.location.origin); } catch { viewers.delete(w); }
};

// The main screen answers each hello from a TV window it opened and sends what's on court whenever it changes.
// Only the screen in front of the runner (the real night, or the sample while it's open) answers and sends.
export const useTvBroadcast = (state: GameState, sample: boolean, active: boolean, phoneCode: string | null = null) => {
  const latest = React.useRef({ state, sample, phoneCode });
  latest.current = { state, sample, phoneCode };

  React.useEffect(() => {
    if (!active) return;
    const msg = (): TvMessage => ({ type: 'pbm-tv-state', state: latest.current.state, sample: latest.current.sample, sentAt: Date.now(), phoneCode: latest.current.phoneCode });
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || (e.data as TvMessage | undefined)?.type !== 'pbm-tv-hello' || !e.source) return;
      const w = e.source as Window;
      viewers.add(w);
      post(w, msg());
    };
    window.addEventListener('message', onMessage);
    viewers.forEach(w => (w.closed ? viewers.delete(w) : post(w, msg())));
    return () => window.removeEventListener('message', onMessage);
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
    viewers.forEach(w => (w.closed ? viewers.delete(w) : post(w, { type: 'pbm-tv-state', state, sample, sentAt: Date.now(), phoneCode })));
  }, [state, sample, active, phoneCode]);
};
