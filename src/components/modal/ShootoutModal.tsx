import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Player } from '../../types';
import { useGame } from '../../context/GameContext';
import { useDialogFocus } from '../../utils/useDialogFocus';

const ShootoutModal: React.FC = () => {
  const { gameState, confirmShootout, undo, canUndo } = useGame();
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const required = gameState.requiredPlayers;
  const dialogRef = useRef<HTMLDivElement>(null);
  // Keyboard focus stays in the pop-up, so nothing behind it can be changed mid-shootout
  useDialogFocus(dialogRef, gameState.showShootoutModal && !!gameState.shootoutTeam);

  // Reset selected players when shootout team changes
  useEffect(() => {
    setSelectedPlayers([]);
  }, [gameState.shootoutTeam]);

  const handleConfirm = useCallback(() => {
    if (selectedPlayers.length === required) {
      confirmShootout(selectedPlayers);
    }
  }, [selectedPlayers, required, confirmShootout]);

  // Enter confirms once the right number are picked
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (gameState.showShootoutModal && event.key === 'Enter') handleConfirm();
    };
    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [gameState.showShootoutModal, handleConfirm]);

  // Auto-focus the confirm button
  useEffect(() => {
    if (gameState.showShootoutModal && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [gameState.showShootoutModal]);

  if (!gameState.showShootoutModal || !gameState.shootoutTeam) return null;

  const handlePlayerClick = (player: Player) => {
    if (selectedPlayers.some(p => p.id === player.id)) {
      setSelectedPlayers(prev => prev.filter(p => p.id !== player.id));
    } else if (selectedPlayers.length < required) {
      setSelectedPlayers(prev => [...prev, player]);
    }
  };

  const alreadyIn = gameState.challengers;
  const notPicked = gameState.shootoutTeam.players.length - required;
  const ready = selectedPlayers.length === required;

  return (
    // Above court view too, so a runner using court view can pick winners right there
    <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
      <div className="absolute inset-0 bg-black/50"></div>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="shootout-title" className="outline-none bg-white rounded-xl shadow-xl max-w-md w-full relative border-t-[10px] border-[#F5B301] p-6">
        <h2 id="shootout-title" className="text-2xl font-bold text-center text-[#1B2430]">3-Point Shootout</h2>
        <p className="mt-2 text-lg text-center">
          Tap the <strong>{required} {required === 1 ? 'player' : 'players'}</strong> who won {required === 1 ? 'the spot' : 'the spots'}.
        </p>
        {alreadyIn.length > 0 && (
          <p className="mt-2 text-center text-gray-600">
            Already in: {alreadyIn.map(p => p.name).join(', ')}
          </p>
        )}

        <div className="mt-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {gameState.shootoutTeam.players.map(player => {
            const picked = selectedPlayers.some(p => p.id === player.id);
            return (
              <button
                key={player.id}
                type="button"
                aria-pressed={picked}
                className={`w-full p-3 rounded-lg text-center text-lg font-bold transition-colors border ${
                  picked
                    ? 'bg-[#1E3A8A] border-[#1E3A8A] text-white'
                    : 'bg-white border-[#D5DAE1] text-[#1B2430] hover:bg-gray-50'
                }`}
                onClick={() => handlePlayerClick(player)}
              >
                {player.name}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-center font-semibold text-[#1B2430]" aria-live="polite">
          {selectedPlayers.length} of {required} picked
        </p>
        <p className="mt-1 text-center text-sm text-gray-600">
          {notPicked === 1 ? 'The player not picked goes' : `The ${notPicked} not picked go`} to the front of the line.
        </p>

        <div className="mt-4 flex justify-center">
          <button
            ref={buttonRef}
            onClick={handleConfirm}
            disabled={!ready}
            className={`px-8 py-3 text-lg font-semibold rounded-lg transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] focus-visible:ring-offset-2 ${
              ready ? 'bg-[#1B2430] hover:bg-black text-white' : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            Confirm
          </button>
        </div>
        {canUndo && (
          <div className="mt-3 text-center">
            <button onClick={undo} className="text-sm font-semibold text-gray-600 underline hover:text-[#1E3A8A]">
              Wrong result? Undo it
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShootoutModal;
