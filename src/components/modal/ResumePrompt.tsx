import React from 'react';
import { useGame } from '../../context/GameContext';
import { useDialogFocus } from '../../utils/useDialogFocus';

const formatSavedAt = (savedAt: number): string => {
  const saved = new Date(savedAt);
  const now = new Date();
  const time = saved.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOfDay(now) - startOfDay(saved)) / 86400000);
  if (daysAgo <= 0) return `today at ${time}`;
  if (daysAgo === 1) return `yesterday at ${time}`;
  if (daysAgo < 7) return `${saved.toLocaleDateString([], { weekday: 'long' })} at ${time}`;
  return `on ${saved.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
};

// Shown when the real session finds a night saved on this device (after a refresh, a closed tab or a crash).
const ResumePrompt: React.FC = () => {
  const { pendingResume, resumeSession, discardSavedSession } = useGame();
  const [confirmFresh, setConfirmFresh] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, !!pendingResume);

  if (!pendingResume) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="resume-title" className="relative outline-none bg-white rounded-xl shadow-xl max-w-md w-full p-6 border-t-[10px] border-[#1E3A8A]">
        <h2 id="resume-title" className="text-2xl font-bold text-[#1B2430]">Pick up where you left off?</h2>
        <p className="mt-3 text-lg text-gray-700">
          {pendingResume.players > 0
            ? <>A session with {pendingResume.players} {pendingResume.players === 1 ? 'player' : 'players'} was saved on this device {formatSavedAt(pendingResume.savedAt)}.</>
            : <>Tonight's session ({pendingResume.games} {pendingResume.games === 1 ? 'game' : 'games'}, everyone has left) was saved on this device {formatSavedAt(pendingResume.savedAt)}.</>}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={resumeSession}
            autoFocus
            className="w-full bg-[#1E3A8A] hover:bg-[#172E6E] text-white text-lg font-bold py-3 rounded-lg"
          >
            Resume session
          </button>
          {pendingResume.games > 0 && <p className="text-sm text-gray-500 -mt-1">Start fresh keeps tonight's games under Past nights in Recap.</p>}
          {confirmFresh ? (
            <button
              onClick={discardSavedSession}
              className="w-full bg-red-600 hover:bg-red-700 text-white text-lg font-bold py-3 rounded-lg"
            >
              Tap again to clear it and start fresh
            </button>
          ) : (
            <button
              onClick={() => setConfirmFresh(true)}
              className="w-full bg-white hover:bg-gray-100 text-[#1B2430] border border-[#D5DAE1] text-lg font-semibold py-3 rounded-lg"
            >
              Start fresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumePrompt;
