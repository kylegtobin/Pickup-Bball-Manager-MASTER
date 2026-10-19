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
import { GameRules, UserGuide, MyStory } from './components/HelpGuides';
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
import TvWindow from './components/TvWindow';
import { isTvLink, openTvWindow, tvSupported, useTvBroadcast, TV_BLOCKED_MESSAGE } from './utils/tvLink';
import { blockingDialogOpen, typing } from './utils/visibility';
import { runViewToken, isPhone, runnerOnThisPhone, readCloudSwitch } from './cloud/config';
import { useCloud } from './cloud/useCloud';
import { syncText } from './cloud/status';

import './App.css';

// Only loaded when someone opens it, so the QR code library stays out of the everyday app
const PhonePanel = React.lazy(() => import('./components/cloud/PhonePanel'));
// The phone page is its own small download too
const RunView = React.lazy(() => import('./components/RunView'));
const PhoneHome = React.lazy(() => import('./components/PhoneHome'));

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
  // A phone with no run link is almost always a player checking the line, so it gets the player page
  // (the full app is one tap away). Only while phone view is on.
  if (isPhone() && !runnerOnThisPhone() && readCloudSwitch()) {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-[#0E1A33]" />}>
        <PhoneHome />
      </React.Suspense>
    );
  }
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
    olderTabOpen,
    regulars,
    lastAdded
  } = useGame();
  const { toast } = useToast();
  // Phone view (off unless switched on for this browser). The sample never shares.
  const cloud = useCloud(gameState, !sample);
  // The run's code, for court view, while phones are following (not paused, not the sample)
  const phoneCode = cloud.on && !sample && !cloud.paused ? cloud.run?.code ?? null : null;
  useTvBroadcast(gameState, !!sample, active, phoneCode);
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
    [...champions, ...challengers, ...gameState.waitingQueue.flatMap(i => ('players' in i ? i.players : [i]))].map(p => p.name.toLowerCase())
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
        setErrorMessage(`"${newPlayerName.trim()}" is already in. Two of you? Add a letter, like "Mike Sm.", or use your full name.`);
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
            {olderTabOpen
              ? <><strong>This app is already open in another tab.</strong> Close this tab and keep using the other one.</>
              : <><strong>The app was just opened in another tab.</strong> Keep using this one and close the other.</>}
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
                    openModal("Game Format & Rules", <GameRules />);
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
                    openModal("Site User Guide", <UserGuide />);
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
                    openModal("My Story", <MyStory photos={[Champ1, Champ2]} />);
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
          <div className="relative flex items-center gap-2">
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
                {/* With phone view on there's one more button, so this one is just the icon (the row is 1168px at most) */}
                <span className={cloud.on && !sample ? 'hidden' : 'hidden xl:inline'}>Second screen</span>
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
                <span className="hidden xl:inline">Phone view</span>
                {cloudStatus && (
                  <span aria-hidden="true" className={`absolute -top-1 -right-1 h-3 w-3 rounded-full ring-2 ring-white ${cloudStatus.tone === 'ok' ? 'bg-green-500' : cloudStatus.tone === 'warn' ? 'bg-amber-500' : cloudStatus.tone === 'bad' ? 'bg-red-600' : 'bg-gray-400'}`} />
                )}
                <span id="pbm-phone-status" className="sr-only">{cloudStatus?.text ?? ''}</span>
              </button>
            )}
            {saveStatus === 'saved' && !isEmpty && !(cloudStatus && (cloudStatus.tone === 'warn' || cloudStatus.tone === 'bad')) && (
              <span className="absolute right-0 top-full mt-0.5 inline-flex items-center gap-1 whitespace-nowrap text-xs leading-4 text-gray-500" title="Tonight is saved in this browser as you go">
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                Saved
              </span>
            )}
            {/* Notes sit in a thin line under the buttons, so they never push Undo and the result buttons to a new row */}
            {cloudStatus && (cloudStatus.tone === 'warn' || cloudStatus.tone === 'bad') && (
              <button
                type="button"
                onClick={() => setPhoneOpen(true)}
                className={`absolute right-0 top-full mt-0.5 whitespace-nowrap text-xs leading-4 font-semibold underline-offset-2 hover:underline ${cloudStatus.tone === 'warn' ? 'text-amber-700' : 'text-red-700'}`}
              >
                {cloudStatus.text}
              </button>
            )}
            {saveStatus === 'failed' && (
              <span className="absolute left-0 top-full mt-0.5 whitespace-nowrap text-xs leading-4 font-semibold text-red-700" role="status" title="This browser won't let the app save. Tonight still runs but won't survive a refresh.">
                Not saving on this device
              </span>
            )}
          </div>
          <div className="flex gap-3 items-center pointer-events-auto">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              title={canUndo ? `Undo: ${undoLabel}` : 'Nothing to undo yet'}
              className={`flex flex-col items-center justify-center w-[7.5rem] h-[52px] px-2 rounded-lg border transition-colors duration-200 ${
                canUndo ? 'bg-white border-[#D5DAE1] text-[#1B2430] hover:bg-gray-100' : 'bg-transparent border-[#D5DAE1] text-gray-400 cursor-not-allowed'
              }`}
            >
              <span className="text-lg font-bold leading-tight">&#8630; Undo</span>
              {canUndo && <span className="text-xs leading-tight text-gray-600 max-w-full truncate">{undoLabel}</span>}
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
                placeholder="Name, like Mike S."
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
                          try { addPlayer(r.name); setNewPlayerName(''); } catch { setErrorMessage(`"${r.name}" is already in. Two of you? Add a letter, like "Mike Sm.", or use your full name.`); setShowError(true); }
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

        {courtViewOpen && <CourtView onClose={() => setCourtViewOpen(false)} isSample={!!sample} phoneCode={phoneCode} />}

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
