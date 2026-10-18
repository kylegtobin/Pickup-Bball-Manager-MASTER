import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import TeamBox from './components/team/TeamBox';
import WaitingQueue from './components/queue/WaitingQueue';
import ShootoutModal from './components/modal/ShootoutModal';
import InfoModal from './components/modal/InfoModal';
import ErrorModal from './components/modal/ErrorModal';
import Switch from './components/ui/Switch';
import { ToastProvider } from './components/ui/Toast';
import PBM1Logo from './assets/images/PBM 1.jpg';
import ContentModal from './components/modal/ContentModal';
import Champ1 from './assets/images/Champ 1.jpg';
import Champ2 from './assets/images/Champ 2.jpg';
import { createSample, isSampleLink } from './sample/sampleGame';
import ScreenSizeNote from './components/ui/ScreenSizeNote';
import ResumePrompt from './components/modal/ResumePrompt';
import ArrangeBar from './components/ArrangeBar';
import Scoreboard from './components/Scoreboard';
import CourtView from './components/CourtView';
import RecapModal from './components/modal/RecapModal';
import SignInSheet from './components/modal/SignInSheet';
import { describeSpot } from './utils/spot';
import { useToast } from './components/ui/Toast';
import SittingOut from './components/queue/SittingOut';
import TvWindow from './components/TvWindow';
import { isTvLink, openTvWindow, tvSupported, useTvBroadcast, TV_BLOCKED_MESSAGE } from './utils/tvLink';
import { blockingDialogOpen, typing } from './utils/visibility';
import { runViewToken } from './cloud/config';
import { useCloud } from './cloud/useCloud';
import { syncText } from './cloud/status';

import './App.css';

// Only loaded when someone opens it, so the QR code library stays out of the everyday app
const PhonePanel = React.lazy(() => import('./components/cloud/PhonePanel'));
// The phone page is its own small download too
const RunView = React.lazy(() => import('./components/RunView'));

// Where the real session is saved on this device. The sample never saves.
const REAL_SESSION_KEY = 'pbm-session-v1';

// Wrapper component to provide context.
// The real session's provider is always mounted. Sample mode gets its own provider
// (same rules code, separate in-memory state) and the real one is only hidden,
// so opening, resetting or exiting a sample can never change a real session.
function App() {
  // A phone following a run through its link: read-only, nothing from this device is involved
  const runToken = runViewToken();
  if (runToken) {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-[#0E1A33]" />}>
        <RunView token={runToken} />
      </React.Suspense>
    );
  }
  // The second-screen window only shows court view and follows the main screen
  if (isTvLink()) return <TvWindow />;
  return <MainApp />;
}

function MainApp() {
  const [sampleOpen, setSampleOpen] = React.useState<boolean>(isSampleLink);
  const [sampleRun, setSampleRun] = React.useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sampleSetup = React.useMemo(() => createSample(), [sampleRun, sampleOpen]);

  const exitSample = () => {
    setSampleOpen(false);
    if (isSampleLink()) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
  };

  return (
    <>
      <ScreenSizeNote />
      <div hidden={sampleOpen}>
        <ToastProvider>
          <GameProvider persistKey={REAL_SESSION_KEY}>
            <PickupBasketballApp onTrySample={() => setSampleOpen(true)} active={!sampleOpen} />
          </GameProvider>
        </ToastProvider>
      </div>
      {sampleOpen && (
        <ToastProvider key={sampleRun}>
          <GameProvider initialState={sampleSetup.state} initialRegulars={sampleSetup.regulars}>
            <PickupBasketballApp
              sample={{ onReset: () => setSampleRun(run => run + 1), onExit: exitSample }}
              active
            />
          </GameProvider>
        </ToastProvider>
      )}
    </>
  );
}

function SampleBanner({ onReset, onExit }: { onReset: () => void; onExit: () => void }) {
  return (
    <div className="sticky top-0 z-[60] bg-amber-300 border-b-4 border-amber-500 shadow">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-gray-900 text-base sm:text-lg">
          <strong>This is a sample.</strong> Made-up players. Nothing here touches a real game.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onReset}
            className="bg-white hover:bg-gray-100 text-gray-900 border-2 border-gray-900 px-4 py-2 rounded font-bold"
          >
            Reset
          </button>
          <button
            onClick={onExit}
            className="bg-gray-900 hover:bg-black text-white px-4 py-2 rounded font-bold"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}

