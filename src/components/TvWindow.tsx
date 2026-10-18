import React from 'react';
import { GameProvider, useGame } from '../context/GameContext';
import { ToastProvider } from './ui/Toast';
import CourtView from './CourtView';
import { TV_CHANNEL, TvMessage, tvSupported } from '../utils/tvLink';
import { GameState } from '../types';

const REAL_SESSION_KEY = 'pbm-session-v1';

// Reads what the main screen last saved, so the TV has something to show straight away.
// Read only: this window never saves anything.
const savedState = (): Partial<GameState> | null => {
  try {
    const raw = window.localStorage.getItem(REAL_SESSION_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && data.state ? data.state : null;
  } catch {
    return null;
  }
};

const Follower: React.FC = () => {
  const { setGameState } = useGame();
  const [link, setLink] = React.useState<'waiting' | 'live' | 'lost'>('waiting');
  const [sample, setSample] = React.useState(false);
  const lastHeard = React.useRef(0);

  React.useEffect(() => {
    document.title = 'Court view · Pickup Basketball Manager';
    const show = (state: Partial<GameState>) => setGameState(prev => ({ ...prev, ...state, showShootoutModal: false, manualMode: false }));

    const saved = savedState();
    if (saved) show(saved);

    // Without BroadcastChannel, follow the real night through its saves
    const onStorage = (e: StorageEvent) => {
      if (e.key !== REAL_SESSION_KEY || !e.newValue) return;
      try { const d = JSON.parse(e.newValue); if (d && d.state) { show(d.state); lastHeard.current = Date.now(); setLink('live'); } } catch { /* ignore */ }
    };
    window.addEventListener('storage', onStorage);
    if (!tvSupported()) return () => window.removeEventListener('storage', onStorage);

    const c = new BroadcastChannel(TV_CHANNEL);
    c.onmessage = (e: MessageEvent) => {
      const m = e.data as TvMessage | undefined;
      if (!m || m.type !== 'state' || !m.state) return;
      show(m.state);
      setSample(!!m.sample);
      lastHeard.current = Date.now();
      setLink('live');
    };
    const hello = () => { try { c.postMessage({ type: 'hello' } as TvMessage); } catch { /* closing */ } };
    hello();
    // A hello every few seconds doubles as a check that the main screen is still there
    const ping = setInterval(hello, 4000);
    const watch = setInterval(() => {
      if (lastHeard.current && Date.now() - lastHeard.current > 12000) setLink('lost');
    }, 2000);
    return () => {
      clearInterval(ping);
      clearInterval(watch);
      window.removeEventListener('storage', onStorage);
      c.close();
    };
  }, [setGameState]);

  return <CourtView viewer link={link} isSample={sample} onClose={() => window.close()} />;
};

// The second-screen window: its own in-memory copy that only follows the main screen
const TvWindow: React.FC = () => (
  <ToastProvider>
    <GameProvider>
      <Follower />
    </GameProvider>
  </ToastProvider>
);

export default TvWindow;
