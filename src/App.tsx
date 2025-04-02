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

  const handleAddPlayer = () => {
    if (!newPlayerName.trim()) return;

    try {
      addPlayer(newPlayerName.trim());
      setNewPlayerName('');
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(`Player "${newPlayerName}" already exists. Please use a different name or add a last initial.`);
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

  return (
    <div className="min-h-screen bg-[#F5F5F5] p-6">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Logo Header */}
        <div className="flex justify-center p-0 mb-0">
          <div className="bg-[#F5F5F5] p-0">
            <img 
              src={PBM1Logo} 
              alt="Pickup Basketball Manager" 
              className="h-48 object-contain p-0"
              style={{ 
                mixBlendMode: 'multiply',
                maxWidth: '1200px',
                width: '100%'
              }}
            />
          </div>
        </div>
        
        {/* Game Controls */}
        <div className="flex justify-between items-center mb-6 pt-0">
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
              className="bg-[#FF6200] hover:bg-orange-700 text-white px-6 py-3 rounded transition-colors duration-200 text-lg relative"
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
              className="bg-[#1E3A8A] hover:bg-blue-900 text-white px-6 py-3 rounded transition-colors duration-200 text-lg relative"
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
        <ShootoutModal />
        <InfoModal
          isOpen={infoModalState.isOpen}
          message={infoModalState.message}
          onClose={dismissInfoModal}
        />
        {errorMessage && (
          <ErrorModal
            isOpen={true}
            message={errorMessage}
            onClose={() => setErrorMessage(null)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
