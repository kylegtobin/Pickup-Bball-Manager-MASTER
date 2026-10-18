import React from 'react';
import { useGame } from '../context/GameContext';
import { decide, timeLeft, clockState, formatClock, endedByText, Side } from '../utils/score';
import { useDialogFocus } from '../utils/useDialogFocus';

const useTick = (on: boolean) => {
  const [, setN] = React.useState(0);
  React.useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setN(n => n + 1), 250);
    return () => clearInterval(id);
  }, [on]);
};

const TEAM = {
  champions: { name: 'Champions', color: '#FF7A1A', solid: '#E85A00', hover: 'hover:bg-[#C94E00]' },
  challengers: { name: 'Challengers', color: '#7FA7FF', solid: '#1E3A8A', hover: 'hover:bg-[#172E6E]' },
} as const;

// Simple scorekeeping for the runner: +1 / +2 per team, a 12:00 clock, and the house rules.
const Scoreboard: React.FC<{ stickyTop: string }> = ({ stickyTop }) => {
  const { gameState, addPoints, startClock, pauseClock, adjustClock, handleGameEnd } = useGame();
  const { score, clock, champions, challengers, status } = gameState;
  const gameOn = champions.length === 5 && challengers.length === 5 && status !== 'SHOOTOUT';
  const now = Date.now();
  const state = clockState(clock, now);
  useTick(gameOn && state === 'running');

  const outcome = decide(score, clock, now);
  const decidedKey = outcome.winner ? `${gameState.games.length}-${outcome.winner}-${score.champions}-${score.challengers}` : null;
  const [dismissed, setDismissed] = React.useState<string | null>(null);
  const [fixing, setFixing] = React.useState(false);
  const [adjusting, setAdjusting] = React.useState(false);
  const [recording, setRecording] = React.useState(false);

  // A new game (or a recorded result) starts clean
  React.useEffect(() => { setFixing(false); setDismissed(null); setRecording(false); setAdjusting(false); }, [gameState.games.length]);
  React.useEffect(() => { if (state === 'running') setAdjusting(false); }, [state]);
  // Once play is undecided again, the next win gets its own pop-up
  React.useEffect(() => { if (!decidedKey) setDismissed(null); }, [decidedKey]);

  // The pop-up waits while the runner is fixing the score
  const showPopup = gameOn && !!decidedKey && !fixing && dismissed !== decidedKey && !recording;
  const popupRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(popupRef, showPopup);

  if (!gameOn) return null;

  const left = timeLeft(clock, now);
  const decided = !!outcome.winner;

  const record = () => {
    if (!outcome.winner || recording) return;
    setRecording(true);
    handleGameEnd(outcome.winner, outcome.endedBy ?? 'points');
  };

  const clockButton = state === 'running'
    ? { label: 'Pause', onClick: pauseClock, cls: 'bg-white text-[#0E1A33] hover:bg-gray-100' }
    : state === 'not-started'
      ? { label: 'Start', onClick: startClock, cls: 'bg-[#22C55E] text-[#0E1A33] hover:bg-[#16A34A]' }
      : state === 'paused'
        ? { label: 'Resume', onClick: startClock, cls: 'bg-[#22C55E] text-[#0E1A33] hover:bg-[#16A34A]' }
        : null;

  const statusText = outcome.nextBucket
    ? `Time. Tied ${score.champions}–${score.challengers}. Next bucket wins.`
    : decided
      ? `${TEAM[outcome.winner!].name} win ${Math.max(score.champions, score.challengers)}–${Math.min(score.champions, score.challengers)}`
      : state === 'running' ? 'Running' : state === 'paused' ? 'Paused' : state === 'time' ? 'Time' : 'Not started';

  const teamSide = (side: Side) => {
    const t = TEAM[side];
    const scoringOff = decided && !fixing;
    const plus = (n: number) => (
      <button
        type="button"
        onClick={() => addPoints(side, n, fixing)}
        disabled={scoringOff}
        aria-label={`Add ${n} for the ${t.name}`}
        className={`w-14 h-12 rounded-lg text-xl font-extrabold text-white transition-colors ${scoringOff ? 'opacity-30 cursor-not-allowed' : t.hover}`}
        style={{ backgroundColor: t.solid }}
      >
        +{n}
      </button>
    );
    const fix = (
      <button
        type="button"
        onClick={() => addPoints(side, -1, true)}
        aria-label={`Take 1 away from the ${t.name}`}
        className="w-14 h-12 rounded-lg text-xl font-extrabold bg-white/10 text-white hover:bg-white/20 border border-white/30"
      >
        −1
      </button>
    );
    const number = (
      <div className="text-center min-w-[4.5rem]">
        <div className="text-xs font-bold uppercase tracking-wide" style={{ color: t.color }}>{t.name}</div>
        <div className="text-5xl font-black tabular-nums leading-none text-white" aria-live="polite">{score[side]}</div>
      </div>
    );
    return side === 'champions'
      ? <div className="flex items-center gap-2">{number}{plus(1)}{plus(2)}{fixing && fix}</div>
      : <div className="flex items-center gap-2 justify-end">{fixing && fix}{plus(1)}{plus(2)}{number}</div>;
  };

  return (
    <>
      <div className={`sticky ${stickyTop} z-40 mb-4 rounded-xl bg-[#0E1A33] shadow-lg px-4 py-3`} role="region" aria-label="Scoreboard">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {teamSide('champions')}
          <div className="flex flex-col items-center gap-1 min-w-[13rem]">
            <div className="flex items-center gap-3">
              <span className={`text-4xl font-black tabular-nums leading-none ${state === 'time' ? 'text-red-400' : 'text-white'}`}>{formatClock(left)}</span>
              {clockButton && (
                <button type="button" onClick={clockButton.onClick} disabled={decided && !outcome.nextBucket} className={`px-4 h-10 rounded-lg font-extrabold disabled:opacity-30 ${clockButton.cls}`}>
                  {clockButton.label}
                </button>
              )}
            </div>
            <div className={`text-sm font-semibold text-center ${outcome.nextBucket ? 'text-[#F5B301]' : decided ? 'text-white' : 'text-white/60'}`}>{statusText}</div>
            <div className="flex items-center gap-3 text-sm">
              {(state === 'paused' || state === 'not-started' || state === 'time') && (
                <button type="button" onClick={() => setAdjusting(a => !a)} className="h-9 px-3 rounded-md border border-white/30 text-white/80 font-semibold hover:bg-white/10">
                  {adjusting ? 'Done adjusting' : 'Adjust time'}
                </button>
              )}
              <button type="button" onClick={() => setFixing(f => !f)} aria-pressed={fixing} className={`h-9 px-3 rounded-md border font-semibold ${fixing ? 'bg-white text-[#0E1A33] border-white' : 'border-white/30 text-white/80 hover:bg-white/10'}`}>
                {fixing ? 'Done fixing' : 'Fix score'}
              </button>
              {decided && !showPopup && (
                <button type="button" onClick={record} disabled={recording} className="h-9 px-3 rounded-md bg-[#F5B301] text-[#0E1A33] font-bold">
                  Record result
                </button>
              )}
            </div>
            {adjusting && (
              <div className="flex gap-2 mt-1">
                {[[-60000, '−1:00'], [-10000, '−0:10'], [10000, '+0:10'], [60000, '+1:00']].map(([d, label]) => (
                  <button key={label} type="button" onClick={() => adjustClock(d as number)} className="px-2.5 h-9 rounded-md bg-white/10 text-white font-bold hover:bg-white/20 border border-white/25">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {teamSide('challengers')}
        </div>
      </div>

      {showPopup && outcome.winner && (
        <div className="fixed inset-0 z-[58] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" />
          <div ref={popupRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Game over" className="relative outline-none bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center border-t-[10px]" style={{ borderTopColor: TEAM[outcome.winner].solid }}>
            <p className="text-sm font-bold uppercase tracking-wide text-gray-500">Game over · {endedByText(outcome.endedBy)}</p>
            <h2 className="text-3xl font-black text-[#1B2430] mt-1">
              {TEAM[outcome.winner].name} win {Math.max(score.champions, score.challengers)}–{Math.min(score.champions, score.challengers)}
            </h2>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={record}
                disabled={recording}
                className="w-full py-3 rounded-xl text-white text-lg font-extrabold disabled:opacity-50"
                style={{ backgroundColor: TEAM[outcome.winner].solid }}
              >
                Record result
              </button>
              <button
                type="button"
                onClick={() => { setDismissed(decidedKey); setFixing(true); }}
                className="w-full py-3 rounded-xl border border-[#D5DAE1] text-[#1B2430] text-lg font-bold hover:bg-gray-50"
              >
                Correct score
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-4">Recording rotates the line like the {TEAM[outcome.winner].name} Won button.</p>
          </div>
        </div>
      )}
    </>
  );
};

export default Scoreboard;
