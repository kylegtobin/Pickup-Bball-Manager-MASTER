import React from 'react';
import { findRunByCode, looksLikeCode, normalizeCode, FindResult } from '../cloud/runView';

// Type the 6-character code from the court screen (like BFH34R) to follow that run.
const CodeEntry: React.FC<{
  onFound: (token: string) => void;
  find?: (code: string) => Promise<FindResult>;
  autoFocus?: boolean;
}> = ({ onFound, find = findRunByCode, autoFocus }) => {
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!looksLikeCode(code)) { setError('Codes are 6 letters and numbers, like BFH34R.'); return; }
    setBusy(true); setError(null);
    const r = await find(code);
    setBusy(false);
    if (r.ok) onFound(r.token);
    else setError(r.reason === 'none' ? "No run with that code. Check the court screen and try again." : "Can't reach the court right now. Try again in a moment.");
  };

  return (
    <form onSubmit={submit}>
      <label htmlFor="pbm-run-code" className="block text-sm font-semibold text-gray-600 mb-1.5">Code from the court screen</label>
      <div className="flex gap-2">
        <input
          id="pbm-run-code"
          value={code}
          onChange={e => { setCode(normalizeCode(e.target.value).slice(0, 6)); setError(null); }}
          placeholder="BFH34R"
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          className="flex-1 min-w-0 px-3 py-2.5 text-2xl font-black tracking-[0.3em] uppercase bg-white border border-[#D5DAE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
        />
        <button type="submit" disabled={busy} className="px-5 rounded-lg bg-[#E85A00] text-white text-lg font-bold disabled:opacity-60">
          {busy ? '…' : 'Follow'}
        </button>
      </div>
      <p aria-live="polite" className={`mt-2 text-sm ${error ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>
        {error ?? "It's on the court screen."}
      </p>
    </form>
  );
};

export default CodeEntry;
