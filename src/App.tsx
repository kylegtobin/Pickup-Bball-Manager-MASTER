import React from 'react';
import { GameProvider, useGame } from './context/GameContext';
import TeamBox from './components/team/TeamBox';
import WaitingQueue from './components/queue/WaitingQueue';
import ShootoutModal from './components/modal/ShootoutModal';
import InfoModal from './components/modal/InfoModal';
import Switch from './components/ui/Switch';
import { ToastProvider } from './components/ui/Toast';
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
    dismissInfoModal
  } = useGame();
  
  const { champions, challengers } = gameState;
  const [newPlayerName, setNewPlayerName] = React.useState('');
  const [removePlayerName, setRemovePlayerName] = React.useState('');

  const handleAddPlayer = () => {
    if (newPlayerName.trim()) {
      addPlayer(newPlayerName.trim());
      setNewPlayerName('');
    }
  };

  const handleRemovePlayer = () => {
    if (removePlayerName.trim()) {
      removePlayer(removePlayerName.trim());
      setRemovePlayerName('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl font-bold text-center text-blue-600 mb-2">Pickup Basketball App</h1>
        <p className="text-center text-gray-600 mb-6">Manage your pickup games with ease</p>

        {/* Game Controls */}
        <div className="flex items-center justify-between mb-4 bg-white p-4 rounded-lg shadow">
          <div className="flex items-center gap-2">
            <span>Manual Mode:</span>
            <Switch
              checked={gameState.manualMode}
              onChange={toggleManualMode}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleGameEnd('champions')}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
            >
              Champions Won
            </button>
            <button
              onClick={() => handleGameEnd('challengers')}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            >
              Challengers Won
            </button>
          </div>
        </div>

        {/* Player Management */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Add Player</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter player name"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddPlayer()}
                  className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddPlayer}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                >
                  Add Player
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-2">Remove Player</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter player name"
                  value={removePlayerName}
                  onChange={(e) => setRemovePlayerName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleRemovePlayer()}
                  className="flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleRemovePlayer}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
                >
                  Remove Player
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Teams */}
        <div className="grid grid-cols-2 gap-6 mb-6">
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
      </div>
    </div>
  );
}

export default App;
