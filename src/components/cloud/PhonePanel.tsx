import React from 'react';
import { CloudController } from '../../cloud/useCloud';
import { viewLink } from '../../cloud/config';
import { useDialogFocus } from '../../utils/useDialogFocus';
import QrCode from './QrCode';
import { syncText } from '../../cloud/status';

const btn = 'px-4 py-2.5 rounded-lg font-bold transition-colors duration-200 disabled:opacity-50';
const input = 'w-full px-3 py-2.5 text-lg bg-white border border-[#D5DAE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]';

const PhonePanel: React.FC<{ cloud: CloudController; onClose: () => void }> = ({ cloud, onClose }) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(cardRef);
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState('Pickup run');
  const [gym, setGym] = React.useState('');
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => { document.removeEventListener('keydown', onKey); clearInterval(id); };
  }, [onClose]);

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const link = cloud.run ? viewLink(cloud.run.viewToken) : '';
  const status = syncText(cloud, now);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is on screen to copy by hand */ }
  };

  let body: React.ReactNode;
  if (!cloud.ready) {
    body = <p className="text-gray-600" role="status">{cloud.error ?? 'Loading…'}</p>;
  } else if (!cloud.session) {
    body = (
      <div className="space-y-4">
        <p className="text-gray-700">Sign in once on this computer. Only the runner signs in; players just scan the QR code.</p>
        <form onSubmit={e => { e.preventDefault(); if (email.trim()) void act(async () => { if (await cloud.sendCode(email.trim())) setSent(true); }); }} className="space-y-2">
          <label className="block font-semibold" htmlFor="pbm-cloud-email">Your email</label>
          <div className="flex gap-2">
            <input id="pbm-cloud-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={input} data-autofocus />
            <button type="submit" disabled={busy || !email.trim()} className={`${btn} bg-[#1B2430] text-white hover:bg-black whitespace-nowrap`}>{sent ? 'Send again' : 'Email me a link'}</button>
          </div>
        </form>
        {sent && (
          <div className="rounded-xl bg-[#EDEFF2] p-3 space-y-1" role="status">
            <p className="font-bold">Check your email on this computer.</p>
            <p className="text-sm text-gray-700">Open the email from Supabase and click <strong>Sign in</strong>. It brings you back here signed in. This computer stays signed in after that.</p>
          </div>
        )}
        {sent && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-[#1E3A8A]">The email has a code instead?</summary>
            <form onSubmit={e => { e.preventDefault(); if (code.trim()) void act(() => cloud.verifyCode(email.trim(), code.trim())); }} className="mt-2 flex gap-2">
              <input id="pbm-cloud-code" aria-label="Code from the email" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} className={`${input} tracking-[0.3em] font-bold`} />
              <button type="submit" disabled={busy || code.length < 6} className={`${btn} bg-[#E85A00] text-white hover:bg-[#C94E00]`}>Sign in</button>
            </form>
          </details>
        )}
      </div>
    );
  } else if (!cloud.run) {
    body = (
      <form onSubmit={e => { e.preventDefault(); if (name.trim()) void act(() => cloud.createRun(name.trim().slice(0, 80), gym.trim().slice(0, 120))); }} className="space-y-3">
        <p className="text-gray-700">Name the run the way players know it. Phones show this at the top.</p>
        <div>
          <label className="block font-semibold mb-1" htmlFor="pbm-run-name">Run name</label>
          <input id="pbm-run-name" value={name} onChange={e => setName(e.target.value)} maxLength={80} className={input} data-autofocus />
        </div>
        <div>
          <label className="block font-semibold mb-1" htmlFor="pbm-run-gym">Where (optional)</label>
          <input id="pbm-run-gym" value={gym} onChange={e => setGym(e.target.value)} maxLength={120} placeholder="Gym or court" className={input} />
        </div>
        <button type="submit" disabled={busy || !name.trim()} className={`${btn} bg-[#E85A00] text-white hover:bg-[#C94E00]`}>Create the run</button>
      </form>
    );
  } else {
    const taken = cloud.sync?.status === 'taken';
    body = (
      <div className="space-y-4">
        {taken && (
          <div role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 p-3">
            <p className="font-bold text-red-800">Another screen is running this night.</p>
            <p className="text-sm text-red-900 mt-0.5">Only one screen can update the phones. Take over if this is the screen you're using now.</p>
            <button onClick={cloud.takeOver} className={`${btn} mt-2 bg-red-700 text-white hover:bg-red-800`}>Take over</button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
          <div className="shrink-0 rounded-xl border border-[#D5DAE1] p-2 bg-white">
            <QrCode text={link} label={`QR code for the ${cloud.run.name} phone page`} />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-sm font-semibold text-gray-500">Run</p>
              <p className="text-xl font-extrabold">{cloud.run.name}</p>
              {cloud.run.gym && <p className="text-gray-600">{cloud.run.gym}</p>}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-500">Phone link</p>
              <p className="font-mono text-sm break-all select-all">{link}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                <button onClick={copy} className={`${btn} bg-[#1B2430] text-white hover:bg-black`}>{copied ? 'Copied' : 'Copy link'}</button>
                <a href={link} target="_blank" rel="noopener noreferrer" className={`${btn} border border-[#D5DAE1] bg-white hover:bg-gray-100`}>Open it</a>
              </div>
            </div>
            {status && (
              <p className={`text-sm font-semibold ${status.tone === 'ok' ? 'text-green-700' : status.tone === 'warn' ? 'text-amber-700' : status.tone === 'bad' ? 'text-red-700' : 'text-gray-600'}`} role="status">{status.text}</p>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-600">Anyone with this link or code sees the line, the score and the stats (names only). Reset the link to cut off old ones.</p>
        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
          {confirmReset ? (
            <>
              <span className="self-center text-sm font-semibold">The old link and code stop working.</span>
              <button onClick={() => void act(async () => { await cloud.resetLink(); setConfirmReset(false); })} disabled={busy} className={`${btn} bg-red-700 text-white hover:bg-red-800`}>Reset link</button>
              <button onClick={() => setConfirmReset(false)} className={`${btn} border border-[#D5DAE1] bg-white hover:bg-gray-100`}>Keep it</button>
            </>
          ) : (
            <>
              <button onClick={() => setConfirmReset(true)} className={`${btn} border border-[#D5DAE1] bg-white hover:bg-gray-100`}>Reset link…</button>
              <button onClick={() => cloud.setPaused(!cloud.paused)} className={`${btn} border border-[#D5DAE1] bg-white hover:bg-gray-100`} aria-pressed={cloud.paused}>
                {cloud.paused ? 'Resume sharing' : 'Pause sharing'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="pbm-phone-title" tabIndex={-1} className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl p-6 text-[#1B2430] outline-none">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 id="pbm-phone-title" className="text-2xl font-extrabold">Phone view</h2>
            <p className="text-gray-600">Players follow the line, the score and the stats on their phones.</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-[#1B2430] text-white px-4 py-2 font-bold hover:bg-black">Done</button>
        </div>
        {cloud.error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 flex items-start gap-3">
            <p className="flex-1 text-red-800 font-semibold text-sm">{cloud.error}</p>
            <button onClick={cloud.clearError} className="text-sm font-bold text-red-800">OK</button>
          </div>
        )}
        {body}
        <div className="mt-6 pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
          <span>{cloud.session?.user.email ? `Signed in as ${cloud.session.user.email}` : 'Nothing is shared until you sign in and create a run.'}</span>
          <span className="flex gap-3">
            {cloud.session && <button onClick={() => void act(cloud.signOut)} className="font-bold text-[#1E3A8A]">Sign out</button>}
            <button onClick={() => { cloud.turnOff(); onClose(); }} className="font-bold text-[#1E3A8A]">Turn off phone view here</button>
          </span>
        </div>
      </div>
    </div>
  );
};

export default PhonePanel;
