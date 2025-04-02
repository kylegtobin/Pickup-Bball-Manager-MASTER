import React from 'react';
import { useGame } from '../context/GameContext';

const GameControls: React.FC = () => {
  const { gameState, toggleManualMode, handleGameEnd } = useGame();
  const { manualMode, champions, challengers } = gameState;

  const handleToggleManualMode = () => {
    if (manualMode) {
      // Validate team sizes before turning off Manual Mode
      if (champions.length !== 5 || challengers.length !== 5) {
        alert("Both teams must have exactly five players before turning manual mode off.");
        return;
      }
    }
    // Manual mode can be enabled at any time - no restrictions
    
    toggleManualMode();
  };

  const handleChampionsWon = () => {
    handleGameEnd('champions');
  };

  const handleChallengersWon = () => {
    handleGameEnd('challengers');
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow mb-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center">
          <span className="mr-3 font-medium">Manual Mode:</span>
          <label className="inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={manualMode}
              onChange={handleToggleManualMode}
            />
            <div className={`relative w-11 h-6 rounded-full peer ${
              manualMode ? 'bg-blue-600' : 'bg-gray-900'
            } peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all`}></div>
          </label>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={handleChampionsWon}
            className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={champions.length !== 5 || challengers.length !== 5}
          >
            Champions Won
          </button>
          
          <button
            onClick={handleChallengersWon}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={champions.length !== 5 || challengers.length !== 5}
          >
            Challengers Won
          </button>
        </div>
      </div>
      
      {/* Validation indicators */}
      <div className="mt-4 text-sm">
        <div className={`${champions.length === 5 ? 'text-green-600' : 'text-red-600'}`}>
          Champions: {champions.length}/5 players
        </div>
        <div className={`${challengers.length === 5 ? 'text-green-600' : 'text-red-600'}`}>
          Challengers: {challengers.length}/5 players
        </div>
      </div>
    </div>
  );
};

export default GameControls;
