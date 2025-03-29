import React, { useState, useEffect } from 'react';
import { Player } from '../../types';
import { useGame } from '../../context/GameContext';

const ShootoutModal: React.FC = () => {
  const { gameState, confirmShootout, dismissShootoutModal } = useGame();
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);

  // Reset selected players when shootout team changes
  useEffect(() => {
    setSelectedPlayers([]);
  }, [gameState.shootoutTeam]);

  if (!gameState.showShootoutModal || !gameState.shootoutTeam) return null;

  const handlePlayerClick = (player: Player) => {
    if (selectedPlayers.some(p => p.id === player.id)) {
      // Deselect player
      setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
    } else if (selectedPlayers.length < gameState.requiredPlayers) {
      // Select player if we haven't reached the limit
      setSelectedPlayers(prev => [...prev, player]);
    }
  };

  const handleConfirm = () => {
    if (selectedPlayers.length === gameState.requiredPlayers) {
      confirmShootout(selectedPlayers);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">3-Point Shootout or Random Selection</h2>
          <button 
            onClick={dismissShootoutModal}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <p className="mb-4">Select {gameState.requiredPlayers} players who won the shootout:</p>
        <div className="space-y-2">
          {gameState.shootoutTeam.players.map(player => (
            <div
              key={player.id}
              className={`p-2 rounded cursor-pointer ${
                selectedPlayers.some(p => p.id === player.id)
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={() => handlePlayerClick(player)}
            >
              {player.name}
            </div>
          ))}
        </div>
        <button
          className={`mt-4 w-full py-2 px-4 rounded font-bold ${
            selectedPlayers.length === gameState.requiredPlayers
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
          disabled={selectedPlayers.length !== gameState.requiredPlayers}
          onClick={handleConfirm}
        >
          Confirm Selection
        </button>
      </div>
    </div>
  );
};

export default ShootoutModal;
