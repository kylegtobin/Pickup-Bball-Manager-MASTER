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
import PBM2Logo from './assets/images/PBM 2.jpg';
import ContentModal from './components/modal/ContentModal';
import Champ1 from './assets/images/Champ 1.jpg';
import Champ2 from './assets/images/Champ 2.jpg';
import './App.css';

// Wrapper component to provide context
function App() {
  return (
    <ToastProvider>
      <GameProvider>
        <PickupBasketballApp />
      </GameProvider>
    </ToastProvider>
  );
}

// Inner component with access to context
function PickupBasketballApp() {
  const { 
    gameState, 
    addPlayer, 
    removePlayer, 
    handleGameEnd, 
    toggleManualMode,
    infoModalState,
    dismissInfoModal,
    errorMessage,
    setErrorMessage
  } = useGame();
  
  const { champions, challengers } = gameState;
  const [newPlayerName, setNewPlayerName] = React.useState('');
  const [removePlayerName, setRemovePlayerName] = React.useState('');
  const [showError, setShowError] = React.useState(false);
  
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
    <div className="min-h-screen bg-[#F5F5F5] p-6">
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        {/* Navigation Menu - Moved above the logo */}
        <div className="flex justify-end mb-0">
          <nav>
            <ul className="flex items-center">
              <li>
                <a 
                  href="#" 
                  className="text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium text-base px-4"
                  onClick={(e) => {
                    e.preventDefault();
                    openModal("Video Tutorial", (
                      <div className="flex flex-col items-center">
                        <div className="w-full max-w-3xl aspect-video">
                          <iframe 
                            src="https://www.youtube.com/embed/iQyFAp4Y3jM" 
                            title="Pickup Basketball App Tutorial"
                            className="w-full h-full border-0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowFullScreen
                          ></iframe>
                        </div>
                      </div>
                    ));
                  }}
                >
                  Video Tutorial
                </a>
              </li>
              <li className="h-5 border-l border-gray-400 mx-1"></li>
              <li>
                <a 
                  href="#" 
                  className="text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium text-base px-4"
                  onClick={(e) => {
                    e.preventDefault();
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
                          <li><strong>Scoring:</strong></li>
                          <ul className="list-disc pl-12">
                            <li><strong>2-point baskets</strong> = 1 point</li>
                            <li><strong>3-point baskets</strong> = 2 points</li>
                          </ul>
                          <li>🚫 <strong>No free throws</strong> — if fouled on a shot, your team keeps the ball</li>
                          <li>🫱 Players <strong>call their own fouls</strong> — <strong>play fair and be respectful</strong></li>
                        </ul>
                        
                        <hr className="my-6 border-t border-gray-300" />
                        
                        <h3 className="text-xl font-bold mb-4">Three-Point Shootout</h3>
                        
                        <p className="font-bold mb-2">When It Happens</p>
                        <ul className="list-disc pl-6 mb-4">
                          <li>A shootout takes place when there <strong>aren't enough new players</strong> to form a full 5-player Challengers team</li>
                          <li>Players from a <strong>previous losing team</strong> compete for the <strong>1 to 4 open spots</strong></li>
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
                </a>
              </li>
              <li className="h-5 border-l border-gray-400 mx-1"></li>
              <li>
                <a 
                  href="#" 
                  className="text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium text-base px-4"
                  onClick={(e) => {
                    e.preventDefault();
                    openModal("Site User Guide", (
                      <div className="text-lg">
                        <h3 className="text-xl font-bold mb-4">📋 Quick Start</h3>
                        <ul className="list-disc pl-6 mb-6">
                          <li>Enter a name in the <strong>Enter Player Name</strong> box and click <strong>Add Player</strong>. The first 10 players fill the <strong>Champions</strong> & <strong>Challengers</strong> teams; subsequent players join the <strong>Waiting Queue</strong>.</li>
                          <li>Game results can be recorded once both <strong>Champions</strong> and <strong>Challengers</strong> teams have 5 players each.</li>
                          <li>After a game, click the <strong>Champions Won</strong> or <strong>Challengers Won</strong> buttons at the top of the page.</li>
                          <li>Winners stay, losers queue up, and the next 5 Challengers are filled automatically, with a three-point shootout pop-up appearing when required.</li>
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
                              <li>Enter the player's name in the <strong>Enter Player Name</strong> box and click <strong>Remove Player</strong>.</li>
                            </ul>
                          </li>
                          <li><strong>Manual Mode:</strong>
                            <ul className="list-disc pl-6 mt-1">
                              <li>Toggle the switch <strong>ON</strong> to manually arrange players. Player cards become draggable.</li>
                              <li>Activates automatically if a player is removed from Champions or Challengers.</li>
                              <li>Drag players to highlighted <strong>drop zones</strong> to move them between Champions, Challengers, or the Waiting Queue.</li>
                              <li>Reorder players within the Waiting Queue by dragging them to different slots (drop zones).</li>
                              <li>Perfect for special situations: injured players, someone needing to move back in the queue for a phone call, or friends wanting to play together.</li>
                              <li>Remember to toggle Manual Mode <strong>OFF</strong> when finished arranging.</li>
                            </ul>
                          </li>
                        </ul>

                        <p className="text-center font-bold text-xl mt-8 mb-4">Enjoy a seamless, automated, and fair basketball rotation! 🏀</p>
                      </div>
                    ));
                  }}
                >
                  Site User Guide
                </a>
              </li>
              <li className="h-5 border-l border-gray-400 mx-1"></li>
              <li>
                <a 
                  href="#" 
                  className="text-gray-700 hover:text-blue-600 transition-colors duration-200 font-medium text-base px-4"
                  onClick={(e) => {
                    e.preventDefault();
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
                </a>
              </li>
            </ul>
          </nav>
        </div>
        
        {/* Logo Header */}
        <div className="flex justify-center p-0 mb-0">
          <div className="bg-[#F5F5F5] p-0">
            <img 
              src={PBM1Logo} 
              alt="Pickup Basketball Manager" 
              className="h-36 object-contain p-0"
              style={{ 
                mixBlendMode: 'multiply',
                maxWidth: '1200px',
                width: '100%'
              }}
            />
          </div>
        </div>
        
        {/* Game Controls */}
        <div className="flex justify-between items-center mb-5 pt-0">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold">Manual Mode:</span>
            <Switch
              checked={gameState.manualMode}
              onChange={toggleManualMode}
              className={`${
                gameState.manualMode ? 'bg-blue-600' : 'bg-gray-900'
              } relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none`}
            />
          </div>
          <div className="flex gap-4 items-center pointer-events-auto">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Champions Won button clicked");
                handleGameEnd('champions');
              }}
              className="bg-[#E85A00] text-white px-6 py-3 rounded transition-colors duration-200 text-lg font-bold relative"
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
              className="bg-[#1E3A8A] hover:bg-blue-900 text-white px-6 py-3 rounded transition-colors duration-200 text-lg font-bold relative"
            >
              Challengers Won
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div className="mb-0">
            <div className="flex">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter player name"
                className="flex-1 p-2 border border-gray-300 rounded-l focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
              />
              <button
                onClick={handleAddPlayer}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-r transition-colors duration-200"
              >
                Add Player
              </button>
            </div>
          </div>
          <div className="mb-0">
            <div className="flex">
              <input
                type="text"
                value={removePlayerName}
                onChange={(e) => setRemovePlayerName(e.target.value)}
                onKeyPress={handleRemoveKeyPress}
                placeholder="Enter player name"
                className="flex-1 p-2 border border-gray-300 rounded-l focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
              />
              <button
                onClick={handleRemovePlayer}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors duration-200"
              >
                Remove Player
              </button>
            </div>
          </div>
        </div>

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
  );
}

export default App;
