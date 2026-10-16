import React from 'react';
import { useGame } from '../../context/GameContext';

const timeOf = (ts: number | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

// Tonight at a glance, worked out from the night itself (nothing is sent anywhere).
const RecapModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { gameState } = useGame();
  const { gamesPlayed, bestStreak, championStreak, playersTonight, sessionStartedAt, lastResultAt, champions } = gameState;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const started = timeOf(sessionStartedAt);
  const last = timeOf(lastResultAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div role="dialog" aria-labelledby="recap-title" className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 border-t-[10px] border-[#E85A00]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="recap-title" className="text-2xl font-bold text-[#1B2430]">Tonight's recap</h2>
            {started && <p className="text-gray-600 mt-1">First sign-in at {started}{last ? `, last result at ${last}` : ''}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg border border-[#D5DAE1] px-4 py-2 font-semibold hover:bg-gray-100">Close</button>
        </div>

        {gamesPlayed === 0 ? (
          <p className="mt-6 text-lg text-gray-700">No games finished yet tonight. Results show up here as they're entered.</p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-[#EDEFF2] p-4">
                <div className="text-4xl font-extrabold text-[#1B2430]">{gamesPlayed}</div>
                <div className="text-gray-600 font-semibold">{gamesPlayed === 1 ? 'game played' : 'games played'}</div>
              </div>
              <div className="rounded-lg bg-[#EDEFF2] p-4">
                <div className="text-4xl font-extrabold text-[#1B2430]">{playersTonight.length}</div>
                <div className="text-gray-600 font-semibold">players signed in</div>
              </div>
              <div className="rounded-lg bg-[#EDEFF2] p-4">
                <div className="text-4xl font-extrabold text-[#E85A00]">{bestStreak?.count ?? 0}</div>
                <div className="text-gray-600 font-semibold">longest win streak</div>
              </div>
            </div>
            {bestStreak && (
              <div className="mt-5">
                <h3 className="font-bold text-[#1B2430]">Longest streak: {bestStreak.count} straight {bestStreak.count === 1 ? 'win' : 'wins'}</h3>
                <p className="text-gray-700 mt-1">{bestStreak.names.join(', ')}</p>
              </div>
            )}
            {championStreak >= 2 && champions.length > 0 && (
              <div className="mt-4">
                <h3 className="font-bold text-[#1B2430]">On court now: Champions have won {championStreak} straight</h3>
                <p className="text-gray-700 mt-1">{champions.map(p => p.name).join(', ')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RecapModal;