interface PickupBasketballAppProps {
  sample?: { onReset: () => void; onExit: () => void };
  onTrySample?: () => void;
  active: boolean; // false for the real night while it's hidden behind an open sample
}

// Inner component with access to context
function PickupBasketballApp({ sample, onTrySample, active }: PickupBasketballAppProps) {
  const { 
    gameState, 
    addPlayer, 
    removePlayer, 
    handleGameEnd, 
    toggleManualMode,
    infoModalState,
    dismissInfoModal,
    errorMessage,
    setErrorMessage,
    undo,
    canUndo,
    undoLabel,
    saveStatus,
    otherTabOpen,
    regulars,
    lastAdded
  } = useGame();
  const { toast } = useToast();
  useTvBroadcast(gameState, !!sample, active);
  // Phone view (off unless switched on for this browser). The sample never shares.
  const cloud = useCloud(gameState, !sample);
  const [phoneOpen, setPhoneOpen] = React.useState(false);
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!cloud.on) return;
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, [cloud.on]);
  const cloudStatus = sample ? null : syncText(cloud);

  const handleUndo = () => {
    if (!canUndo) return;
    const label = undoLabel;
    undo();
    toast(`Undone: ${label}`, 'info');
  };

  // Ctrl+Z / Cmd+Z undoes, unless someone is typing or a dialog other than court view is open
  const undoRef = React.useRef(handleUndo);
  undoRef.current = handleUndo;
  const activeRef = React.useRef(active);
  activeRef.current = active;
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeRef.current) return; // a hidden real night never reacts to keys meant for the sample
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      if (typing() || blockingDialogOpen()) return;
      e.preventDefault();
      undoRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  
  const { champions, challengers } = gameState;
  const isEmpty = champions.length === 0 && challengers.length === 0 && gameState.waitingQueue.length === 0;
  const [newPlayerName, setNewPlayerName] = React.useState('');
  const [removePlayerName, setRemovePlayerName] = React.useState('');
  const [showError, setShowError] = React.useState(false);
  const [courtViewOpen, setCourtViewOpen] = React.useState(false);
  const [recapOpen, setRecapOpen] = React.useState(false);
  const [signInOpen, setSignInOpen] = React.useState(false);
  const [inputFocused, setInputFocused] = React.useState(false);

  // Someone just signed in: mark their spot, and say where they are when it wasn't the sign-in sheet
  const signInOpenRef = React.useRef(signInOpen);
  signInOpenRef.current = signInOpen;
  React.useEffect(() => {
    if (!lastAdded) return;
    if (!signInOpenRef.current) {
      const spot = describeSpot(gameState, lastAdded.id);
      toast(spot ? `${lastAdded.name} is in. ${spot}.` : `${lastAdded.name} is in.`, 'success');
    }
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-player-id="${lastAdded.id}"]`) as HTMLElement | null;
      if (!el) return;
      document.querySelectorAll('.pbm-just-added').forEach(x => x.classList.remove('pbm-just-added'));
      void el.offsetWidth; // restart the animation
      el.classList.add('pbm-just-added');
      const r = el.getBoundingClientRect();
      if (!signInOpenRef.current && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setTimeout(() => el.classList.remove('pbm-just-added'), 3600);
    }, 60);
    return () => clearTimeout(t);
    // Only when a new sign-in lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAdded]);

  // Saved names that match what's typed, for one-tap sign-in from the box
  const signedIn = new Set(
    [...champions, ...challengers, ...gameState.waitingQueue.flatMap(i => ('players' in i ? i.players : [i]))].filter(p => !p.away).map(p => p.name.toLowerCase())
  );
  const typed = newPlayerName.trim().toLowerCase();
  const suggestions = typed
    ? regulars.filter(r => !signedIn.has(r.name.toLowerCase()) && r.name.toLowerCase().includes(typed) && r.name.toLowerCase() !== typed).slice(0, 5)
    : [];
  
  // Modal state
  const [activeModal, setActiveModal] = React.useState<{
    isOpen: boolean;
    title: string;
    content: React.ReactNode;
  }>({
    isOpen: false,
    title: '',
    content: null
  });

  const openModal = (title: string, content: React.ReactNode) => {
    setActiveModal({
      isOpen: true,
      title,
      content
    });
  };

  const closeModal = () => {
    setActiveModal({
      ...activeModal,
      isOpen: false
    });
  };

  const handleAddPlayer = () => {
    if (!newPlayerName.trim()) return;

    try {
      addPlayer(newPlayerName.trim());
      setNewPlayerName('');
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(`"${newPlayerName}" already exists. Please use a different name or add a last initial.`);
        setShowError(true);
      }
    }
  };

  const handleRemovePlayer = () => {
    if (!removePlayerName.trim()) return;

    try {
      removePlayer(removePlayerName.trim());
      setRemovePlayerName('');
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
        setShowError(true);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAddPlayer();
  };

  const handleRemoveKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRemovePlayer();
  };

  // Show error modal whenever the error message changes from null to a value
  React.useEffect(() => {
    if (errorMessage) {
      setShowError(true);
    }
  }, [errorMessage]);

  // Track shootout status for modal
  return (
    <div className="min-h-screen bg-[#EDEFF2] text-[#1B2430]">
      {sample && <SampleBanner onReset={sample.onReset} onExit={sample.onExit} />}
      {!sample && otherTabOpen && (
        <div role="alert" className="bg-amber-100 border-b-2 border-amber-400 text-gray-900">
          <p className="max-w-6xl mx-auto px-4 py-2.5 text-base">
            <strong>This app is open in another tab.</strong> Use just one, so the two don't save over each other.
          </p>
        </div>
      )}
      <div className="px-6 py-4">
      <div className="container mx-auto px-4 py-2 max-w-6xl">
        {/* Header: logo left, menu right, one row */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <img
            src={PBM1Logo}
            alt="Pickup Basketball Manager"
            className="h-8 xl:h-11 w-auto object-contain"
            style={{ mixBlendMode: 'multiply' }}
          />
          <nav>
            <ul className="flex items-center">
              <li>
                <button
                  type="button"
                  className="text-gray-600 hover:text-[#1E3A8A] transition-colors duration-200 font-medium text-sm whitespace-nowrap px-2 bg-transparent"
                  onClick={() => {
                    openModal("Video Tutorial", (
                      <div className="flex flex-col items-center">
                        <div className="w-full max-w-3xl aspect-video">
                          <video
                            src={`${process.env.PUBLIC_URL}/tutorial.mp4`}
                            poster={`${process.env.PUBLIC_URL}/tutorial-poster.jpg`}
                            title="How Pickup Basketball Manager works"
                            className="w-full h-full bg-black rounded-md"
                            controls
                            playsInline
                            preload="none"
                          />
                        </div>
                      </div>
                    ));
                  }}
                >
                  Video Tutorial
                </button>
              </li>
              <li className="h-5 border-l border-gray-400 mx-1"></li>
              <li>
                <button
                  type="button"
                  className="text-gray-600 hover:text-[#1E3A8A] transition-colors duration-200 font-medium text-sm whitespace-nowrap px-2 bg-transparent"
                  onClick={() => {
                    openModal("Game Format & Rules", (
                      <div className="text-lg">
                        <h3 className="text-xl font-bold mb-4">Starting a Game</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li>Games begin when <strong>10 players</strong> check in</li>
                          <li>Played <strong>5-on-5, full court</strong></li>
                          <li><strong>Winners stay</strong> on as <strong>Champions</strong></li>
                          <li><strong>Losing team</strong> goes to the waiting queue — <em>unless</em> there aren't enough players to form a new team</li>
                        </ul>
                        
                        <hr className="my-6 border-t border-gray-300" />
                        
                        <h3 className="text-xl font-bold mb-4">Scoring</h3>
                        <ul className="list-disc pl-6 mb-3">
                          <li>✅ First to <strong>11 points</strong>, must <strong>win by 2</strong></li>
                          <li>🎯 If no lead by 2 when a team hits <strong>15</strong>, the <strong>first to 15</strong> wins</li>
                          <li>⏱️ Games are <strong>12 minutes</strong>. When time runs out, the <strong>team ahead wins</strong>. If it's tied, <strong>next bucket wins</strong>.</li>
                          <li><strong>Scoring is 1s and 2s:</strong></li>
                          <ul className="list-disc pl-12">
                            <li>Buckets inside the arc count <strong>1</strong></li>
                            <li>Threes count <strong>2</strong></li>
                          </ul>
                          <li>🚫 <strong>No free throws</strong> — if fouled on a shot, your team keeps the ball</li>
                          <li>🫱 Players <strong>call their own fouls</strong> — <strong>play fair and be respectful</strong></li>
                        </ul>
                        
                        <hr className="my-6 border-t border-gray-300" />
                        
                        <h3 className="text-xl font-bold mb-4">Three-Point Shootout</h3>
                        
                        <p className="font-bold mb-2">When It Happens</p>
                        <ul className="list-disc pl-6 mb-4">
                          <li>A shootout takes place when the <strong>next group in line</strong> (a previous losing team) has <strong>more players than there are open spots</strong> on the Challengers</li>
                          <li>Everyone in that group competes for the <strong>1 to 4 open spots</strong>. Nobody behind the group skips ahead.</li>
                        </ul>
                        
                        <p className="font-bold mb-2">How It Works</p>
                        <ul className="list-disc pl-6 mb-3">
                          <li>All eligible players take <strong>one three-point shot</strong></li>
                          <li>✅ If the <strong>exact number</strong> of players make it to match the open spots — they're in</li>
                          <li>🔁 If <strong>fewer players make it</strong> than spots available:</li>
                          <ul className="list-disc pl-6 ml-6">
                            <li>Players who missed keep shooting until all spots are filled</li>
                          </ul>
                          <li>🔄 If <strong>more players make it</strong> than spots available:</li>
                          <ul className="list-disc pl-6 ml-6">
                            <li>Only those who made it in the <strong>previous round</strong> continue shooting until the correct number remains</li>
                          </ul>
                        </ul>
                        
                        <p className="text-center font-bold text-xl mt-8 mb-4">Let's hoop — play fair, have fun, and keep it moving! 💪🏀</p>
                      </div>
                    ));
                  }}
                >
                  Game Format & Rules
                </button>
              </li>
              <li className="h-5 border-l border-gray-400 mx-1"></li>
              <li>
                <button
                  type="button"
                  className="text-gray-600 hover:text-[#1E3A8A] transition-colors duration-200 font-medium text-sm whitespace-nowrap px-2 bg-transparent"
                  onClick={() => {
                    openModal("Site User Guide", (
                      <div className="text-lg">
                        <h3 className="text-xl font-bold mb-4">📋 Quick Start</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li>Tap <strong>Sign in</strong> and tap your name. New here? Type your name and add yourself; next time it's saved on this device and you can just tap it. The runner can also type a name and click <strong>Add Player</strong>.</li>
                          <li>The first 10 players fill the <strong>Champions</strong> & <strong>Challengers</strong> teams; everyone after that joins the <strong>Waiting Queue</strong>. After signing in, the app says where you are, like "2 games away".</li>
                          <li>Game results can be recorded once both <strong>Champions</strong> and <strong>Challengers</strong> teams have 5 players each.</li>
                          <li>After a game, click the <strong>Champions Won</strong> or <strong>Challengers Won</strong> buttons at the top of the page.</li>
                          <li>Winners stay, losers queue up, and the next 5 Challengers are filled automatically, with a three-point shootout pop-up appearing when required.</li>
                          <li>Tapped the wrong button? Click <strong>Undo</strong> to step back one change at a time. It still works after a refresh.</li>
                        </ul>

                        <hr className="my-6 border-t border-gray-300" />

                        <h3 className="text-xl font-bold mb-4">🏀 Keeping Score</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li>When both teams have 5, the scoreboard shows above the teams. Tap <strong>Start</strong> at tip-off; tap again to pause.</li>
                          <li>Tap <strong>+1</strong> for a bucket and <strong>+2</strong> for a three. Undo takes back the last basket.</li>
                          <li>The app knows the rules: first to 11 win by 2, first to 15, and at 12:00 the team ahead wins (tied means next bucket wins). When a team wins it asks you to <strong>Record result</strong>, which rotates the line.</li>
                          <li>Mis-tap? Use <strong>Fix score</strong> or <strong>Correct score</strong>. Forgot to start the clock? Pause it and use <strong>Adjust time</strong>.</li>
                          <li>On a laptop, keys work too: <strong>Q</strong>/<strong>W</strong> add 1/2 for the Champions, <strong>O</strong>/<strong>P</strong> for the Challengers, <strong>Space</strong> starts or pauses the clock, and <strong>Ctrl+Z</strong> (Cmd+Z on a Mac) undoes.</li>
                          <li>The screen stays awake while the clock runs and while court view is open.</li>
                          <li>Not keeping score tonight? Ignore it and use the Champions Won / Challengers Won buttons like always.</li>
                        </ul>

                        <hr className="my-6 border-t border-gray-300" />

                        <h3 className="text-xl font-bold mb-4">📺 Court View & Recap</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li><strong>Court View</strong> puts the clock and score on a big scoreboard up top, with who's playing and who's up next below, including any upcoming shootout. Use <strong>Full screen</strong> on a TV or tablet.</li>
                          <li><strong>Second screen</strong> opens court view in its own window. Drag it onto the TV or projector and click Full screen. It follows the main screen, so the runner keeps working as normal.</li>
                          <li>Court view celebrates each win (with the score and any streak) and turns a shootout into a big spotlight. <strong>Sound</strong> is off unless you turn it on for that screen: a horn at 0:00 and a chime for a win.</li>
                          <li><strong>Recap</strong> (top menu) shows games played, players tonight, the longest win streak, and who had the most wins and games. Download a recap image for the group chat or a backup of the night.</li>
                          <li>At the end of the night, click <strong>Finish night</strong> in Recap. Tonight is saved under <strong>Past nights</strong> on this device and the courts clear for next time.</li>
                          <li>Recap lists every game (who won, the score, who played, any shootout). <strong>Restore a backup</strong> adds a backed-up night to Past nights, or picks it back up when nothing is in progress.</li>
                        </ul>

                        <hr className="my-6 border-t border-gray-300" />

                        <h3 className="text-xl font-bold mb-4">⏱️ Waiting Queue & Wait Times</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li>Players can see <strong>Estimated Wait Time</strong> (minutes) on the left side of the waiting queue and <strong>Number of games behind</strong> on the right side.</li>
                          <li>Previous teams that have lost a game stay grouped together in the <strong>waiting queue</strong>.</li>
                        </ul>

                        <hr className="my-6 border-t border-gray-300" />

                        <h3 className="text-xl font-bold mb-4">🛠️ Player & Game Management</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li><strong>Remove Player Options:</strong>
                            <ul className="list-disc pl-6 mt-1">
                              <li>Right-click a player card and select "Remove [Player Name]".</li>
                              <li>Enter the player's name in the <strong>Name to remove</strong> box and click <strong>Remove Player</strong>.</li>
                              <li>In Manual Mode, tap the player, then tap <strong>Remove</strong> in the dark bar.</li>
                            </ul>
                          </li>
                          <li><strong>Manual Mode:</strong>
                            <ul className="list-disc pl-6 mt-1">
                              <li>Toggle the switch <strong>ON</strong> to arrange players.</li>
                              <li>Activates automatically if a player is removed from Champions or Challengers.</li>
                              <li>Drag a player, or tap a player and then tap where they go: an <strong>Open spot</strong> on a team or a <strong>Move here</strong> spot in the line.</li>
                              <li>Tap a previous team's name to move the whole group.</li>
                              <li><strong>Swap:</strong> tap a player, then tap a player on court (or, for someone on court, a player in line). The two trade places, which is how you sub someone in.</li>
                              <li><strong>Sit out:</strong> tap a player, then <strong>Sit out</strong>. Someone waiting in line stays in their place, greyed out; if their turn comes while they're out, they're skipped and move to the end of the line. Someone on court opens their spot; <strong>Back</strong> returns them to it during the same game if nobody has taken it, otherwise to the end of the line. Signing in again works like Back. <strong>Left</strong> means they went home.</li>
                              <li>Perfect for special situations: injured players, someone needing to move back in the queue for a phone call, or friends wanting to play together.</li>
                              <li>Tap <strong>Done</strong> when finished arranging.</li>
                            </ul>
                          </li>
                        </ul>

                        <hr className="my-6 border-t border-gray-300" />

                        <h3 className="text-xl font-bold mb-4">💾 Saved Automatically</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li>The night is saved on this device as you go. After a refresh or a closed tab, choose <strong>Resume session</strong> to pick up where you left off.</li>
                        </ul>

                        <p className="text-center font-bold text-xl mt-8 mb-4">Enjoy a seamless, automated, and fair basketball rotation! 🏀</p>
                      </div>
                    ));
                  }}
                >
                  Site User Guide
                </button>
              </li>
              <li className="h-5 border-l border-gray-400 mx-1"></li>
              <li>
                <button
                  type="button"
                  className="text-gray-600 hover:text-[#1E3A8A] transition-colors duration-200 font-medium text-sm whitespace-nowrap px-2 bg-transparent"
                  onClick={() => {
                    openModal("My Story", (
                      <div>
                        <h3 className="text-2xl font-bold mb-4">Welcome to Pickup Basketball Manager!</h3>
                        <p className="mb-4 text-lg">I'm <strong>Kyle Tobin</strong>, designer and developer of this site.</p>
                        
                        <p className="mb-4 text-lg">
                          As an <em>avid basketball player</em> and a <em>multiple-time Midtown Basketball League Champion</em>, 
                          I've spent countless hours enjoying games at <strong>Midtown Athletic Club in Chicago</strong>.
                        </p>
                        
                        <p className="mb-4 text-lg">
                          I created this site to <strong>streamline and improve the pickup basketball experience</strong>. 
                          Previously, players managed game participation by scribbling their names on paper or keeping mental 
                          track of games and arrivals — methods that often led to <em>confusion, disagreements, and frustration</em>.
                        </p>
                        
                        <p className="mb-4 text-lg">
                          <strong>Pickup Basketball Manager</strong> solves these issues by:
                        </p>
                        
                        <ul className="list-disc pl-8 mb-6 text-lg">
                          <li className="mb-2"><em>Fairly managing the game rotation</em></li>
                          <li className="mb-2"><em>Clearly indicating who's playing next</em></li>
                          <li className="mb-2"><em>Providing accurate wait-time estimates</em></li>
                        </ul>
                        
                        <p className="mb-6 text-lg">
                          My goal is to provide a platform that ensures a <strong>great experience for all players.</strong>
                        </p>
                        
                        <p className="mb-10 text-lg">
                          Thanks for joining the game — <strong>see you on the court!</strong> 🏀
                        </p>
                        
                        {/* Social Media Links */}
                        <div className="flex items-center mb-10">
                          <p className="mr-4 text-lg font-bold">Let's connect!</p>
                          <a 
                            href="https://www.linkedin.com/in/kylegtobin/" 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mr-4 relative group"
                          >
                            <svg 
                              xmlns="http://www.w3.org/2000/svg" 
                              width="40" 
                              height="40" 
                              viewBox="0 0 24 24"
                              className="hover:opacity-80 transition-opacity"
                            >
                              <path 
                                fill="#0077B5" 
                                d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"
                              />
                            </svg>
                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-1 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                              LinkedIn
                            </span>
                          </a>
                          <a 
                            href="https://www.instagram.com/kyle.tobin/" 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block relative group"
                          >
                            <img 
                              src="https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Instagram_logo_2022.svg/1200px-Instagram_logo_2022.svg.png" 
                              alt="Instagram" 
                              width="40" 
                              height="40" 
                              className="hover:opacity-80 transition-opacity"
                            />
                            <span className="absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-1 bg-black text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                              Instagram
                            </span>
                          </a>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mt-8">
                          <div className="flex flex-col items-center">
                            <img 
                              src={Champ1} 
                              alt="Championship 1" 
                              className="rounded-lg shadow-xl border-4 border-gray-300 w-full h-auto object-contain max-h-[500px]"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <img 
                              src={Champ2} 
                              alt="Championship 2" 
                              className="rounded-lg shadow-xl border-4 border-gray-300 w-full h-auto object-contain max-h-[500px]"
                            />
                          </div>
                        </div>
                      </div>
                    ));
                  }}
                >
                  My Story
                </button>
              </li>
              <li className="h-5 border-l border-gray-400 mx-1"></li>
              <li>
                <button
                  type="button"
                  className="text-gray-600 hover:text-[#1E3A8A] transition-colors duration-200 font-medium text-sm whitespace-nowrap px-2 bg-transparent"
                  onClick={() => setRecapOpen(true)}
                >
                  Recap
                </button>
              </li>
            </ul>
          </nav>
        </div>
        
        {/* Game Controls */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">Manual mode</span>
            <Switch
              checked={gameState.manualMode}
              onChange={toggleManualMode}
              label="Manual mode"
              className={`${
                gameState.manualMode ? 'bg-blue-600' : 'bg-gray-900'
              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
            />
            <button
              onClick={() => setCourtViewOpen(true)}
              className="ml-2 xl:ml-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#D5DAE1] bg-white hover:bg-gray-100 text-base font-semibold"
              title="Big-screen view of who's playing and who's next"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
              Court view
            </button>
            {tvSupported() && (
              <button
                onClick={() => { if (!openTvWindow()) toast(TV_BLOCKED_MESSAGE, 'error'); }}
                className="inline-flex items-center gap-2 px-3 xl:px-4 py-2 rounded-lg border border-[#D5DAE1] bg-white hover:bg-gray-100 text-base font-semibold"
                title="Open court view in its own window for a TV or projector. It follows this screen."
                aria-label="Second screen"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="13" height="9" rx="1.5" /><rect x="10" y="9" width="13" height="9" rx="1.5" fill="white" /><path d="M14 21h5M16.5 18v3" /></svg>
                {/* With phone view on there's one more button, so the label waits for a wider screen */}
                <span className={cloud.on && !sample ? 'hidden min-[1440px]:inline' : 'hidden xl:inline'}>Second screen</span>
              </button>
            )}
            {cloud.on && !sample && (
              <button
                onClick={() => setPhoneOpen(true)}
                className="relative inline-flex items-center gap-2 px-3 xl:px-4 py-2 rounded-lg border border-[#D5DAE1] bg-white hover:bg-gray-100 text-base font-semibold"
                title={cloudStatus ? cloudStatus.text : 'Let players follow the line and the score on their phones'}
                aria-label="Phone view"
                aria-describedby="pbm-phone-status"
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>
                <span className="hidden min-[1440px]:inline">Phone view</span>
                {cloudStatus && (
                  <span aria-hidden="true" className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ring-2 ring-white ${cloudStatus.tone === 'ok' ? 'bg-green-500' : cloudStatus.tone === 'warn' ? 'bg-amber-500' : cloudStatus.tone === 'bad' ? 'bg-red-600' : 'bg-gray-400'}`} />
                )}
                <span id="pbm-phone-status" className="sr-only">{cloudStatus?.text ?? ''}</span>
              </button>
            )}
            {saveStatus === 'saved' && !isEmpty && (
              <span className="ml-3 inline-flex items-center gap-1 text-sm text-gray-500" title="Tonight is saved in this browser as you go">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                Saved
              </span>
            )}
            {cloudStatus && (cloudStatus.tone === 'warn' || cloudStatus.tone === 'bad') && (
              <button
                type="button"
                onClick={() => setPhoneOpen(true)}
                className={`ml-3 text-sm font-semibold underline-offset-2 hover:underline ${cloudStatus.tone === 'warn' ? 'text-amber-700' : 'text-red-700'}`}
              >
                {cloudStatus.text}
              </button>
            )}
            {saveStatus === 'failed' && (
              <span className="ml-3 text-sm font-semibold text-red-700" role="status" title="This browser won't let the app save. Tonight still runs but won't survive a refresh.">
                Not saving on this device
              </span>
            )}
          </div>
          <div className="flex gap-3 xl:gap-4 items-center pointer-events-auto">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title={canUndo ? `Undo: ${undoLabel}` : 'Nothing to undo yet'}
              className={`flex flex-col items-center justify-center min-w-[7.5rem] h-[52px] px-4 rounded-lg border transition-colors duration-200 ${
                canUndo ? 'bg-white border-[#D5DAE1] text-[#1B2430] hover:bg-gray-100' : 'bg-transparent border-[#D5DAE1] text-gray-400 cursor-not-allowed'
              }`}
            >
              <span className="text-lg font-bold leading-tight">&#8630; Undo</span>
              {canUndo && <span className="text-xs leading-tight text-gray-600 max-w-[9rem] truncate">{undoLabel}</span>}
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Champions Won button clicked");
                handleGameEnd('champions');
              }}
              className="bg-[#E85A00] hover:bg-[#C94E00] text-white px-6 py-3 rounded-lg transition-colors duration-200 text-lg font-bold relative"
            >
              Champions Won
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Challengers Won button clicked");
                handleGameEnd('challengers');
              }}
              className="bg-[#1E3A8A] hover:bg-[#172E6E] text-white px-6 py-3 rounded-lg transition-colors duration-200 text-lg font-bold relative"
            >
              Challengers Won
            </button>
          </div>
        </div>

        {/* Scoreboard and the arranging bar stay in view while scrolling */}
        <div className={`sticky ${sample ? 'top-[76px]' : 'top-2'} z-40`}>
          <Scoreboard stickyTop="" active={active} quietPopup={courtViewOpen} />
          <ArrangeBar stickyTop="" />
        </div>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div className="mb-0 flex gap-3">
            <button
              onClick={() => setSignInOpen(true)}
              className="shrink-0 inline-flex items-center gap-2 bg-[#E85A00] hover:bg-[#C94E00] text-white px-4 py-2.5 text-lg font-bold rounded-lg transition-colors duration-200"
              title="Players tap their own name to sign in"
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M19 8v6M16 11h6" /></svg>
              Sign in
            </button>
            <div className="relative flex flex-1 min-w-0">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setTimeout(() => setInputFocused(false), 150)}
                placeholder="Enter player name"
                aria-label="Enter player name"
                className="flex-1 min-w-0 px-3 py-2.5 text-lg bg-white border border-[#D5DAE1] rounded-l-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              />
              <button
                onClick={handleAddPlayer}
                className="bg-[#1B2430] hover:bg-black text-white px-4 py-2.5 text-lg font-semibold rounded-r-lg transition-colors duration-200 whitespace-nowrap"
              >
                Add Player
              </button>
              {inputFocused && suggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-[#D5DAE1] rounded-lg shadow-lg overflow-hidden" role="listbox" aria-label="Saved names">
                  {suggestions.map(r => (
                    <li key={r.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          try { addPlayer(r.name); setNewPlayerName(''); } catch { setErrorMessage(`"${r.name}" already exists.`); setShowError(true); }
                        }}
                        className="w-full text-left px-4 py-2.5 text-lg hover:bg-blue-50"
                      >
                        {r.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="mb-0">
            <div className="flex">
              <input
                type="text"
                value={removePlayerName}
                onChange={(e) => setRemovePlayerName(e.target.value)}
                onKeyPress={handleRemoveKeyPress}
                placeholder="Name to remove"
                className="flex-1 min-w-0 px-3 py-2.5 text-lg bg-white border border-[#D5DAE1] rounded-l-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
              />
              <button
                onClick={handleRemovePlayer}
                className="bg-white hover:bg-gray-100 text-[#1B2430] border border-l-0 border-[#D5DAE1] px-5 py-2.5 text-lg font-semibold rounded-r-lg transition-colors duration-200"
              >
                Remove Player
              </button>
            </div>
          </div>
        </div>

        {/* Only on the empty start screen, so it never shows during a real night */}
        {!sample && onTrySample && isEmpty && (
          <div className="flex justify-center mb-4">
            <button
              onClick={onTrySample}
              className="bg-white hover:bg-amber-50 text-gray-900 border-2 border-[#E85A00] px-5 py-2 rounded-full font-bold transition-colors duration-200"
            >
              New here? Try a sample game
            </button>
          </div>
        )}

        {/* Teams */}
        <div className="grid grid-cols-2 gap-6 mb-4">
          <TeamBox title="Champions" team={champions} type="champions" />
          <TeamBox title="Challengers" team={challengers} type="challengers" />
        </div>

        <WaitingQueue />

        <SittingOut />

        {/* Modals */}
        <ContentModal
          isOpen={activeModal.isOpen}
          title={activeModal.title}
          content={activeModal.content}
          onClose={closeModal}
        />
        
        <ShootoutModal />

        <ResumePrompt />

        {recapOpen && <RecapModal onClose={() => setRecapOpen(false)} isSample={!!sample} />}

        {signInOpen && <SignInSheet onClose={() => setSignInOpen(false)} isSample={!!sample} />}

        {courtViewOpen && <CourtView onClose={() => setCourtViewOpen(false)} isSample={!!sample} />}

        {phoneOpen && cloud.on && !sample && (
          <React.Suspense fallback={null}>
            <PhonePanel cloud={cloud} onClose={() => setPhoneOpen(false)} />
          </React.Suspense>
        )}
        
        <InfoModal
          isOpen={infoModalState.isOpen}
          message={infoModalState.message}
          onClose={dismissInfoModal}
        />
        
        <ErrorModal
          isOpen={showError}
          message={errorMessage || ''}
          onClose={() => {
            setShowError(false);
            setErrorMessage(null);
          }}
        />
      </div>
      </div>
    </div>
  );
}

export default App;
