import React from 'react';
import { GameState } from '../types';

// A second window (on a TV or projector) shows court view and follows the main screen.
// Both windows are on the same computer, so they talk through the browser itself. No server.
export const TV_CHANNEL = 'pbm-tv';

export type TvMessage =
  | { type: 'state'; state: GameState; sample: boolean; sentAt: number }
  | { type: 'hello' };

export const isTvLink = () => {
  try { return new URLSearchParams(window.location.search).has('tv'); } catch { return false; }
};

export const tvSupported = () => typeof BroadcastChannel !== 'undefined';

export const openTvWindow = () => {
  const url = `${window.location.origin}${window.location.pathname}?tv=1`;
  return window.open(url, 'pbm-tv', 'popup=yes,width=1280,height=720');
};

// The main screen sends what's on court whenever it changes, and answers a TV window that says hello.
// Only the screen in front of the runner (the real night, or the sample while it's open) sends.
export const useTvBroadcast = (state: GameState, sample: boolean, active: boolean) => {
  const channel = React.useRef<BroadcastChannel | null>(null);
  const latest = React.useRef({ state, sample });
  latest.current = { state, sample };

  React.useEffect(() => {
    if (!active || !tvSupported()) return;
    const c = new BroadcastChannel(TV_CHANNEL);
    channel.current = c;
    const send = () => {
      try { c.postMessage({ type: 'state', state: latest.current.state, sample: latest.current.sample, sentAt: Date.now() } as TvMessage); } catch { /* closing */ }
    };
    c.onmessage = (e: MessageEvent) => { if ((e.data as TvMessage | undefined)?.type === 'hello') send(); };
    send();
    return () => { channel.current = null; c.close(); };
  }, [active]);

  React.useEffect(() => {
    const c = channel.current;
    if (!active || !c) return;
    try { c.postMessage({ type: 'state', state, sample, sentAt: Date.now() } as TvMessage); } catch { /* closing */ }
  }, [state, sample, active]);
};
