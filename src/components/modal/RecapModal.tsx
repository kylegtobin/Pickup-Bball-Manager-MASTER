import React from 'react';
import { useGame } from '../../context/GameContext';
import { NightSummary } from '../../types';
import { nightLeaders, joinNames } from '../../utils/nightStats';
import { drawRecapCard, downloadBlob, downloadBackup, recapFilename } from '../../utils/recapImage';
import { useDialogFocus } from '../../utils/useDialogFocus';

const timeOf = (ts: number | null) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
const dayOf = (ts: number | null) =>
  new Date(ts ?? Date.now()).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-bold transition-colors duration-200';
const btnLight = `${btn} border border-[#D5DAE1] bg-white text-[#1B2430] hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed`;

const saveImage = async (night: NightSummary) => {
  const blob = await drawRecapCard(night);
  if (blob) downloadBlob(blob, recapFilename(night));
};

// Tonight at a glance, worked out from the night itself (nothing is sent anywhere).
// Finish night keeps tonight on this device and clears the courts for next time.
const RecapModal: React.FC<{ onClose: () => void; isSample?: boolean }> = ({ onClose, isSample }) => {
  const { gameState, finishNight, archive } = useGame();
  const { gamesPlayed, bestStreak, championStreak, playersTonight, sessionStartedAt, lastResultAt, champions, games } = gameState;
  const [view, setView] = React.useState<'tonight' | 'confirm' | 'finished'>('tonight');
  const [finished, setFinished] = React.useState<NightSummary | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [finishError, setFinishError] = React.useState<string | null>(null);
  const [allNights, setAllNights] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tonight: NightSummary = {
    id: 'tonight',
    startedAt: sessionStartedAt,
    endedAt: lastResultAt ?? Date.now(),
    gamesPlayed,
    playersTonight,
    bestStreak,
    games,
  };

  // Small preview of the card once a night is finished
  React.useEffect(() => {
    if (!finished) return;
    let url: string | null = null;
    drawRecapCard(finished).then(b => { if (b) { url = URL.createObjectURL(b); setPreview(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [finished]);

  const started = timeOf(sessionStartedAt);
  const last = timeOf(lastResultAt);
  const { mostWins, mostGames } = nightLeaders(games);
  const anythingTonight = gamesPlayed > 0 || playersTonight.length > 0;

  const doFinish = () => {
    const result = finishNight();
    if (result.ok) {
      setFinishError(null);
      setFinished(result.summary);
      setView('finished');
    } else if (result.reason === 'storage') {
      // Nothing was cleared. Offer the backup so tonight is safe somewhere.
      setFinishError("This browser wouldn't save tonight, so nothing was cleared. Download a backup to keep tonight's games, then try again.");
    } else if (result.reason === 'busy') {
      setFinishError('Finish the shootout first, then finish the night.');
    } else {
      setView('tonight');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="recap-title" className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 border-t-[10px] border-[#E85A00] my-auto outline-none">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="recap-title" className="text-2xl font-bold text-[#1B2430]">
              {view === 'finished' ? 'Night saved' : "Tonight's recap"}
            </h2>
            {view !== 'finished' && started && <p className="text-gray-600 mt-1">First sign-in at {started}{last ? `, last result at ${last}` : ''}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg border border-[#D5DAE1] px-4 py-2 font-semibold hover:bg-gray-100">Close</button>
        </div>

        {view === 'finished' && finished && (
          <div className="mt-5">
            <p className="text-lg text-gray-700">
              Tonight is saved on this device: {finished.gamesPlayed} {finished.gamesPlayed === 1 ? 'game' : 'games'}, {finished.playersTonight.length} players. The courts are clear for next time, and saved names stay.
            </p>
            <div className="mt-4 flex gap-5 items-start">
              {preview && <img src={preview} alt="Recap card for tonight" className="w-40 rounded-lg shadow border border-[#D5DAE1]" />}
              <div className="flex flex-col gap-3">
                <button className={`${btn} bg-[#E85A00] hover:bg-[#C94E00] text-white`} onClick={() => saveImage(finished)}>Download recap image</button>
                <button className={btnLight} onClick={() => downloadBackup(finished)}>Download backup</button>
                <p className="text-sm text-gray-500 max-w-xs">Both stay under Past nights in Recap, so you can grab them later.</p>
              </div>
            </div>
          </div>
        )}

        {view !== 'finished' && (
          gamesPlayed === 0 ? (
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
              <dl className="mt-5 space-y-3">
                {bestStreak && (
                  <div>
                    <dt className="font-bold text-[#1B2430]">Longest streak: {bestStreak.count} straight {bestStreak.count === 1 ? 'win' : 'wins'}</dt>
                    <dd className="text-gray-700">{bestStreak.names.join(', ')}</dd>
                  </div>
                )}
                {mostWins && (
                  <div>
                    <dt className="font-bold text-[#1B2430]">Most wins: {mostWins.count}</dt>
                    <dd className="text-gray-700">{joinNames(mostWins.names, 6)}</dd>
                  </div>
                )}
                {mostGames && (
                  <div>
                    <dt className="font-bold text-[#1B2430]">Most games: {mostGames.count}</dt>
                    <dd className="text-gray-700">{joinNames(mostGames.names, 6)}</dd>
                  </div>
                )}
                {championStreak >= 2 && champions.length > 0 && (
                  <div>
                    <dt className="font-bold text-[#1B2430]">On court now: Champions have won {championStreak} straight</dt>
                    <dd className="text-gray-700">{champions.map(p => p.name).join(', ')}</dd>
                  </div>
                )}
              </dl>
            </>
          )
        )}

        {view === 'tonight' && (
          <div className="mt-6 flex flex-wrap gap-3">
            <button className={`${btn} bg-[#1B2430] hover:bg-black text-white disabled:opacity-40 disabled:cursor-not-allowed`} disabled={gamesPlayed === 0} onClick={() => saveImage(tonight)}>
              Download recap image
            </button>
            <button className={btnLight} disabled={!anythingTonight} onClick={() => downloadBackup(tonight, { state: gameState })}>
              Download backup
            </button>
            {!isSample && (
              <button className={`${btn} ml-auto bg-[#E85A00] hover:bg-[#C94E00] text-white disabled:opacity-40 disabled:cursor-not-allowed`} disabled={!anythingTonight} onClick={() => setView('confirm')}>
                Finish night
              </button>
            )}
          </div>
        )}

        {view === 'confirm' && (
          <div className="mt-6 rounded-xl border-2 border-[#E85A00] bg-orange-50 p-4">
            <p className="text-lg font-bold text-[#1B2430]">Finish tonight?</p>
            <p className="text-gray-700 mt-1">This saves tonight's games on this device and clears the courts for next time. Saved names stay. It can't be undone, but the recap and backup stay under Past nights.</p>
            {finishError && <p role="alert" className="mt-3 font-semibold text-red-700">{finishError}</p>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button className={`${btn} bg-[#E85A00] hover:bg-[#C94E00] text-white`} onClick={doFinish}>{finishError ? 'Try again' : 'Yes, finish night'}</button>
              {finishError && <button className={btnLight} onClick={() => downloadBackup(tonight, { state: gameState })}>Download backup</button>}
              <button className={btnLight} onClick={() => { setFinishError(null); setView('tonight'); }}>Keep playing</button>
            </div>
          </div>
        )}

        {!isSample && archive.length > 0 && view !== 'confirm' && (
          <div className="mt-6 border-t border-[#E3E7EC] pt-4">
            <h3 className="font-bold text-[#1B2430] mb-2">Past nights</h3>
            <ul className={`divide-y divide-[#EEF1F4] ${allNights ? 'max-h-72 overflow-auto pr-1' : ''}`}>
              {(allNights ? archive : archive.slice(0, 6)).map(n => (
                <li key={n.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-gray-800">
                    <strong>{dayOf(n.startedAt)}</strong>
                    <span className="text-gray-500"> · {n.gamesPlayed} {n.gamesPlayed === 1 ? 'game' : 'games'} · {n.playersTonight.length} players</span>
                  </span>
                  <span className="flex gap-2 shrink-0">
                    <button className="text-sm font-semibold text-[#1E3A8A] hover:underline disabled:opacity-40" disabled={n.gamesPlayed === 0} onClick={() => saveImage(n)}>Image</button>
                    <button className="text-sm font-semibold text-[#1E3A8A] hover:underline" onClick={() => downloadBackup(n)}>Backup</button>
                  </span>
                </li>
              ))}
            </ul>
            {archive.length > 6 && (
              <button className="mt-2 text-sm font-semibold text-[#1E3A8A] hover:underline" onClick={() => setAllNights(v => !v)}>
                {allNights ? 'Show fewer' : `Show all ${archive.length} nights`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RecapModal;
