// Phone live view and courtside sync. Off unless switched on for this browser, so nothing here
// changes how the app runs at the gym until it's turned on on purpose.

// The project's public address and publishable key. Both are meant to be in the app; the access
// rules in the database decide what anyone can read or write. (Never put a secret key here.)
export const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://kfkgcqwkovqsjgwlzcdy.supabase.co';
export const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || 'sb_publishable_s3jMMtfm1h0agkxi62M1Yg_S8fk4on3';

const SWITCH_KEY = 'pbm-cloud';
const RUN_KEY = 'pbm-cloud-run';
const DEVICE_KEY = 'pbm-device-id';
const PAUSED_KEY = 'pbm-cloud-paused';

const get = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => {
  try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* blocked */ }
};

// Phone view for everyone: the runner's Phone view button and the phone landing page. Off until the
// runner's email sign-in has been tested on the live site; until then ?cloud=1 turns it on per browser.
export const PHONE_VIEW_FOR_EVERYONE = false;

// ?cloud=1 turns it on for this browser, ?cloud=0 turns it off. The setting sticks.
export const readCloudSwitch = (): boolean => {
  try {
    const q = new URLSearchParams(window.location.search).get('cloud');
    if (q === '1') set(SWITCH_KEY, '1');
    if (q === '0') set(SWITCH_KEY, null);
    if (q !== null) {
      // Tidy the address bar (anything else in it, like a sign-in code, stays)
      const u = new URL(window.location.href);
      u.searchParams.delete('cloud');
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    }
  } catch { /* fine */ }
  return PHONE_VIEW_FOR_EVERYONE || get(SWITCH_KEY) === '1';
};

export const setCloudSwitch = (on: boolean) => set(SWITCH_KEY, on ? '1' : null);

// The phone page: ?run=<the run's link code>
export const runViewToken = (): string | null => {
  try {
    const t = new URLSearchParams(window.location.search).get('run');
    return t && /^[A-Za-z0-9_-]{16,64}$/.test(t) ? t : null;
  } catch { return null; }
};

// ?code=BFH34R, for a printed link or a sign at the court
export const runCodeParam = (): string | null => {
  try {
    const c = (new URLSearchParams(window.location.search).get('code') ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^[A-HJ-NP-Z2-9]{6}$/.test(c) ? c : null;
  } catch { return null; }
};

// The run this phone followed last, so it opens straight to it next time
export const lastRunToken = () => get('pbm-phone-last-run');
export const saveLastRunToken = (t: string | null) => set('pbm-phone-last-run', t);
// Someone running the games from a phone asked for the full app
export const runnerOnThisPhone = () => get('pbm-phone-runner') === '1';
export const setRunnerOnThisPhone = (on: boolean) => set('pbm-phone-runner', on ? '1' : null);
// A phone (not a tablet or laptop): small screen and a touch screen
export const isPhone = (): boolean => {
  try { return window.matchMedia('(max-width: 640px)').matches && window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
};

export const savedRunId = () => get(RUN_KEY);
export const saveRunId = (id: string | null) => set(RUN_KEY, id);

// Sharing can be paused on this screen without signing out
export const sharingPaused = () => get(PAUSED_KEY) === '1';
export const setSharingPaused = (on: boolean) => set(PAUSED_KEY, on ? '1' : null);

const randomHex = (n: number) => {
  const bytes = new Uint8Array(n);
  try { crypto.getRandomValues(bytes); } catch { bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); }); }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

// One id per browser
export const deviceId = (): string => {
  let id = get(DEVICE_KEY);
  if (!id || id.length < 8) {
    id = 'd' + randomHex(12);
    set(DEVICE_KEY, id);
  }
  return id;
};

// Which screen is writing: this browser plus this tab. Two tabs in one browser are two screens, so the
// second has to take over on purpose. A reload keeps its tab id (it's the same screen). A duplicated tab
// copies the original's id, so it asks whether that id is already open and takes a new one if so.
const TAB_KEY = 'pbm-tab-id';
let screen: Promise<string> | null = null;

const openElsewhere = (channel: BroadcastChannel, tab: string, waitMs: number) => new Promise<boolean>(resolve => {
  const onMsg = (e: MessageEvent) => { if (e.data && e.data.here === tab) { channel.removeEventListener('message', onMsg); resolve(true); } };
  channel.addEventListener('message', onMsg);
  channel.postMessage({ who: tab });
  setTimeout(() => { channel.removeEventListener('message', onMsg); resolve(false); }, waitMs);
});

export const screenId = (waitMs = 300): Promise<string> => {
  if (screen) return screen;
  screen = (async () => {
    const readTab = () => { try { return window.sessionStorage.getItem(TAB_KEY); } catch { return null; } };
    let tab = readTab();
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel('pbm-screens'); } catch { channel = null; }
    if (!tab || !/^[0-9a-f]{8}$/.test(tab) || !channel || (await openElsewhere(channel, tab, waitMs))) tab = randomHex(4);
    try { window.sessionStorage.setItem(TAB_KEY, tab); } catch { /* fine: a fresh id each load */ }
    const mine = tab;
    // Answer any duplicate asking about this tab's id
    channel?.addEventListener('message', e => { if (e.data && e.data.who === mine) channel?.postMessage({ here: mine }); });
    return `${deviceId()}-${mine}`;
  })();
  return screen;
};

// Tests only
export const resetScreenIdForTests = () => { screen = null; };

export const viewLink = (token: string) => `${window.location.origin}/?run=${token}`;
