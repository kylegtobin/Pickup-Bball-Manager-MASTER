import React from 'react';
import CodeEntry from './CodeEntry';
import { findHomeRun, findRunByCode, FindResult } from '../cloud/runView';
import { lastRunToken, runCodeParam, setRunnerOnThisPhone } from '../cloud/config';

const RunView = React.lazy(() => import('./RunView'));

// What a phone sees when it opens the site without a run link. In order:
// a code in the address bar, then the run this phone followed last, then the site's home run.
// If none of those, it asks for the code. The full runner app is one tap away.
const PhoneHome: React.FC<{ home?: () => Promise<FindResult>; byCode?: (c: string) => Promise<FindResult> }> = ({ home = findHomeRun, byCode = findRunByCode }) => {
  const [token, setToken] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState(false);

  React.useEffect(() => {
    let stop = false;
    (async () => {
      const code = runCodeParam();
      if (code) {
        const r = await byCode(code);
        if (stop) return;
        if (r.ok) { setToken(r.token); return; }
      }
      const last = lastRunToken();
      if (last) { setToken(last); return; }
      const h = await home();
      if (stop) return;
      if (h.ok) setToken(h.token);
      else setAsking(true);
    })();
    return () => { stop = true; };
  }, [home, byCode]);

  const openRunner = () => { setRunnerOnThisPhone(true); window.location.assign(window.location.pathname); };

  if (token) {
    return (
      <React.Suspense fallback={<div className="min-h-screen bg-[#0E1A33]" />}>
        <RunView token={token} onRunGone={() => { setToken(null); setAsking(true); }} />
      </React.Suspense>
    );
  }
  return (
    <div className="min-h-screen bg-[#EDEFF2] text-[#1B2430]">
      <header className="bg-[#0E1A33] text-white px-4 pt-6 pb-5">
        <div className="max-w-xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F5B301]">Pickup Basketball Manager</p>
          <h1 className="text-3xl font-black leading-tight mt-1">Follow the run</h1>
          <p className="text-white/75 mt-1">Who's playing, the score, and where you are in line.</p>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {asking ? (
          <section className="rounded-2xl bg-white border border-[#D5DAE1] p-4">
            <CodeEntry onFound={t => setToken(t)} autoFocus />
          </section>
        ) : (
          <p className="text-gray-600" role="status">Finding the run…</p>
        )}
        <p className="text-center text-sm text-gray-500 pt-2">
          Running the games?{' '}
          <button onClick={openRunner} className="font-bold text-[#1E3A8A] underline">Open the full app</button>
        </p>
      </main>
    </div>
  );
};

export default PhoneHome;
