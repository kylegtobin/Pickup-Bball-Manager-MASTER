import React from 'react';
import { useGame } from '../context/GameContext';
import { Player, GameRecord } from '../types';
import { previewNextUp } from '../utils/formChallengers';
import { decide, timeLeft, clockState, formatClock as formatCountdown, endedByText } from '../utils/score';
import { useDialogFocus } from '../utils/useDialogFocus';
import { useWakeLock } from '../utils/useWakeLock';
import { openTvWindow, tvSupported, TV_BLOCKED_MESSAGE } from '../utils/tvLink';
import { soundPref, setSoundPref, unlockSound, playHorn, playWin } from '../utils/sound';
import './court.css';

// Full-screen view for the court (Oct 18 redesign, "the gym's scoreboard"): the clock and score on their own
// scoreboard at the top, and who's playing and who's next below it on a light wall. Optional score buttons
// for the runner, a celebration for each win, a spotlight for a shootout.
// viewer: this is the second-screen window. It shows the same thing but only follows the main screen.

const elapsed = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const spots = (n: number) => `${n} ${n === 1 ? 'spot' : 'spots'}`;
const CONFETTI = ['#FFFFFF', '#F5B301', '#FFD7B8', '#BFD0FF', '#22C55E'];

const Names: React.FC<{ players: Player[] }> = ({ players }) => (
  <ol className="cb-names">
    {players.map(p => <li key={p.id} className="cb-name">{p.name}</li>)}
    {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => <li key={`o${i}`} className="cb-name open">Open spot</li>)}
  </ol>
);

