import React from 'react';
import { useGame, isPreviousTeam } from '../../context/GameContext';
import { describeSpot } from '../../utils/spot';
import { useDialogFocus } from '../../utils/useDialogFocus';

// Courtside sign-in: tap your name, or type a new one. Stays open so the next person can go.
const SignInSheet: React.FC<{ onClose: () => void; isSample?: boolean }> = ({ onClose, isSample }) => {
  const { gameState, regulars, addPlayer, forgetRegular, lastAdded } = useGame();
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [confirm, setConfirm] = React.useState<{ name: string; spot: string | null } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const shownFor = React.useRef<number | null>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef);

  React.useEffect(() => { inputRef.current?.focus(); }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // After a sign-in lands, say where they are
  React.useEffect(() => {
    if (!lastAdded || shownFor.current === null || lastAdded.at < shownFor.current) return;
    setConfirm({ name: lastAdded.name, spot: describeSpot(gameState, lastAdded.id) });
    shownFor.current = null;
  }, [lastAdded, gameState]);

  React.useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(null), 3500);
    return () => clearTimeout(id);
  }, [confirm]);

  const here = new Set(
    [
      ...gameState.champions,
      ...gameState.challengers,
      ...gameState.waitingQueue.flatMap(item => (isPreviousTeam(item) ? item.players : [item])),
    ].map(p => (p.rid ?? p.name).toLowerCase())
  );
  const notHere = regulars
    .filter(r => !here.has(r.id.toLowerCase()) && !here.has(r.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const q = query.trim().toLowerCase();
  const shown = q ? notHere.filter(r => r.name.toLowerCase().includes(q)) : notHere;
  const exact = regulars.find(r => r.name.toLowerCase() === q);
  const typedIsNew = q.length > 0 && !exact;

  const signIn = (name: string) => {
    setError(null);
    try {
      shownFor.current = Date.now();
      addPlayer(name);
      setQuery('');
      inputRef.current?.focus();
    } catch {
      shownFor.current = null;
      setError(`${name} is already signed in. Two of you? Add a letter, like Mike Sm., or use your full name.`);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q) return;
    // Enter picks the saved name (the highlighted first match). It only adds a new person when
    // no saved name matches, so a half-typed name never becomes a second identity.
    if (exact) signIn(exact.name);
    else if (shown.length > 0) signIn(shown[0].name);
    else signIn(query.trim());
  };

  return (
    <div className={`fixed inset-0 z-[55] bg-black/40 flex items-start justify-center px-4 pb-4 overflow-auto ${isSample ? 'pt-20' : 'pt-4'}`} role="dialog" aria-modal="true" aria-label="Sign in">
      <div ref={cardRef} tabIndex={-1} className="w-full max-w-3xl mt-6 bg-white rounded-2xl shadow-2xl overflow-hidden outline-none">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-3xl font-extrabold text-[#1B2430]">Sign in</h2>
          <div className="flex items-center gap-2">
            {regulars.length > 0 && (
              <button
                type="button"
                onClick={() => setEditing(v => !v)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border ${editing ? 'bg-[#1B2430] text-white border-[#1B2430]' : 'bg-white text-gray-700 border-[#D5DAE1] hover:bg-gray-100'}`}
              >
                {editing ? 'Done editing' : 'Edit names'}
              </button>
            )}
            <button type="button" onClick={onClose} className="px-5 py-2 rounded-lg bg-[#1B2430] hover:bg-black text-white font-bold">
              Done
            </button>
          </div>
        </div>

        <form onSubmit={onSubmit} className="px-6">
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setError(null); }}
            placeholder="Find your name, or type a new one"
            aria-label="Find your name, or type a new one"
            className="w-full px-4 py-3 text-xl bg-[#F7F8FA] border border-[#D5DAE1] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
          />
        </form>

        <div aria-live="polite" className="px-6 min-h-[4.5rem] flex items-center">
          {confirm ? (
            <div className="w-full mt-3 rounded-xl bg-[#FFF7DB] border-2 border-[#F5B301] px-4 py-3">
              <span className="text-xl font-extrabold text-[#1B2430]">You're in, {confirm.name}.</span>
              {confirm.spot && <span className="text-xl font-semibold text-[#1B2430]"> {confirm.spot}.</span>}
            </div>
          ) : error ? (
            <p className="mt-3 text-base font-semibold text-red-700">{error}</p>
          ) : (
            <p className="mt-3 text-base text-gray-500">
              {q && shown.length > 0 && !exact ? `Press Enter for ${shown[0].name}, or tap a name.` : regulars.length === 0
                ? 'No saved names yet. Type your first name and last initial, like Mike S. Next time you can just tap it.'
                : 'Tap your name. New here? Type your first name and last initial, like Mike S.'}
            </p>
          )}
        </div>

        <div className="px-6 pb-6 pt-2 max-h-[55vh] overflow-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {shown.map((r, i) => (
              <div key={r.id} className="relative">
                <button
                  type="button"
                  onClick={() => (editing ? undefined : signIn(r.name))}
                  disabled={editing}
                  className={`w-full min-h-[3.5rem] px-3 rounded-xl border text-xl font-bold truncate ${
                    editing ? 'bg-gray-50 border-[#D5DAE1] text-gray-500' : 'bg-white border-[#D5DAE1] text-[#1B2430] hover:border-[#1E3A8A] hover:bg-blue-50 active:bg-blue-100'
                  } ${q && i === 0 && !editing ? 'ring-4 ring-[#F5B301] border-[#F5B301]' : ''}`}
                >
                  {r.name}
                </button>
                {editing && (
                  <button
                    type="button"
                    onClick={() => forgetRegular(r.id)}
                    aria-label={`Forget ${r.name}`}
                    title={`Forget ${r.name} on this device`}
                    className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-600 text-white font-bold shadow hover:bg-red-700"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            {typedIsNew && (
              <button
                type="button"
                onClick={() => signIn(query.trim())}
                className="col-span-2 sm:col-span-3 lg:col-span-4 min-h-[3.5rem] px-4 rounded-xl border-2 border-dashed border-[#1E3A8A] text-[#1E3A8A] text-xl font-bold hover:bg-blue-50 text-left"
              >
                + Add "{query.trim()}" as a new player{shown.length > 0 ? ' (someone new)' : ''}
              </button>
            )}
          </div>
          {regulars.length > 0 && shown.length === 0 && !typedIsNew && (
            <p className="text-base text-gray-500 mt-2">Everyone saved on this device is already signed in.</p>
          )}
          {editing && (
            <p className="text-sm text-gray-500 mt-4">Tap × to forget a name on this device. It doesn't remove anyone who's playing tonight.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SignInSheet;
