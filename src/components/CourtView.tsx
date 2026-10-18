import React from 'react';
import { useGame } from '../context/GameContext';
import { Player } from '../types';
import { previewNextUp } from '../utils/formChallengers';
import { decide, timeLeft, clockState, formatClock as formatCountdown, endedByText } from '../utils/score';
import { useDialogFocus } from '../utils/useDialogFocus';

const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const NAME_SIZE = 'text-[clamp(1.75rem,min(3.4vw,7vh),4.75rem)]';

// Every column shares one header shape (label + a fixed-height detail line) and five equal rows,
// so names line up across Champions, Challengers and Next up whether or not a streak badge shows.
const Column: React.FC<{ label: string; accent: string; detail?: React.ReactNode; score?: number | null; children: React.ReactNode }> = ({ label, accent, detail, score, children }) => (
  <div className="flex-1 min-w-0 flex flex-col rounded-2xl bg-white/[0.06] p-[clamp(1rem,2vw,2rem)]" style={{ boxShadow: `inset 0 6px 0 ${accent}` }}>
    <div className="flex items-end justify-between gap-3 h-[clamp(2.25rem,4.6vw,4.75rem)]">
      <h2 className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold leading-tight whitespace-nowrap truncate" style={{ color: accent }}>{label}</h2>
      {score !== undefined && score !== null && (
        <span className="text-[clamp(2.25rem,4.6vw,4.75rem)] font-black tabular-nums leading-none text-white" aria-label={`${label} score`}>{score}</span>
      )}
    </div>
    <div className="h-[clamp(1.75rem,2.6vw,2.5rem)] flex items-center mb-[clamp(0.25rem,0.8vw,0.75rem)]">{detail}</div>
    <ol className="flex-1 flex flex-col min-h-0">{children}</ol>
  </div>
);

const NameRow: React.FC<{ children: React.ReactNode; muted?: boolean }> = ({ children, muted }) => (
  <li className={`flex-1 flex items-center min-h-0 ${NAME_SIZE} leading-tight truncate ${muted ? 'font-bold text-white/25' : 'font-extrabold text-white'}`}>{children}</li>
);

const TeamColumn: React.FC<{ label: string; players: Player[]; accent: string; streak?: number; score?: number | null }> = ({ label, players, accent, streak, score }) => (
  <Column
    label={label}
    accent={accent}
    score={score}
    detail={streak !== undefined && streak >= 2 ? (
      <span className="whitespace-nowrap rounded-full bg-[#E85A00] text-white px-3 py-0.5 text-[clamp(0.85rem,1.2vw,1.15rem)] font-bold">{streak} straight wins</span>
    ) : null}
  >
    {players.map(p => <NameRow key={p.id}>{p.name}</NameRow>)}
    {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => <NameRow key={`open-${i}`} muted>Open spot</NameRow>)}
  </Column>
);

// A block that takes the place of the rows it stands for (a 3-spot shootout fills the last 3 rows)
const SpanBlock: React.FC<{ rows: number; children: React.ReactNode }> = ({ rows, children }) => (
  <li className="min-h-0 flex py-[clamp(0.25rem,0.6vh,0.5rem)]" style={{ flex: rows }}>
    <div className="flex-1 rounded-xl border-2 border-[#F5B301]/60 bg-[#F5B301]/[0.07] px-[clamp(0.75rem,1.4vw,1.5rem)] py-[clamp(0.5rem,1.2vh,1.25rem)] flex flex-col justify-center gap-[clamp(0.5rem,1.4vh,1rem)]">
      {children}
    </div>
  </li>
);

const ShooterChip: React.FC<{ name: string }> = ({ name }) => (
  <span className="inline-flex items-center rounded-lg bg-[#F5B301] text-[#14213D] px-[clamp(0.5rem,0.9vw,1rem)] py-[clamp(0.25rem,0.7vh,0.55rem)] text-[clamp(1.15rem,min(2vw,4vh),2.4rem)] font-extrabold leading-none">{name}</span>
);

