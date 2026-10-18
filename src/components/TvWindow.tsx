import React from 'react';
import { GameProvider, useGame } from '../context/GameContext';
import { ToastProvider } from './ui/Toast';
import CourtView from './CourtView';
import { TvMessage } from '../utils/tvLink';
import { GameState } from '../types';

const Follower: React.FC = () => {
  const { setGameState } = useGame();
  const [link, setLink] = React.useState<'waiting' | 'live' | 'lost' | 'none'>(() => (window.opener ? 'waiting' : 'none'));
  const [sample, setSample] = React.useState(false);
  const [phoneCode, setPhoneCode] = React.useState<string | null>(null);
  const lastHeard = React.useRef(0);

  React.useEffect(() => {
    document.title = 'Court view · Pickup Basketball Manager';
    const opener = window.opener as Window | null;
    if (!opener) return;
    const show = (state: Partial<GameState>) => setGameState(prev => ({ ...prev, ...state, showShootoutModal: false, manualMode: false }));
    // Only the window that opened this one
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.opener) return;
      const m = e.data as TvMessage | undefined;
      if (!m || m.type !== 'pbm-tv-state' || !m.state) return;
      show(m.state);
      setSample(!!m.sample);
      setPhoneCode(m.phoneCode ?? null);
      lastHeard.current = Date.now();
      setLink('live');
    };
    window.addEventListener('message', onMessage);
    const hello = () => {
      const o = window.opener as Window | null;
      if (!o || o.closed) return;
      try { o.postMessage({ type: 'pbm-tv-hello' } as TvMessage, window.location.origin); } catch { /* gone */ }
    };
    hello();
    // A hello every few seconds doubles as a check that the main screen is still there (and finds it again after a reload)
    const ping = setInterval(hello, 4000);
    const started = Date.now();
    const watch = setInterval(() => {
      const o = window.opener as Window | null;
      // Gone, quiet for 12 seconds, or never answered at all
      const quiet = Date.now() - (lastHeard.current || started) > 12000;
      if (!o || o.closed || quiet) setLink(l => (l === 'none' ? l : 'lost'));
    }, 2000);
    return () => {
      clearInterval(ping);
      clearInterval(watch);
      window.removeEventListener('message', onMessage);
    };
  }, [setGameState]);

  return <CourtView viewer link={link === 'none' ? 'unlinked' : link} isSample={sample} phoneCode={phoneCode} onClose={() => window.close()} />;
};

// The second-screen window: its own in-memory copy that only follows the window that opened it
const TvWindow: React.FC = () => (
  <ToastProvider>
    <GameProvider>
      <Follower />
    </GameProvider>
  </ToastProvider>
);

export default TvWindow;
