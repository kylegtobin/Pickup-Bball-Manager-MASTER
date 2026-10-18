import React from 'react';
import { useGame } from '../context/GameContext';
import { findSelection } from '../utils/selection';

// Shown while manual mode is on: says what's happening, what's picked up, and how to finish.
const ArrangeBar: React.FC<{ stickyTop: string }> = ({ stickyTop }) => {
  const { gameState, selectedPlayerId, setSelectedPlayerId, removePlayer, sitOut, toggleManualMode } = useGame();
  const selection = findSelection(gameState, selectedPlayerId);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedPlayerId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSelectedPlayerId]);

  if (!gameState.manualMode) return null;

  let hint = 'Drag a player, or tap one and then tap where they go. Tap a previous team’s name to move the whole group.';
  if (selection?.kind === 'player') {
    hint = selection.where === 'champions' || selection.where === 'challengers'
      ? `Tap someone in line or on the other team to swap with ${selection.player.name}, or tap an open spot.`
      : `Tap where ${selection.player.name} should go, or tap a player on court to swap them in.`;
  }
  if (selection?.kind === 'group') hint = 'Tap a spot in the line to move this group.';

  return (
    <div className={`sticky ${stickyTop} z-30 mb-4 rounded-lg bg-[#1B2430] text-white shadow-lg`}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-[16rem]">
          <p className="text-lg font-bold leading-tight">Arranging players</p>
          <p className="text-base text-white/80 leading-snug">{hint}</p>
        </div>
        {selection && (
          <>
            {selection.kind === 'player' && (
              <button
                onClick={() => { sitOut(selection.player.id); setSelectedPlayerId(null); }}
                title="Off for a bit. They keep their name and can come right back."
                className="px-4 py-2 rounded-lg border-2 border-[#F5B301] text-[#F5B301] hover:bg-[#F5B301] hover:text-[#1B2430] font-semibold"
              >
                Sit out
              </button>
            )}
            {selection.kind === 'player' && (
              <button
                onClick={() => { removePlayer(selection.player.id); setSelectedPlayerId(null); }}
                className="px-4 py-2 rounded-lg border-2 border-red-400 text-red-200 hover:bg-red-500 hover:text-white font-semibold"
              >
                Remove {selection.player.name}
              </button>
            )}
            <button
              onClick={() => setSelectedPlayerId(null)}
              className="px-4 py-2 rounded-lg border-2 border-white/40 text-white hover:bg-white/10 font-semibold"
            >
              Cancel
            </button>
          </>
        )}
        <button
          onClick={toggleManualMode}
          className="px-6 py-2 rounded-lg bg-[#F5B301] hover:bg-[#E0A300] text-[#1B2430] text-lg font-bold"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default ArrangeBar;
