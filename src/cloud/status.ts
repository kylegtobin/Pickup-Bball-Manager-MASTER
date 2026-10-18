import type { CloudController } from './useCloud';

const ago = (t: number, now: number) => {
  const s = Math.max(0, Math.round((now - t) / 1000));
  return s < 5 ? 'just now' : s < 60 ? `${s} sec ago` : `${Math.round(s / 60)} min ago`;
};

// Status in a few words, also used on the main screen next to "Saved"
export const syncText = (c: CloudController, now = Date.now()): { text: string; tone: 'ok' | 'warn' | 'bad' | 'muted' } | null => {
  if (!c.on) return null;
  if (!c.session || !c.run) return { text: 'Phone view: not set up', tone: 'muted' };
  if (c.paused) return { text: 'Phone view paused', tone: 'muted' };
  const s = c.sync;
  if (!s || s.status === 'starting') return { text: 'Phone view: connecting…', tone: 'muted' };
  if (s.status === 'taken') return { text: 'Phone view: another screen has this run', tone: 'bad' };
  if (s.status === 'offline') return { text: 'Phone view: offline, will catch up', tone: 'warn' };
  if (s.status === 'live') return { text: s.lastSyncedAt ? `Phones up to date · ${ago(s.lastSyncedAt, now)}` : 'Phone view live', tone: 'ok' };
  return null;
};

