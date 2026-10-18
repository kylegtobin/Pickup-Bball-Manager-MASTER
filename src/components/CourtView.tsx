import React from 'react';
import { useGame } from '../context/GameContext';
import { Player, GameRecord } from '../types';
import { previewNextUp } from '../utils/formChallengers';
import { decide, timeLeft, clockState, formatClock as formatCountdown, endedByText } from '../utils/score';
import { useDialogFocus } from '../utils/useDialogFocus';
import { useWakeLock } from '../utils/useWakeLock';
import { openTvWindow, tvSupported } from '../utils/tvLink';
import { soundPref, setSoundPref, unlockSound, playHorn, playWin } from '../utils/sound';

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
      <span className={`whitespace-nowrap rounded-full bg-[#E85A00] text-white px-3 py-0.5 text-[clamp(0.85rem,1.2vw,1.15rem)] font-bold ${streak >= 3 ? 'pbm-heater' : ''}`}>{streak >= 3 ? `On a heater · ${streak} straight` : `${streak} straight wins`}</span>
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

const CONFETTI_COLORS = ['#FF7A1A', '#F5B301', '#7FA7FF', '#FFFFFF', '#22C55E'];

// A few seconds of fanfare after a result: who won, the score, and a streak if there is one
const Celebration: React.FC<{ game: GameRecord; streak: number; onDone: () => void }> = ({ game, streak, onDone }) => {
  const pieces = React.useMemo(() => Array.from({ length: 48 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 53) % 20) / 10,
    duration: 2.6 + ((i * 29) % 15) / 10,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    tilt: (i * 47) % 360,
  })), []);
  const champs = game.winner === 'champions';
  const accent = champs ? '#FF7A1A' : '#7FA7FF';
  const score = game.final ? `${Math.max(game.final.champions, game.final.challengers)}–${Math.min(game.final.champions, game.final.challengers)}` : null;
  const how = endedByText(game.endedBy);
  return (
    <div className="absolute inset-0 z-20 overflow-hidden flex items-center justify-center bg-[#0E1A33] cursor-pointer" onClick={onDone} role="status" aria-live="assertive">
      {pieces.map((c, i) => (
        <span key={i} className="pbm-confetti" style={{ left: `${c.left}%`, backgroundColor: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s`, transform: `rotate(${c.tilt}deg)` }} />
      ))}
      <div className="pbm-pop relative text-center px-6">
        <p className="uppercase tracking-[0.3em] font-bold text-[clamp(1rem,1.8vw,1.75rem)] text-white/70">Game {game.n}{how ? ` · ${how}` : ''}</p>
        <h2 className="mt-2 font-black leading-none text-[clamp(3.5rem,10vw,10rem)]" style={{ color: accent }}>{champs ? 'Champions' : 'Challengers'} win</h2>
        {score && <p className="mt-3 font-black tabular-nums text-white text-[clamp(3rem,7vw,7rem)] leading-none">{score}</p>}
        <p className="mt-6 font-bold text-white/90 text-[clamp(1.25rem,2.4vw,2.5rem)]">{game.winners.map(p => p.name).join(' · ')}</p>
        {streak >= 2 && (
          <p className="mt-6 inline-block rounded-full bg-[#E85A00] text-white px-6 py-2 font-extrabold text-[clamp(1.25rem,2.4vw,2.5rem)]">{streak} straight wins</p>
        )}
      </div>
    </div>
  );
};

// While the runner picks shootout winners, the TV makes it an event
const ShootoutSpotlight: React.FC<{ spots: number; shooters: Player[]; alreadyIn: number }> = ({ spots, shooters, alreadyIn }) => (
  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center gap-[clamp(1rem,3vh,2.5rem)] px-8 bg-[#0E1A33] bg-[radial-gradient(ellipse_at_center,_rgba(245,179,1,0.16),_transparent_65%)]">
    <p className="uppercase tracking-[0.35em] font-bold text-[#F5B301] text-[clamp(1rem,1.8vw,1.75rem)]">3-point shootout</p>
    <h2 className="pbm-pop font-black leading-none text-white text-[clamp(3rem,8vw,8rem)]">{spots} {spots === 1 ? 'spot' : 'spots'} up for grabs</h2>
    <div className="flex flex-wrap justify-center gap-[clamp(0.5rem,1vw,1rem)] max-w-6xl">
      {shooters.map(p => <ShooterChip key={p.id} name={p.name} />)}
    </div>
    <p className="text-white/70 font-semibold text-[clamp(1.1rem,2vw,2rem)]">
      Make it and you're in the next game{alreadyIn > 0 ? ` with ${alreadyIn} already in` : ''}.
    </p>
  </div>
);

// Full-screen view for the court: who's playing, the game clock, and who's next (including a likely shootout).
// viewer: this is the second-screen window. It shows the same thing but only follows the main screen.
const CourtView: React.FC<{ onClose: () => void; isSample?: boolean; viewer?: boolean; link?: 'waiting' | 'live' | 'lost' }> = ({ onClose, isSample, viewer, link }) => {
  const { gameState, addPoints, startClock, pauseClock, handleGameEnd, undo, canUndo, undoLabel } = useGame();
  const [fixing, setFixing] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(rootRef, !viewer);
  useWakeLock(true); // a TV or tablet showing court view shouldn't go to sleep
  React.useEffect(() => { setFixing(false); setRecording(false); }, [gameState.games.length]);

  // Sound is off unless turned on for this screen
  const [sound, setSound] = React.useState(soundPref);
  const toggleSound = () => { unlockSound(); setSound(on => { setSoundPref(!on); return !on; }); };

  // A fresh result gets its moment. Only a result from the last minute counts, so opening
  // the second screen mid-night doesn't celebrate old games.
  const games = gameState.games;
  const seenGames = React.useRef(games.length);
  const [party, setParty] = React.useState<GameRecord | null>(null);
  React.useEffect(() => {
    const last = games[games.length - 1];
    if (games.length === seenGames.current + 1 && last && Date.now() - last.endedAt < 60000) {
      setParty(last);
      if (sound) playWin();
    }
    seenGames.current = games.length;
  }, [games, sound]);
  React.useEffect(() => {
    if (!party) return;
    const id = setTimeout(() => setParty(null), 6500);
    return () => clearTimeout(id);
  }, [party]);

  // On the second screen the buttons fade away until the mouse moves
  const [chrome, setChrome] = React.useState(true);
  React.useEffect(() => {
    if (!viewer) return;
    let id: ReturnType<typeof setTimeout> = setTimeout(() => setChrome(false), 4000);
    const wake = () => { setChrome(true); clearTimeout(id); id = setTimeout(() => setChrome(false), 4000); };
    window.addEventListener('mousemove', wake);
    window.addEventListener('touchstart', wake);
    return () => { clearTimeout(id); window.removeEventListener('mousemove', wake); window.removeEventListener('touchstart', wake); };
  }, [viewer]);
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
    if (viewer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, viewer]);

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

  // Horn when time runs out
  const lastClockState = React.useRef(cState);
  React.useEffect(() => {
    if (lastClockState.current === 'running' && cState === 'time' && sound) playHorn();
    lastClockState.current = cState;
  }, [cState, sound]);

  const shootout = gameState.status === 'SHOOTOUT' && gameState.shootoutTeam ? gameState.shootoutTeam : null;

  return (
    <div ref={rootRef} tabIndex={-1} className="fixed inset-0 z-[65] bg-[#0E1A33] text-white overflow-auto outline-none" role={viewer ? 'main' : 'dialog'} aria-modal={viewer ? undefined : true} aria-label="Court view">
      {party && <Celebration game={party} streak={gameState.championStreak} onDone={() => setParty(null)} />}
      {!party && shootout && <ShootoutSpotlight spots={gameState.requiredPlayers} shooters={shootout.players} alreadyIn={challengers.length} />}
      <div className="h-full min-h-[32rem] flex flex-col gap-[clamp(1rem,2.5vh,2rem)] px-[clamp(1rem,3vw,3rem)] py-[clamp(1rem,3vh,2.5rem)]">
        {/* Top row */}
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-4 flex-1 min-w-0">
            <h1 className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold text-white/90">Now playing</h1>
            {isSample && <span className="rounded-full bg-[#F5B301] text-[#14213D] px-3 py-1 text-sm font-bold">Sample with made-up players</span>}
            {viewer && link === 'waiting' && <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">Connecting to the main screen…</span>}
            {viewer && link === 'lost' && <span role="alert" className="rounded-full bg-red-500 px-3 py-1 text-sm font-bold">Lost the main screen. Keep the app open there.</span>}
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
          <div className={`flex gap-2 ml-4 transition-opacity duration-500 ${viewer && !chrome ? 'opacity-0 pointer-events-none' : ''}`}>
            {!viewer && tvSupported() && (
              <button onClick={() => openTvWindow()} className="rounded-lg border border-white/30 px-4 py-2 font-semibold hover:bg-white/10" title="Open court view in its own window for a TV. It follows this screen.">
                Second screen
              </button>
            )}
            <button onClick={toggleSound} aria-pressed={sound} className="rounded-lg border border-white/30 px-4 py-2 font-semibold hover:bg-white/10" title="Horn at 0:00 and a chime for each win, on this screen only">
              {sound ? 'Sound on' : 'Sound off'}
            </button>
            {gameOn && !viewer && (
              <button onClick={() => setControls(c => !c)} className="rounded-lg border border-white/30 px-4 py-2 font-semibold hover:bg-white/10" aria-pressed={controls}>
                {controls ? 'Hide score buttons' : 'Score'}
              </button>
            )}
            <button onClick={goFullScreen} className="rounded-lg border border-white/30 px-4 py-2 font-semibold hover:bg-white/10">Full screen</button>
            {!viewer && <button onClick={close} className="rounded-lg bg-white text-[#0E1A33] px-4 py-2 font-bold hover:bg-white/90">Exit</button>}
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
        {controls && gameOn && !viewer && (() => {
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