const NextUpColumn: React.FC<{ gameOn: boolean; lineEmpty: boolean; next: ReturnType<typeof previewNextUp> }> = ({ gameOn, lineEmpty, next }) => {
  if (!gameOn) {
    return (
      <Column label="Next up" accent="#F5B301">
        <li className="text-[clamp(1.1rem,1.7vw,1.6rem)] text-white/70 pt-2">
          {lineEmpty ? 'Waiting for 10 players. Sign in on the main screen to get a game going.' : 'Waiting for 10 players. Teams fill as players sign in.'}
        </li>
      </Column>
    );
  }
  const spots = next.shootout?.spots ?? 0;
  return (
    <Column label="Next up" accent="#F5B301" detail={<span className="text-[clamp(0.9rem,1.2vw,1.2rem)] font-semibold text-white/60">Plays the winner of this game</span>}>
      {next.picked.map(p => <NameRow key={p.id}>{p.name}</NameRow>)}
      {next.losersFill === 5 && (
        <SpanBlock rows={5}>
          <p className="text-[clamp(1.25rem,min(2vw,4vh),2.25rem)] font-extrabold text-[#F5B301] leading-tight">Same teams run it back</p>
          <p className="text-[clamp(1.05rem,min(1.6vw,3.2vh),1.6rem)] font-semibold text-white/75">Nobody's waiting in line.</p>
        </SpanBlock>
      )}
      {next.shootout && (
        <SpanBlock rows={spots}>
          <p className="text-[clamp(1.25rem,min(2vw,4vh),2.25rem)] font-extrabold text-[#F5B301] leading-tight">
            Shootout for {spots} {spots === 1 ? 'spot' : 'spots'}
          </p>
          {next.shootout.players ? (
            <div className="flex flex-wrap gap-[clamp(0.35rem,0.6vw,0.6rem)]">
              {next.shootout.players.map(p => <ShooterChip key={p.id} name={p.name} />)}
            </div>
          ) : (
            <p className="text-[clamp(1.05rem,min(1.6vw,3.2vh),1.6rem)] font-semibold text-white/80">This game's losing team shoots.</p>
          )}
        </SpanBlock>
      )}
      {Array.from({ length: Math.max(0, 5 - next.picked.length - spots - next.losersFill) }).map((_, i) => <NameRow key={`open-${i}`} muted>Open spot</NameRow>)}
    </Column>
  );
};