const NextUp: React.FC<{ gameOn: boolean; lineEmpty: boolean; next: ReturnType<typeof previewNextUp> }> = ({ gameOn, lineEmpty, next }) => {
  if (!gameOn) {
    return (
      <section className="cb-next" aria-label="Next up">
        <div className="cb-next-head"><h2>Next up</h2></div>
        <p className="cb-wait">{lineEmpty ? 'Waiting for 10 players. Sign in on the main screen to get a game going.' : 'Waiting for 10 players. Teams fill as players sign in.'}</p>
      </section>
    );
  }
  const shoot = next.shootout?.spots ?? 0;
  return (
    <section className="cb-next" aria-label="Next up">
      <div className="cb-next-head"><h2>Next up</h2><span>Plays the winner</span></div>
      <ol className="cb-names">
        {next.picked.map(p => <li key={p.id} className="cb-name">{p.name}</li>)}
        {next.losersFill === 5 && (
          <li className="cb-shootout" style={{ ['--rows' as string]: 5 }}>
            <b>Same teams run it back</b>
            <p>Nobody's waiting in line.</p>
          </li>
        )}
        {next.shootout && (
          <li className="cb-shootout" style={{ ['--rows' as string]: shoot }}>
            <b>Shootout for {spots(shoot)}</b>
            {next.shootout.players
              ? <div className="cb-chips">{next.shootout.players.map(p => <span key={p.id} className="cb-chip">{p.name}</span>)}</div>
              : <p>This game's losing team shoots.</p>}
          </li>
        )}
        {Array.from({ length: Math.max(0, 5 - next.picked.length - shoot - next.losersFill) }).map((_, i) => <li key={`o${i}`} className="cb-name open">Open spot</li>)}
      </ol>
    </section>
  );
};

const Celebration: React.FC<{ game: GameRecord; streak: number; onDone: () => void }> = ({ game, streak, onDone }) => {
  const pieces = React.useMemo(() => Array.from({ length: 48 }, (_, i) => ({
    left: (i * 37) % 100, delay: ((i * 53) % 20) / 10, duration: 2.6 + ((i * 29) % 15) / 10, color: CONFETTI[i % CONFETTI.length], tilt: (i * 47) % 360,
  })), []);
  const side = game.winner === 'champions' ? 'champ' : 'chall';
  const score = game.final ? `${Math.max(game.final.champions, game.final.challengers)}–${Math.min(game.final.champions, game.final.challengers)}` : null;
  const how = endedByText(game.endedBy);
  return (
    <div className={`cb-moment win ${side}`} onClick={onDone} role="status" aria-live="assertive">
      {pieces.map((c, i) => <span key={i} className="pbm-confetti" style={{ left: `${c.left}%`, backgroundColor: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s`, transform: `rotate(${c.tilt}deg)` }} />)}
      <p className="kicker">Game {game.n}{how ? `, ${how}` : ''}</p>
      <h2 className="pbm-pop">{game.winner === 'champions' ? 'Champions' : 'Challengers'} win</h2>
      {score && <p className="big">{score}</p>}
      <p className="who">{game.winners.map(p => <span key={p.id}>{p.name}</span>)}</p>
      {streak >= 2 && <p className="tag">{streak} straight wins</p>}
    </div>
  );
};

const Spotlight: React.FC<{ spots: number; shooters: Player[]; alreadyIn: number }> = ({ spots: n, shooters, alreadyIn }) => (
  <div className="cb-moment shoot" role="status">
    <p className="kicker">Three-point shootout</p>
    <h2 className="pbm-pop">{spots(n)} up for grabs</h2>
    <div className="cb-chips">{shooters.map(p => <span key={p.id} className="cb-chip">{p.name}</span>)}</div>
    <p className="sub">Make it and you're in the next game{alreadyIn > 0 ? `, with ${alreadyIn} already in` : ''}.</p>
  </div>
);

const CourtView: React.FC<{ onClose: () => void; isSample?: boolean; viewer?: boolean; link?: 'waiting' | 'live' | 'lost' | 'unlinked'; phoneCode?: string | null }> = ({ onClose, isSample, viewer, link, phoneCode }) => {
  const { gameState, addPoints, startClock, pauseClock, handleGameEnd, undo, canUndo, undoLabel } = useGame();
  const [fixing, setFixing] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(rootRef, !viewer);
  useWakeLock(true);
  React.useEffect(() => { setFixing(false); setRecording(false); }, [gameState.games.length]);
  const [tvBlocked, setTvBlocked] = React.useState(false);

  const screen = viewer ? '-tv' : '';
  const [sound, setSound] = React.useState(() => soundPref(screen));
  const toggleSound = () => { unlockSound(); setSound(on => { setSoundPref(!on, screen); return !on; }); };

  // A fresh result gets its moment (only one from the last minute, so opening mid-night doesn't celebrate old games)
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
  React.useEffect(() => {
    if (party && !games.some(g => (party.id ? g.id === party.id : g.n === party.n && g.endedAt === party.endedAt))) setParty(null);
  }, [games, party]);

  const flipKey = `pbm-court-flip${screen}`;
  const [flipped, setFlipped] = React.useState(() => { try { return window.localStorage.getItem(flipKey) === '1'; } catch { return false; } });
  const flip = () => setFlipped(f => { try { window.localStorage.setItem(flipKey, f ? '0' : '1'); } catch { /* blocked */ } return !f; });

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
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);

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
  const goFullScreen = () => { try { document.documentElement.requestFullscreen?.(); } catch { /* not allowed */ } };

  const gameOn = champions.length === 5 && challengers.length === 5;
  const cState = clockState(clock, now);
  const scoring = gameOn && (cState !== 'not-started' || score.champions + score.challengers > 0);
  const outcome = decide(score, clock, now);
  const next = previewNextUp(waitingQueue);
  const lineEmpty = waitingQueue.length === 0;

  const lastClockState = React.useRef(cState);
  React.useEffect(() => {
    if (lastClockState.current === 'running' && cState === 'time' && sound) playHorn();
    lastClockState.current = cState;
  }, [cState, sound]);

  const shootout = gameState.status === 'SHOOTOUT' && gameState.shootoutTeam ? gameState.shootoutTeam : null;
  const recordRef = React.useRef<HTMLButtonElement>(null);
  const decidedNow = !!outcome.winner && !fixing && controls;
  React.useEffect(() => {
    if (!decidedNow || viewer) return;
    const id = setTimeout(() => recordRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, [decidedNow, viewer]);

  // The middle of the scoreboard: countdown when the score is being kept, otherwise the game clock
  let clockText = '--:--';
  let status: { text: string; kind: '' | 'alert' | 'win' } = { text: gameOn ? 'Game clock' : 'Waiting for 10 players', kind: '' };
  if (scoring) {
    clockText = formatCountdown(timeLeft(clock, now));
    status = outcome.nextBucket ? { text: 'Next bucket wins', kind: 'alert' }
      : outcome.winner ? { text: `${outcome.winner === 'champions' ? 'Champions' : 'Challengers'} win`, kind: 'win' }
      : cState === 'time' ? { text: 'Time', kind: 'alert' }
      : cState === 'paused' ? { text: 'Paused', kind: '' }
      : { text: 'Time left', kind: '' };
  } else if (gameStartTime && gameOn) {
    clockText = elapsed(now - gameStartTime);
  }

  const side = (which: 'champ' | 'chall') => {
    const isChamp = which === 'champ';
    return (
      <div className="cb-side">
        <div className="cb-plate-wrap">
          <span className={`cb-plate ${which}`}>{isChamp ? 'Champions' : 'Challengers'}</span>
          <span className={`cb-streak ${championStreak >= 3 ? 'heater' : ''}`}>
            {isChamp && championStreak >= 2 ? (championStreak >= 3 ? `On a heater, ${championStreak} straight` : `${championStreak} straight wins`) : ''}
          </span>
        </div>
        <span className={`cb-digits ${scoring ? '' : 'off'}`} aria-label={`${isChamp ? 'Champions' : 'Challengers'} score`}>
          {scoring ? (isChamp ? score.champions : score.challengers) : '0'}
        </span>
      </div>
    );
  };

  return (
    <div ref={rootRef} tabIndex={-1} className="cb" role={viewer ? 'main' : 'dialog'} aria-modal={viewer ? undefined : true} aria-label="Court view">
      {viewer && link !== 'live' && (
        <div className={`cb-notice ${link === 'lost' || link === 'unlinked' ? 'bad' : ''}`} role={link === 'lost' ? 'alert' : 'status'}>
          {link === 'lost' ? 'Lost the main screen. Keep the app open there, or press Second screen on it again.'
            : link === 'unlinked' ? 'Open this from the Second screen button on the main screen.'
            : 'Connecting to the main screen…'}
        </div>
      )}
      {tvBlocked && (
        <div role="alert" className="cb-notice bad">{TV_BLOCKED_MESSAGE} <button className="cb-btn" onClick={() => setTvBlocked(false)}>OK</button></div>
      )}
      {isSample && <span className="cb-sample">Sample</span>}
      {phoneCode && !isSample && (
        <div className="cb-phone" aria-label={`Follow on your phone at ${window.location.host} with code ${phoneCode}`}>
          <span>On your phone</span>
          <b>{phoneCode}</b>
          <small>{window.location.host}</small>
        </div>
      )}
      {party && <Celebration game={party} streak={gameState.championStreak} onDone={() => setParty(null)} />}
      {!party && shootout && <Spotlight spots={gameState.requiredPlayers} shooters={shootout.players} alreadyIn={challengers.length} />}

      <h1 className="sr-only">Now playing</h1>
      <header className="cb-board" aria-label="Game clock and score">
        {side(flipped ? 'chall' : 'champ')}
        <div className="cb-center">
          <span className={`cb-clock ${scoring && cState === 'time' ? 'time' : ''}`}>{clockText}</span>
          <span className={`cb-status ${status.kind}`}>{status.text}</span>
        </div>
        {side(flipped ? 'champ' : 'chall')}
      </header>

      {controls && gameOn && !viewer && (() => {
        const decided = !!outcome.winner;
        const off = decided && !fixing;
        const buttons = (s: 'champions' | 'challengers', color: string) => (
          <div className="grp">
            {fixing && <button className="cb-scorebtn light" onClick={() => addPoints(s, -1, true)} aria-label={`Take 1 away from the ${s === 'champions' ? 'Champions' : 'Challengers'}`}>−1</button>}
            {[1, 2].map(n => <button key={n} className="cb-scorebtn" style={{ background: color }} disabled={off} onClick={() => addPoints(s, n, fixing)} aria-label={`Add ${n} for the ${s === 'champions' ? 'Champions' : 'Challengers'}`}>+{n}</button>)}
          </div>
        );
        return (
          <div className="cb-scorebar">
            {buttons(flipped ? 'challengers' : 'champions', flipped ? '#1E3A8A' : '#E85A00')}
            {decided && !fixing ? (
              <>
                <span className="note">{outcome.winner === 'champions' ? 'Champions' : 'Challengers'} win {Math.max(score.champions, score.challengers)}–{Math.min(score.champions, score.challengers)}</span>
                <button ref={recordRef} className="cb-scorebtn record" disabled={recording} onClick={() => { if (!recording && outcome.winner) { setRecording(true); handleGameEnd(outcome.winner, outcome.endedBy ?? 'points'); } }}>Record result</button>
                <button className="cb-scorebtn light" onClick={() => setFixing(true)}>Correct score</button>
              </>
            ) : (
              <>
                {cState === 'running'
                  ? <button className="cb-scorebtn light" onClick={pauseClock}>Pause</button>
                  : cState !== 'time' && !decided && <button className="cb-scorebtn go" onClick={startClock}>{cState === 'paused' ? 'Resume' : 'Start'}</button>}
                {fixing && <button className="cb-scorebtn light" onClick={() => setFixing(false)}>Done fixing</button>}
              </>
            )}
            <button className="cb-scorebtn light" onClick={undo} disabled={!canUndo} title={canUndo ? `Undo: ${undoLabel}` : 'Nothing to undo'}>Undo{canUndo && undoLabel ? `: ${undoLabel}` : ''}</button>
            {buttons(flipped ? 'champions' : 'challengers', flipped ? '#E85A00' : '#1E3A8A')}
          </div>
        );
      })()}

      <div className={`cb-floor ${flipped ? 'flipped' : ''}`}>
        <section className="cb-team champ" aria-label="Champions">
          <h2 className="cb-team-head">Champions</h2>
          <Names players={champions} />
        </section>
        <section className="cb-team chall" aria-label="Challengers">
          <h2 className="cb-team-head">Challengers</h2>
          <Names players={challengers} />
        </section>
        <NextUp gameOn={gameOn} lineEmpty={lineEmpty} next={next} />
      </div>

      <div className={`cb-controls ${viewer && !chrome ? 'hidden' : ''}`}>
        {!viewer && tvSupported() && <button className="cb-btn" onClick={() => setTvBlocked(!openTvWindow())}>Second screen</button>}
        <button className="cb-btn" onClick={flip} aria-pressed={flipped}>Swap sides</button>
        <button className="cb-btn" onClick={toggleSound} aria-pressed={sound}>{sound ? 'Sound on' : 'Sound off'}</button>
        {gameOn && !viewer && <button className="cb-btn" onClick={() => setControls(c => !c)} aria-pressed={controls}>{controls ? 'Hide score' : 'Score'}</button>}
        <button className="cb-btn" onClick={goFullScreen}>Full screen</button>
        {!viewer && <button className="cb-btn exit" onClick={close}>Exit</button>}
      </div>
    </div>
  );
};

export default CourtView;
