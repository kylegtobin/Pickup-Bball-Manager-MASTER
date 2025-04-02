import React, { useState, useEffect, useRef } from 'react';
import { Player } from '../../types';
import { useGame } from '../../context/GameContext';

const ShootoutModal: React.FC = () => {
  const { gameState, confirmShootout, dismissShootoutModal } = useGame();
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Reset selected players when shootout team changes
  useEffect(() => {
    setSelectedPlayers([]);
  }, [gameState.shootoutTeam]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (gameState.showShootoutModal && selectedPlayers.length === gameState.requiredPlayers) {
        if (event.key === 'Enter') {
          handleConfirm();
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [gameState.showShootoutModal, selectedPlayers, gameState.requiredPlayers]);

  // Auto-focus the confirm button
  useEffect(() => {
    if (gameState.showShootoutModal && buttonRef.current) {
      buttonRef.current.focus();
      buttonRef.current.style.outline = 'none';
      buttonRef.current.style.boxShadow = 'none';
    }
  }, [gameState.showShootoutModal]);

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
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <div className="absolute inset-0 bg-black bg-opacity-50"></div>
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4 relative border-4 border-gray-900">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold">3-Point Shootout</h2>
          <p className="mt-2 text-lg">Select {gameState.requiredPlayers} player(s) who won the shootout:</p>
        </div>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {gameState.shootoutTeam.players.map(player => (
            <div
              key={player.id}
              className={`p-3 rounded cursor-pointer text-center text-lg font-bold transition-colors ${
                selectedPlayers.some(p => p.id === player.id)
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              onClick={() => handlePlayerClick(player)}
            >
              {player.name}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-center">
          <button
            ref={buttonRef}
            onClick={handleConfirm}
            disabled={selectedPlayers.length !== gameState.requiredPlayers}
            className={`px-8 py-3 text-lg font-semibold rounded-lg transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 ${
              selectedPlayers.length === gameState.requiredPlayers
                ? 'bg-gray-900 hover:bg-black text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
            style={{ outline: 'none', boxShadow: 'none' }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShootoutModal;
