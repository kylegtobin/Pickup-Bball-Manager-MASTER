// Saving the night in this browser: the saved session, its Undo steps, and saved lists.
import { GameState } from '../types';
import { defaultGameState, hasNight, isStable, clearSitOut } from '../rules/lineup';


export const SAVE_VERSION = 1;

export type UndoStep = { state: GameState; label: string; at?: number };
export const UNDO_STEPS = 60; // Scoring adds a step per basket, so keep plenty
export const SAVED_UNDO_STEPS = 20; // Undo steps kept with the saved night, so Undo still works after a refresh

export const heartbeatKey = (key: string) => `${key}-clock-seen`;

export const readSavedSession = (key: string): { savedAt: number; lastSeen: number; state: GameState; history: UndoStep[] } | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION || !data.state) return null;
    const state: GameState = clearSitOut({ ...defaultGameState, ...data.state });
    if (!hasNight(state) || !isStable(state.status)) return null;
    const history: UndoStep[] = Array.isArray(data.history)
      ? data.history
          .filter((h: UndoStep) => h && h.state && typeof h.label === 'string')
          .map((h: UndoStep) => ({ label: h.label, at: h.at, state: clearSitOut({ ...defaultGameState, ...h.state }) }))
      : [];
    const savedAt = Number(data.savedAt) || Date.now();
    // While the clock runs the app notes the time every few seconds and when the page closes,
    // so a refresh doesn't give time back
    const seen = Number(window.localStorage.getItem(heartbeatKey(key))) || 0;
    return { savedAt, lastSeen: Math.max(savedAt, seen), state, history };
  } catch {
    return null;
  }
};

export const readList = <T,>(key: string): T[] => {
  try {
    const data = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const writeList = (key: string, list: unknown[]): boolean => {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

export const ARCHIVE_LIMIT = 60; // Most recent finished nights kept on this device
