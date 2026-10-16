import React from 'react';
import { useGame } from '../context/GameContext';
import { Player } from '../types';
import { previewNextUp } from '../utils/formChallengers';

const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const NameChip: React.FC<{ name: string; tone?: 'plain' | 'shoot' }> = ({ name, tone = 'plain' }) => (
  <span
    className={`inline-flex items-center rounded-lg px-3 py-2 text-[clamp(1.25rem,min(2.3vw,4.6vh),3rem)] font-bold leading-none ${
      tone === 'shoot' ? 'bg-[#F5B301] text-[#14213D]' : 'bg-white/10 text-white'
    }`}
  >
    {name}
  </span>
);

const TeamColumn: React.FC<{ label: string; players: Player[]; accent: string; streak?: number }> = ({ label, players, accent, streak }) => (
  <div className="flex-1 min-w-0 flex flex-col rounded-2xl bg-white/[0.06] p-[clamp(1rem,2vw,2rem)]" style={{ boxShadow: `inset 0 6px 0 ${accent}` }}>
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-[clamp(0.5rem,1.2vw,1.25rem)]">
      <h2 className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold" style={{ color: accent }}>{label}</h2>
      {streak !== undefined && streak >= 2 && (
        <span className="whitespace-nowrap rounded-full bg-[#E85A00] text-white px-3 py-1 text-[clamp(0.9rem,1.3vw,1.25rem)] font-bold">
          {streak} straight wins
        </span>
      )}
    </div>
    <ol className="flex-1 flex flex-col justify-evenly">
      {players.map(p => (
        <li key={p.id} className="text-[clamp(1.75rem,min(3.7vw,8vh),5rem)] font-extrabold leading-tight text-white truncate">{p.name}</li>
      ))}
      {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => (
        <li key={`open-${i}`} className="text-[clamp(1.75rem,min(3.7vw,8vh),5rem)] font-bold leading-tight text-white/25">Open spot</li>
      ))}
    </ol>
  </div>
);

// Full-screen view for the court: who's playing, the game clock, and who's next (including a likely shootout).
const CourtView: React.FC<{ onClose: () => void; isSample?: boolean }> = ({ onClose, isSample }) => {
  const { gameState } = useGame();
  const { champions, challengers, waitingQueue, gameStartTime, championStreak } = gameState;
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const close = React.useCallback(() => {
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch { /* ignore */ }
    onClose();
  }, [onClose]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const goFullScreen = () => {
    try { document.documentElement.requestFullscreen?.(); } catch { /* not allowed here */ }
  };

  const gameOn = champions.length === 5 && challengers.length === 5;
  const next = previewNextUp(waitingQueue);
  const lineEmpty = waitingQueue.length === 0;

  return (
    <div className="fixed inset-0 z-[65] bg-[#0E1A33] text-white overflow-auto" role="dialog" aria-label="Court view">
      <div className="h-full min-h-[32rem] flex flex-col gap-[clamp(1rem,2.5vh,2rem)] px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,3vh,2.5rem)]">
        {/* Top row */}
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-4 flex-1 min-w-0">
            <h1 className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold text-white/90">Now playing</h1>
            {isSample && <span className="rounded-full bg-[#F5B301] text-[#14213D] px-3 py-1 text-sm font-bold">Sample with made-up players</span>}
          </div>
          <div className="text-right">
            <div className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-white/60">Game clock</div>
            <div className="text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold tabular-nums leading-none">
              {gameStartTime ? formatClock(now - gameStartTime) : '--:--'}
            </div>
          </div>
          <div className="flex gap-2 ml-4">
            <button onClick={goFullScreen} className="rounded-lg border border-white/30 px-4 py-2 font-semibold hover:bg-white/10">Full screen</button>
            <button onClick={close} className="rounded-lg bg-white text-[#0E1A33] px-4 py-2 font-bold hover:bg-white/90">Exit</button>
          </div>
        </div>

        <div className="flex-1 flex gap-[clamp(1rem,2vw,2rem)] items-stretch min-h-0">
        {/* Teams */}
        <div className="flex-[2] flex gap-[clamp(0.75rem,1.5vw,1.5rem)] items-stretch min-w-0">
          <TeamColumn label="Champions" players={champions} accent="#FF7A1A" streak={championStreak} />
          <div className="self-center text-[clamp(1rem,2vw,2rem)] font-black text-white/40">vs</div>
          <TeamColumn label="Challengers" players={challengers} accent="#7FA7FF" />
        </div>

        {/* Next up */}
        <div className="flex-1 min-w-0 rounded-2xl bg-white/[0.06] p-[clamp(1rem,2vw,2rem)]" style={{ boxShadow: 'inset 0 6px 0 #F5B301' }}>
          <h2 className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold text-white/90 mb-3">
            {gameOn ? 'Next up' : 'Waiting for 10 players'}
          </h2>
          {gameOn ? (
            <div className="flex flex-col gap-4">
              {next.picked.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {next.picked.map(p => <NameChip key={p.id} name={p.name} />)}
                </div>
              )}
              {next.losersFill === 5 && (
                <p className="text-[clamp(1.1rem,1.6vw,1.75rem)] font-bold text-white/80">Nobody's waiting, so the same two teams run it back.</p>
              )}
              {next.shootout && (
                <div className="rounded-xl border-2 border-[#F5B301] bg-[#F5B301]/10 p-4">
                  <p className="text-[clamp(1.1rem,1.6vw,1.75rem)] font-extrabold text-[#F5B301] mb-3 leading-snug">
                    {next.picked.length > 0 ? 'Then a' : 'A'} shootout for {next.shootout.spots} {next.shootout.spots === 1 ? 'spot' : 'spots'}
                  </p>
                  {next.shootout.players ? (
                    <div className="flex flex-wrap gap-2">
                      {next.shootout.players.map(p => <NameChip key={p.id} name={p.name} tone="shoot" />)}
                    </div>
                  ) : (
                    <p className="text-[clamp(1.1rem,1.7vw,1.6rem)] font-semibold text-white/85">This game's losing team shoots for them.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[clamp(1.1rem,1.7vw,1.6rem)] text-white/70">
              {lineEmpty ? 'Sign in on the main screen to get a game going.' : 'Teams fill as players sign in.'}
            </p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default CourtView;