// Full-screen view for the court: who's playing, the game clock, and who's next (including a likely shootout).
const CourtView: React.FC<{ onClose: () => void; isSample?: boolean }> = ({ onClose, isSample }) => {
  const { gameState, addPoints, startClock, pauseClock, handleGameEnd, undo, canUndo, undoLabel } = useGame();
  const [fixing, setFixing] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(rootRef);
  React.useEffect(() => { setFixing(false); setRecording(false); }, [gameState.games.length]);
  const { champions, challengers, waitingQueue, gameStartTime, championStreak, score, clock } = gameState;
  const [controls, setControls] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
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
  // Show the scoreboard once it's being used this game; otherwise the plain game clock
  const cState = clockState(clock, now);
  const scoring = gameOn && (cState !== 'not-started' || score.champions + score.challengers > 0);
  const outcome = decide(score, clock, now);
  const scoreNote = !scoring ? null
    : outcome.nextBucket ? 'Time. Next bucket wins'
    : outcome.winner ? `${outcome.winner === 'champions' ? 'Champions' : 'Challengers'} win`
    : cState === 'time' ? 'Time' : cState === 'paused' ? 'Paused' : null;
  const next = previewNextUp(waitingQueue);
  const lineEmpty = waitingQueue.length === 0;

  return (
    <div ref={rootRef} tabIndex={-1} className="fixed inset-0 z-[65] bg-[#0E1A33] text-white overflow-auto outline-none" role="dialog" aria-modal="true" aria-label="Court view">
      <div className="h-full min-h-[32rem] flex flex-col gap-[clamp(1rem,2.5vh,2rem)] px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,3vh,2.5rem)]">
        {/* Top row */}
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-4 flex-1 min-w-0">
            <h1 className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold text-white/90">Now playing</h1>
            {isSample && <span className="rounded-full bg-[#F5B301] text-[#14213D] px-3 py-1 text-sm font-bold">Sample with made-up players</span>}
          </div>
          {scoring ? (
            <div className="text-right">
              <div className={`text-[clamp(0.8rem,1vw,1rem)] font-semibold ${outcome.nextBucket ? 'text-[#F5B301]' : 'text-white/60'}`}>{scoreNote ?? 'Time left'}</div>
              <div className={`text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold tabular-nums leading-none ${cState === 'time' ? 'text-red-400' : ''}`}>
                {formatCountdown(timeLeft(clock, now))}
              </div>
            </div>
          ) : (
            <div className="text-right">
              <div className="text-[clamp(0.8rem,1vw,1rem)] font-semibold text-white/60">Game clock</div>
              <div className="text-[clamp(2rem,4.5vw,4.5rem)] font-extrabold tabular-nums leading-none">
                {gameStartTime ? formatClock(now - gameStartTime) : '--:--'}
              </div>
            </div>
          )}
          <div className="flex gap-2 ml-4">
            {gameOn && (
              <button onClick={() => setControls(c => !c)} className="rounded-lg border border-white/30 px-4 py-2 font-semibold hover:bg-white/10" aria-pressed={controls}>
                {controls ? 'Hide score buttons' : 'Score'}
              </button>
            )}
            <button onClick={goFullScreen} className="rounded-lg border border-white/30 px-4 py-2 font-semibold hover:bg-white/10">Full screen</button>
            <button onClick={close} className="rounded-lg bg-white text-[#0E1A33] px-4 py-2 font-bold hover:bg-white/90">Exit</button>
          </div>
        </div>

        <div className="flex-1 flex gap-[clamp(1rem,2vw,2rem)] items-stretch min-h-0">
        {/* Teams */}
        <div className="flex-[2] flex gap-[clamp(0.75rem,1.5vw,1.5rem)] items-stretch min-w-0">
          <TeamColumn label="Champions" players={champions} accent="#FF7A1A" streak={championStreak} score={scoring ? score.champions : null} />
          <div className="self-center text-[clamp(1rem,2vw,2rem)] font-black text-white/40">vs</div>
          <TeamColumn label="Challengers" players={challengers} accent="#7FA7FF" score={scoring ? score.challengers : null} />
        </div>

        {/* Next up: a third lineup card in the same shape as the teams */}
        <NextUpColumn gameOn={gameOn} lineEmpty={lineEmpty} next={next} />
        </div>

        {/* Optional score buttons, lined up under each team, so the runner never has to leave court view */}
        {controls && gameOn && (() => {
          const decided = !!outcome.winner;
          const off = decided && !fixing;
          const teamButtons = (side: 'champions' | 'challengers', color: string) => (
            <div className="flex-1 flex justify-center gap-2">
              {fixing && (
                <button onClick={() => addPoints(side, -1, true)} aria-label={`Take 1 away from the ${side === 'champions' ? 'Champions' : 'Challengers'}`} className="w-16 h-12 rounded-lg border border-white/40 bg-white/10 text-white text-xl font-extrabold">−1</button>
              )}
              {[1, 2].map(n => (
                <button key={n} onClick={() => addPoints(side, n, fixing)} disabled={off} aria-label={`Add ${n} for the ${side === 'champions' ? 'Champions' : 'Challengers'}`} className="w-16 h-12 rounded-lg text-white text-xl font-extrabold disabled:opacity-30" style={{ backgroundColor: color }}>+{n}</button>
              ))}
            </div>
          );
          const winnerName = outcome.winner === 'champions' ? 'Champions' : 'Challengers';
          return (
            <div className="flex gap-[clamp(1rem,2vw,2rem)] items-center rounded-xl bg-white/[0.06] py-3">
              <div className="flex-[2] flex gap-[clamp(0.75rem,1.5vw,1.5rem)] items-center min-w-0">
                {teamButtons('champions', '#E85A00')}
                <div className="invisible text-[clamp(1rem,2vw,2rem)] font-black" aria-hidden="true">vs</div>
                {teamButtons('challengers', '#1E3A8A')}
              </div>
              <div className="flex-1 min-w-0 flex flex-wrap items-center justify-center gap-2 px-2">
                {decided && !fixing ? (
                  <>
                    <span className="w-full text-center font-extrabold">{winnerName} win {Math.max(score.champions, score.challengers)}–{Math.min(score.champions, score.challengers)} <span className="text-white/60 font-semibold">· {endedByText(outcome.endedBy)}</span></span>
                    <button
                      onClick={() => { if (!recording && outcome.winner) { setRecording(true); handleGameEnd(outcome.winner, outcome.endedBy ?? 'points'); } }}
                      disabled={recording}
                      className="px-4 h-12 rounded-lg bg-[#F5B301] text-[#0E1A33] font-extrabold disabled:opacity-50"
                    >
                      Record result
                    </button>
                    <button onClick={() => setFixing(true)} className="px-4 h-12 rounded-lg border border-white/40 font-bold hover:bg-white/10">Correct score</button>
                    <button onClick={undo} disabled={!canUndo} title={canUndo ? `Undo: ${undoLabel}` : 'Nothing to undo'} className="px-4 h-12 rounded-lg border border-white/40 font-bold hover:bg-white/10 disabled:opacity-30">
                      Undo{canUndo && undoLabel ? `: ${undoLabel}` : ''}
                    </button>
                  </>
                ) : (
                  <>
                    {cState === 'running'
                      ? <button onClick={pauseClock} className="px-5 h-12 rounded-lg bg-white text-[#0E1A33] font-extrabold">Pause</button>
                      : cState !== 'time' && !decided && <button onClick={startClock} className="px-5 h-12 rounded-lg bg-[#22C55E] text-[#0E1A33] font-extrabold">{cState === 'paused' ? 'Resume' : 'Start'}</button>}
                    <button onClick={undo} disabled={!canUndo} title={canUndo ? `Undo: ${undoLabel}` : 'Nothing to undo'} className="px-4 h-12 rounded-lg border border-white/40 font-bold hover:bg-white/10 disabled:opacity-30">
                      Undo{canUndo && undoLabel ? `: ${undoLabel}` : ''}
                    </button>
                    {fixing && <button onClick={() => setFixing(false)} className="px-4 h-12 rounded-lg bg-white text-[#0E1A33] font-bold">Done fixing</button>}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default CourtView;
