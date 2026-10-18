import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Player, PreviousTeam, WaitingQueueItem, GameState, Regular, PlayerRef, GameRecord, NightSummary, SittingOut } from '../types';
import { useToast } from '../components/ui/Toast'; 
import { planChallengers } from '../utils/formChallengers';
import { Side, EndedBy, newScore, newClock, timeLeft, decide } from '../utils/score';
import { downloadBackup } from '../utils/recapImage';

// Helper function to check if an item is a PreviousTeam
export const isPreviousTeam = (item: WaitingQueueItem): item is PreviousTeam => {
  return typeof item === 'object' && item !== null && 'type' in item && item.type === 'PreviousTeam';
};

// Helper function to check for duplicate player IDs across all teams and queue
const checkForDuplicatePlayers = (state: GameState): { hasDuplicates: boolean, duplicateIds: string[] } => {
  const allPlayers: Player[] = [];
  const playerIds = new Set<string>();
  const duplicateIds: string[] = [];
  
  // Add champions
  state.champions.forEach(player => {
    if (playerIds.has(player.id)) {
      duplicateIds.push(player.id);
    } else {
      playerIds.add(player.id);
    }
    allPlayers.push(player);
  });
  
  // Add challengers
  state.challengers.forEach(player => {
    if (playerIds.has(player.id)) {
      duplicateIds.push(player.id);
    } else {
      playerIds.add(player.id);
    }
    allPlayers.push(player);
  });
  
  // Add waiting queue
  state.waitingQueue.forEach(item => {
    if (!isPreviousTeam(item)) {
      // Individual player
      if (playerIds.has(item.id)) {
        duplicateIds.push(item.id);
      } else {
        playerIds.add(item.id);
      }
      allPlayers.push(item);
    } else {
      // Team of players
      item.players.forEach(player => {
        if (playerIds.has(player.id)) {
          duplicateIds.push(player.id);
        } else {
          playerIds.add(player.id);
        }
        allPlayers.push(player);
      });
    }
  });
  
  return { 
    hasDuplicates: duplicateIds.length > 0,
    duplicateIds
  };
};

// Helper function to create a deep clone of a player with a new ID
const clonePlayerWithNewId = (player: Player): Player => {
  return {
    ...player,
    id: uuidv4() // Generate a new ID to ensure uniqueness
  };
};

// Define the shape of the context value
export interface GameContextProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  addPlayer: (name: string) => void;
  removePlayer: (idOrName: string) => void;
  removePlayerByName: (playerName: string) => void;
  movePlayer: (playerId: string, targetIndex: number) => void;
  moveTeam: (teamId: string, targetIndex: number) => void;
  addPlayerToTeam: (playerId: string, targetTeam: 'champions' | 'challengers') => void;
  handleGameEnd: (winner: 'champions' | 'challengers', endedBy?: EndedBy) => void;
  // Scoreboard
  addPoints: (side: Side, points: number, correction?: boolean) => void;
  startClock: () => void;
  pauseClock: () => void;
  adjustClock: (deltaMs: number) => void;
  confirmShootout: (selectedPlayers: Player[]) => void;
  toggleManualMode: () => void;
  dismissShootoutModal: () => void;
  dismissInfoModal: () => void;
  infoModalState: {
    isOpen: boolean;
    message: string;
  };
  errorMessage: string | null;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  startGameTimer: () => void;
  stopGameTimer: () => void;
  // Undo: steps back one change at a time (results, sign-ins, removals, moves)
  undo: () => void;
  canUndo: boolean;
  undoLabel: string | null;
  // Save the night: a saved session found on this device, waiting for Resume or Start fresh
  pendingResume: { savedAt: number; players: number; games: number } | null;
  resumeSession: () => void;
  discardSavedSession: () => boolean;
  downloadSavedBackup: () => void;
  // Manual mode
  movePlayerIntoGroup: (playerId: string, groupId: string) => void;
  selectedPlayerId: string | null;
  setSelectedPlayerId: (id: string | null) => void;
  // Saved regulars on this device, for tap-to-sign-in
  regulars: Regular[];
  forgetRegular: (id: string) => void;
  lastAdded: { id: string; name: string; at: number } | null;
  // Saving: 'off' for the sample, 'failed' if this browser won't store the night
  saveStatus: 'saved' | 'failed' | 'off';
  otherTabOpen: boolean;
  // Finish night: archive tonight on this device and clear the courts
  finishNight: () => { ok: true; summary: NightSummary } | { ok: false; reason: 'nothing' | 'busy' | 'storage' };
  archive: NightSummary[];
  // Backups: add a night to Past nights, or pick a night back up when nothing is in progress
  restoreNight: (night: NightSummary) => boolean;
  resumeFromBackup: (state: GameState) => boolean;
  // Manual mode extras
  swapPlayers: (aId: string, bId: string) => void;
  sitOut: (playerId: string) => void;
  bringBack: (playerId: string) => void;
  sitterLeft: (playerId: string) => void;
}

const defaultGameState: GameState = {
  champions: [],
  challengers: [],
  waitingQueue: [],
  manualMode: false,
  showShootoutModal: false,
  shootoutTeam: null,
  requiredPlayers: 0,
  pendingIndividuals: [],
  status: 'INITIAL', 
  tempChampions: [],
  tempLosersToAdd: null,
  tempQueueBeforeLosers: [],
  notification: null,
  selectedShootoutPlayers: [],
  replacementTracking: {
    replacements: []
  },
  gameStartTime: null,
  elapsedMinutes: 0,
  championStreak: 0,
  gamesPlayed: 0,
  bestStreak: null,
  sessionStartedAt: null,
  lastResultAt: null,
  playersTonight: [],
  games: [],
  nightId: null,
  sittingOut: [],
  score: newScore(),
  clock: newClock()
};

// PENDING_QUEUE_UPDATE and FORMING_CHALLENGERS only exist for a moment while a result is processed.
const isStable = (status: GameState['status']) =>
  status !== 'PENDING_QUEUE_UPDATE' && status !== 'FORMING_CHALLENGERS';

const countPlayers = (s: GameState) =>
  s.champions.length + s.challengers.length +
  s.waitingQueue.reduce((n, item) => n + (isPreviousTeam(item) ? item.players.length : 1), 0);

// A night worth keeping: anyone signed in, or any game played, even if everyone has gone home
const hasNight = (s: GameState) => countPlayers(s) > 0 || s.games.length > 0 || s.playersTonight.length > 0;

// Who is where. Undo records a step whenever this changes (not on clock ticks or mode switches).
// The game count is part of it, so a result is always a step even when nobody moves
// (with exactly 10 players, a Champions win puts the same two teams right back on).
const rosterSignature = (s: GameState) => JSON.stringify([
  s.games.length,
  s.score.champions,
  s.score.challengers,
  s.champions.map(p => p.id),
  s.challengers.map(p => p.id),
  s.waitingQueue.map(item => (isPreviousTeam(item) ? [item.id, item.players.map(p => (p.away ? `~${p.id}` : p.id))] : item.away ? `~${item.id}` : item.id)),
  (s.sittingOut ?? []).map(e => e.player.id),
]);

const SAVE_VERSION = 1;

type UndoStep = { state: GameState; label: string; at?: number };
const UNDO_STEPS = 60; // Scoring adds a step per basket, so keep plenty
const SAVED_UNDO_STEPS = 20; // Undo steps kept with the saved night, so Undo still works after a refresh

const heartbeatKey = (key: string) => `${key}-clock-seen`;

// Someone in line who could step onto the court right now (not sitting out)
const hasAvailableWaiter = (s: GameState) =>
  s.waitingQueue.some(item => (isPreviousTeam(item) ? item.players.some(p => !p.away) : !item.away));

// After anyone sits out, comes back, leaves or signs in: if a team is short, either the runner moves
// someone up from the line (when someone's available) or new sign-ins fill it (when nobody is).
// Nobody who signs in can jump ahead of people already waiting.
// Worked out from the lineup itself every time, never from an older status, so moves, Undo and
// older saves all end up following the same rule.
const reconcileVacancy = (s: GameState): GameState => {
  const settable = s.status === 'INITIAL' || s.status === 'WAITING_FOR_PLAYERS' || s.status === 'WAITING_FOR_MANUAL_REPLACEMENT' || s.status === 'READY';
  if (!settable) return s;
  const full = s.champions.length === 5 && s.challengers.length === 5;
  if (full) {
    // Both teams are complete again: the game is on (manual mode stays as the runner left it)
    return s.status === 'READY' ? s : { ...s, status: 'READY' };
  }
  // Someone available to move up: arranging controls on, so the runner can place them (also after a restore)
  if (hasAvailableWaiter(s)) return s.status === 'WAITING_FOR_MANUAL_REPLACEMENT' && s.manualMode ? s : { ...s, status: 'WAITING_FOR_MANUAL_REPLACEMENT', manualMode: true };
  if (s.status === 'WAITING_FOR_MANUAL_REPLACEMENT') return { ...s, status: 'INITIAL', manualMode: false };
  if (s.status === 'READY') return { ...s, status: 'INITIAL' };
  return s;
};

// Sign-ins (or someone coming back) may go straight onto a short team only when nobody available is waiting
const canFillDirectly = (s: GameState) =>
  (s.champions.length < 5 || s.challengers.length < 5) && !hasAvailableWaiter(s) &&
  (s.status === 'INITIAL' || s.status === 'WAITING_FOR_PLAYERS' || s.status === 'WAITING_FOR_MANUAL_REPLACEMENT' || s.status === 'READY');

// Saves from before Oct 18 kept people who sat out in line in a separate list, and court spots without
// a record of whether they were filled. Line sitters go back into the line (at the end, still sitting
// out); court spots whose history isn't known can't be claimed back.
const migrateSitters = (s: GameState): GameState => {
  const list = s.sittingOut ?? [];
  if (!list.some(e => e.from === 'line' || e.spotFilled === undefined)) return { ...s, sittingOut: list };
  const toLine = list.filter(e => e.from === 'line').map(e => ({ ...e.player, away: e.player.away ?? e.at }));
  const court = list.filter(e => e.from !== 'line').map(e => (e.spotFilled === undefined ? { ...e, spotFilled: true } : e));
  return { ...s, sittingOut: court, waitingQueue: [...s.waitingQueue, ...toLine] };
};

const readSavedSession = (key: string): { savedAt: number; lastSeen: number; state: GameState; history: UndoStep[] } | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION || !data.state) return null;
    const state: GameState = migrateSitters({ ...defaultGameState, ...data.state });
    if (!hasNight(state) || !isStable(state.status)) return null;
    const history: UndoStep[] = Array.isArray(data.history)
      ? data.history
          .filter((h: UndoStep) => h && h.state && typeof h.label === 'string')
          .map((h: UndoStep) => ({ label: h.label, at: h.at, state: migrateSitters({ ...defaultGameState, ...h.state }) }))
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

const readList = <T,>(key: string): T[] => {
  try {
    const data = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

const writeList = (key: string, list: unknown[]): boolean => {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

const ref = (p: Player): PlayerRef => ({ id: p.rid ?? p.id, name: p.name });

const summarize = (s: GameState): NightSummary => ({
  id: s.nightId ?? uuidv4(),
  startedAt: s.sessionStartedAt,
  endedAt: Date.now(),
  gamesPlayed: s.gamesPlayed,
  playersTonight: s.playersTonight,
  bestStreak: s.bestStreak,
  games: s.games,
});

// Marks time up on the clock if the 12 minutes have run out (keeps the score at the buzzer)
const withBuzzer = (prev: GameState, now: number) => {
  const c = prev.clock;
  if (c.buzzerScore || timeLeft(c, now) > 0) return c;
  return { ...c, remainingMs: 0, runningSince: null, buzzerScore: { ...prev.score } };
};
// The night with the clock stopped at the time left as of `at`, so a backup never loses or gains time
export const pausedSnapshot = (s: GameState, at = Date.now()): GameState => {
  const c = s.clock;
  return c.runningSince === null ? s : { ...s, clock: { ...c, remainingMs: timeLeft(c, at), runningSince: null } };
};

// A night from outside the app (a backup): anything missing or of the wrong kind falls back to the
// default, so a damaged field can't crash the app later
const withDefaults = (raw: Partial<GameState>): GameState => {
  const out = { ...defaultGameState } as Record<string, unknown>;
  const src = raw as Record<string, unknown>;
  (Object.keys(defaultGameState) as (keyof GameState)[]).forEach(k => {
    const v = src[k];
    const d = defaultGameState[k] as unknown;
    if (v === undefined || v === null) return;
    if (d === null) { out[k] = v; return; } // nullable fields are checked by the backup reader
    if (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d && !Array.isArray(v)) out[k] = v;
  });
  const rt = out.replacementTracking as { replacements?: unknown };
  if (!rt || !Array.isArray(rt.replacements)) out.replacementTracking = { replacements: [] };
  return out as unknown as GameState;
};

const everyoneIn = (s: GameState): Player[] => [
  ...s.champions, ...s.challengers,
  ...s.waitingQueue.flatMap(item => (isPreviousTeam(item) ? item.players : [item])),
  ...(s.sittingOut ?? []).map(e => e.player),
];

// Takes someone out of the line (or their group), wherever they are in it
const removeFromLine = (s: GameState, playerId: string): GameState => ({
  ...s,
  waitingQueue: s.waitingQueue.flatMap((item): WaitingQueueItem[] => {
    if (!isPreviousTeam(item)) return item.id === playerId ? [] : [item];
    const players = item.players.filter(p => p.id !== playerId);
    return players.length === 0 ? [] : [players.length === item.players.length ? item : { ...item, players }];
  }),
});

// Someone new took an open spot on this team: the oldest unfilled spot from this game is no longer
// waiting for the person who sat out from it
export const markSpotFilled = (s: GameState, side: Side): GameState => {
  const list = s.sittingOut ?? [];
  const i = list.findIndex(e => e.from === side && e.gameNo === s.games.length && e.spotFilled === false);
  if (i < 0) return s;
  return { ...s, sittingOut: list.map((e, j) => (j === i ? { ...e, spotFilled: true } : e)) };
};

// Matches people from a backup to the names saved on this device (same id, or else same name)
export const reconcileRegulars = (regulars: Regular[], people: PlayerRef[], nightId: string | null) => {
  const map: Record<string, string> = {};
  const added: Regular[] = [];
  people.forEach(p => {
    if (map[p.id] !== undefined) return;
    const byId = regulars.find(r => r.id === p.id) ?? added.find(r => r.id === p.id);
    if (byId) { map[p.id] = byId.id; return; }
    const byName = regulars.find(r => r.name.toLowerCase() === p.name.toLowerCase()) ?? added.find(r => r.name.toLowerCase() === p.name.toLowerCase());
    if (byName) { map[p.id] = byName.id; return; }
    added.push({ id: p.id, name: p.name, nights: 1, lastNight: nightId });
    map[p.id] = p.id;
  });
  return { map, added };
};

const remapRef = (map: Record<string, string>) => (r: PlayerRef): PlayerRef => ({ ...r, id: map[r.id] ?? r.id });
export const remapNight = (night: NightSummary, map: Record<string, string>): NightSummary => {
  const m = remapRef(map);
  return {
    ...night,
    games: night.games.map(g => ({
      ...g,
      winners: g.winners.map(m),
      losers: g.losers.map(m),
      shootout: g.shootout ? { ...g.shootout, shooters: g.shootout.shooters.map(m), picked: g.shootout.picked.map(m) } : g.shootout,
    })),
  };
};

// Where someone coming back from sitting out belongs:
// - their own spot on court, only during the same game and only if nobody has taken it
// - their waiting group, if it's still in line (so a shootout still applies to them)
// - just ahead of whoever was behind them, if that person is still waiting
// - otherwise the end of the line (their turn came and went while they sat)
export const placeReturning = (s: GameState, e: SittingOut):
  { where: 'court' } | { where: 'group'; groupId: string } | { where: 'before'; beforeId: string } | { where: 'end' } => {
  if (e.from !== 'line') {
    const team = s[e.from];
    const sameGame = e.gameNo === undefined || e.gameNo === s.games.length;
    const untouched = e.spotFilled === undefined
      ? !e.teamIds || team.every(p => e.teamIds!.includes(p.id)) // older saves
      : !e.spotFilled;
    if (sameGame && untouched && team.length < 5) return { where: 'court' };
    return { where: 'end' };
  }
  if (e.groupId) {
    const g = s.waitingQueue.find(item => isPreviousTeam(item) && item.id === e.groupId) as PreviousTeam | undefined;
    if (g && g.players.length < 5 && s.shootoutTeam?.id !== g.id) return { where: 'group', groupId: g.id };
    return { where: 'end' };
  }
  if (e.behindId) {
    if (s.waitingQueue.some(item => item.id === e.behindId)) return { where: 'before', beforeId: e.behindId };
    return { where: 'end' };
  }
  return { where: 'end' };
};

const ARCHIVE_LIMIT = 60; // Most recent finished nights kept on this device

// Create the context
const GameContext = createContext<GameContextProps | undefined>(undefined);

// GameProvider component
// initialState lets a separate provider (sample mode) start from a preset lineup.
// Each provider keeps its own in-memory state, so a sample can never touch a real session.
// persistKey turns on "save the night" for that provider. Only the real session passes it;
// the sample never does, so a sample can never write over a saved night.
// initialRegulars gives the sample a made-up list to tap; only the real session saves its list.
export function GameProvider({ children, initialState, persistKey, initialRegulars }: { children: React.ReactNode; initialState?: Partial<GameState>; persistKey?: string; initialRegulars?: Regular[] }) {
  const [gameState, setGameState] = useState<GameState>(() => ({ ...defaultGameState, ...initialState }));
  const stateRef = useRef(gameState);
  stateRef.current = gameState;
  const regularsKey = persistKey ? `${persistKey}-regulars` : null;
  const archiveKey = persistKey ? `${persistKey}-archive` : null;
  const [regulars, setRegulars] = useState<Regular[]>(() => (regularsKey ? readList<Regular>(regularsKey) : initialRegulars ?? []));
  const [archive, setArchive] = useState<NightSummary[]>(() => (archiveKey ? readList<NightSummary>(archiveKey) : []));
  const [lastAdded, setLastAdded] = useState<{ id: string; name: string; at: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'failed' | 'off'>(persistKey ? 'saved' : 'off');

  // ---- Game clock ----
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Recompute minutes from the start time, so the clock stays right after a refresh or an undo.
  const tickGameTimer = useCallback(() => {
    setGameState(prev => {
      if (!prev.gameStartTime) return prev;
      const minutes = Math.min(12, Math.floor((Date.now() - prev.gameStartTime) / 60000));
      return minutes === prev.elapsedMinutes ? prev : { ...prev, elapsedMinutes: minutes };
    });
  }, []);

  const runGameTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(tickGameTimer, 15000);
  }, [tickGameTimer]);

  const startGameTimer = useCallback(() => {
    setGameState(prev => ({ ...prev, gameStartTime: Date.now(), elapsedMinutes: 0 }));
    runGameTimer();
  }, [runGameTimer]);

  const resumeGameTimer = useCallback(() => {
    tickGameTimer();
    runGameTimer();
  }, [tickGameTimer, runGameTimer]);

  const stopGameTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // ---- Undo ----
  const [history, setHistory] = useState<UndoStep[]>([]);
  const historyRef = useRef<UndoStep[]>([]);
  const lastStableRef = useRef<GameState | null>(null);
  const lastSignatureRef = useRef<string | null>(null);
  const restoringRef = useRef(false);
  const pendingLabelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isStable(gameState.status)) return;
    const sig = rosterSignature(gameState);
    if (restoringRef.current || lastSignatureRef.current === null) {
      restoringRef.current = false;
      pendingLabelRef.current = null;
    } else if (sig !== lastSignatureRef.current && lastStableRef.current) {
      const entry = { state: lastStableRef.current, label: pendingLabelRef.current || 'Last change', at: Date.now() };
      historyRef.current = [...historyRef.current.slice(-(UNDO_STEPS - 1)), entry];
      setHistory(historyRef.current);
      pendingLabelRef.current = null;
    }
    lastStableRef.current = gameState;
    lastSignatureRef.current = sig;
  }, [gameState]);

  // After any change (including moves, Undo and a resumed save), settle what an open spot waits for
  useEffect(() => {
    const fixed = reconcileVacancy(gameState);
    if (fixed !== gameState) setGameState(fixed);
  }, [gameState]);

  // ---- Save the night (real session only) ----
  const [savedSession, setSavedSession] = useState<{ savedAt: number; lastSeen: number; state: GameState; history: UndoStep[] } | null>(
    () => (persistKey ? readSavedSession(persistKey) : null)
  );

  useEffect(() => {
    // Never save while a saved night is waiting for Resume or Start fresh, or mid-result.
    if (!persistKey || savedSession || !isStable(gameState.status)) return;
    let ok = true;
    try {
      if (!hasNight(gameState)) {
        window.localStorage.removeItem(persistKey);
      } else {
        const steps = historyRef.current.slice(-SAVED_UNDO_STEPS);
        try {
          window.localStorage.setItem(persistKey, JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), state: gameState, history: steps }));
        } catch {
          // Too big with the undo steps: save the night itself, which is what matters most.
          window.localStorage.setItem(persistKey, JSON.stringify({ v: SAVE_VERSION, savedAt: Date.now(), state: gameState }));
        }
      }
    } catch {
      // Storage blocked or full: the night still runs, it just won't survive a refresh.
      ok = false;
    }
    setSaveStatus(ok ? 'saved' : 'failed');
  }, [gameState, persistKey, savedSession]);

  // While the game clock runs, note the time now and then and when the page is hidden or closed
  const clockRunning = gameState.clock.runningSince !== null;
  useEffect(() => {
    if (!persistKey || savedSession || !clockRunning) return;
    const beat = () => { try { window.localStorage.setItem(heartbeatKey(persistKey), String(Date.now())); } catch { /* blocked */ } };
    beat();
    const id = setInterval(beat, 3000);
    const onHide = () => { if (document.visibilityState === 'hidden') beat(); };
    window.addEventListener('pagehide', beat);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', beat);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [persistKey, savedSession, clockRunning]);

  // Saved regulars and finished nights stay on this device (real session only)
  useEffect(() => {
    if (!regularsKey) return;
    let existing: string | null = null;
    try { existing = window.localStorage.getItem(regularsKey); } catch { /* blocked */ }
    if (regulars.length === 0 && existing === null) return; // nothing to keep yet, so write nothing
    writeList(regularsKey, regulars);
  }, [regulars, regularsKey]);

  // Two tabs on one device would save over each other, so say so when a second one opens
  const [otherTabs, setOtherTabs] = useState<string[]>([]);
  useEffect(() => {
    if (!persistKey || typeof BroadcastChannel === 'undefined') return;
    const me = uuidv4();
    const channel = new BroadcastChannel(`${persistKey}-tabs`);
    channel.onmessage = (e: MessageEvent) => {
      const { type, id } = e.data || {};
      if (!id || id === me) return;
      if (type === 'bye') { setOtherTabs(list => list.filter(x => x !== id)); return; }
      setOtherTabs(list => (list.includes(id) ? list : [...list, id]));
      if (type === 'hello') channel.postMessage({ type: 'here', id: me });
    };
    channel.postMessage({ type: 'hello', id: me });
    const bye = () => { try { channel.postMessage({ type: 'bye', id: me }); } catch { /* closing */ } };
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      bye();
      channel.close();
    };
  }, [persistKey]);

  // ---- Manual mode: tap a player, then tap where they go ----
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  useEffect(() => {
    if (!gameState.manualMode) setSelectedPlayerId(null);
  }, [gameState.manualMode]);
  const { toast } = useToast();
  const [infoModalState, setInfoModalState] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showNotification = useCallback((message: string, type: 'info' | 'error' = 'info') => {
    toast(message, type);
  }, [toast]);

  const dismissInfoModal = useCallback(() => {
    setInfoModalState({ isOpen: false, message: '' });
  }, []);

  // ---- Swap, sit out, back in ----

  // Trade two players' places: court with court, or court with line. Teams stay at five.
  const swapPlayers = useCallback((aId: string, bId: string) => {
    const s = stateRef.current;
    if (aId === bId || !isStable(s.status) || s.status === 'SHOOTOUT') return;
    const everyone = everyoneIn(s);
    const a = everyone.find(p => p.id === aId);
    const b = everyone.find(p => p.id === bId);
    if (!a || !b || a.away || b.away) return; // someone sitting out can't be swapped onto the court
    pendingLabelRef.current = `Swapped ${a.name} and ${b.name}`;
    setGameState(prev => {
      const swap = (p: Player) => (p.id === aId ? b : p.id === bId ? a : p);
      return {
        ...prev,
        champions: prev.champions.map(swap),
        challengers: prev.challengers.map(swap),
        waitingQueue: prev.waitingQueue.map(item => (isPreviousTeam(item) ? { ...item, players: item.players.map(swap) } : swap(item))),
      };
    });
  }, []);

  // Step off for a bit.
  // - Waiting in line: they stay put, marked away, so they keep their place and their group.
  // - On court: their spot opens for someone from the line, and we remember whether it gets filled.
  const sitOut = useCallback((playerId: string) => {
    const s = stateRef.current;
    if (!isStable(s.status) || s.status === 'SHOOTOUT') return;
    const who = everyoneIn(s).find(p => p.id === playerId);
    if (!who || who.away) return;
    pendingLabelRef.current = `${who.name} sat out`;
    setGameState(prev => {
      const now = Date.now();
      const side: Side | null = prev.champions.some(p => p.id === playerId) ? 'champions'
        : prev.challengers.some(p => p.id === playerId) ? 'challengers' : null;
      if (!side) {
        const mark = (p: Player) => (p.id === playerId ? { ...p, away: now } : p);
        // If they were the last one available to fill an open spot, sign-ins fill it now
        return reconcileVacancy({ ...prev, waitingQueue: prev.waitingQueue.map(item => (isPreviousTeam(item) ? { ...item, players: item.players.map(mark) } : mark(item))) });
      }
      const index = prev[side].findIndex(p => p.id === playerId);
      const team = prev[side].filter(p => p.id !== playerId);
      const entry: SittingOut = { player: prev[side][index], at: now, from: side, index, gameNo: prev.games.length, spotFilled: false };
      const opened: GameState = { ...prev, [side]: team, sittingOut: [...(prev.sittingOut ?? []), entry] };
      // Someone in line can take the spot; with nobody available, new sign-ins fill it
      return hasAvailableWaiter(opened)
        ? { ...opened, manualMode: true, status: 'WAITING_FOR_MANUAL_REPLACEMENT' }
        : { ...opened, manualMode: prev.status === 'WAITING_FOR_MANUAL_REPLACEMENT' ? false : prev.manualMode, status: 'INITIAL' };
    });
  }, []);

  // Back from sitting out.
  // - Waiting in line: just un-marked, right where they were.
  // - From court: their own spot if it's the same game and nobody filled it; otherwise the end of the line.
  const bringBack = useCallback((playerId: string) => {
    const s = stateRef.current;
    if (!isStable(s.status) || s.status === 'SHOOTOUT') return;
    const inLine = everyoneIn(s).find(p => p.id === playerId && p.away);
    const e = (s.sittingOut ?? []).find(x => x.player.id === playerId);
    if (!inLine && !e) return;
    const name = (inLine ?? e!.player).name;
    pendingLabelRef.current = `${name} is back`;
    setLastAdded({ id: playerId, name, at: Date.now() });
    setGameState(prev => {
      const others = removeFromLine(prev, playerId); // whether anyone else is waiting, not counting them
      const filling = canFillDirectly(others);
      const room: Side | null = prev.champions.length < 5 ? 'champions' : prev.challengers.length < 5 ? 'challengers' : null;
      let next: GameState;
      if (prev.waitingQueue.some(item => (isPreviousTeam(item) ? item.players.some(p => p.id === playerId) : item.id === playerId))) {
        const back = (p: Player): Player => { const { away, ...rest } = p; void away; return rest; };
        if (filling && room) {
          // The teams are short (people sat out when it was their turn): straight onto the court
          const me = everyoneIn(prev).find(p => p.id === playerId)!;
          next = removeFromLine(prev, playerId);
          next = markSpotFilled({ ...next, [room]: [...prev[room], back(me)] }, room);
        } else {
          const unmark = (p: Player) => (p.id === playerId ? back(p) : p);
          next = { ...prev, waitingQueue: prev.waitingQueue.map(item => (isPreviousTeam(item) ? { ...item, players: item.players.map(unmark) } : unmark(item))) };
        }
      } else {
        const entry = (prev.sittingOut ?? []).find(x => x.player.id === playerId);
        if (!entry) return prev;
        next = { ...prev, sittingOut: prev.sittingOut.filter(x => x.player.id !== playerId) };
        const p = entry.player;
        const placed = placeReturning(prev, entry);
        if (placed.where === 'court' && entry.from !== 'line') {
          next[entry.from] = [...prev[entry.from].slice(0, entry.index), p, ...prev[entry.from].slice(entry.index)];
        } else if (filling && room) {
          next = markSpotFilled({ ...next, [room]: [...prev[room], p] }, room);
        } else if (placed.where === 'group') {
          next.waitingQueue = prev.waitingQueue.map(item => (isPreviousTeam(item) && item.id === placed.groupId ? { ...item, players: [...item.players, p] } : item));
        } else if (placed.where === 'before') {
          const at = prev.waitingQueue.findIndex(item => item.id === placed.beforeId);
          next.waitingQueue = [...prev.waitingQueue.slice(0, at), p, ...prev.waitingQueue.slice(at)];
        } else {
          next.waitingQueue = [...prev.waitingQueue, p];
        }
      }
      if (next.champions.length === 5 && next.challengers.length === 5) {
        if (prev.status === 'WAITING_FOR_MANUAL_REPLACEMENT') next.status = 'READY';
        if (filling) {
          next.status = 'READY';
          if (!prev.gameStartTime) {
            next.gameStartTime = Date.now();
            next.elapsedMinutes = 0;
            setTimeout(runGameTimer, 0);
          }
        }
      }
      return reconcileVacancy(next);
    });
  }, [runGameTimer]);

  // Sitting out and gone home
  const sitterLeft = useCallback((playerId: string) => {
    const s = stateRef.current;
    const who = everyoneIn(s).find(p => p.id === playerId && p.away) ?? (s.sittingOut ?? []).find(x => x.player.id === playerId)?.player;
    if (!who) return;
    pendingLabelRef.current = `${who.name} left`;
    setGameState(prev => reconcileVacancy({ ...removeFromLine(prev, playerId), sittingOut: (prev.sittingOut ?? []).filter(x => x.player.id !== playerId) }));
  }, []);

  // Add Player
  const addPlayer = useCallback((name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showNotification("Name cannot be empty.", 'error');
      return;
    }

    // Signing in again while sitting out just brings them back
    const sitter = [...everyoneIn(gameState).filter(p => p.away), ...(gameState.sittingOut ?? []).map(e => e.player)]
      .find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
    if (sitter) {
      bringBack(sitter.id);
      return;
    }

    const allPlayers = [
      ...gameState.champions,
      ...gameState.challengers,
      ...gameState.waitingQueue.flatMap(item => isPreviousTeam(item) ? item.players : [item])
    ];
    if (allPlayers.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      throw new Error(`"${trimmedName}" already exists.`);
    }

    // A regular keeps the same id every night, so their games can add up later
    const known = regulars.find(r => r.name.toLowerCase() === trimmedName.toLowerCase());
    const rid = known ? known.id : uuidv4();
    const playerName = known ? known.name : trimmedName;
    const night = gameState.nightId ?? uuidv4();
    setRegulars(list => {
      const existing = list.find(r => r.id === rid);
      if (!existing) return [...list, { id: rid, name: playerName, nights: 1, lastNight: night }];
      if (existing.lastNight === night) return list;
      return list.map(r => (r.id === rid ? { ...r, nights: r.nights + 1, lastNight: night } : r));
    });

    const newPlayer: Player = {
      id: uuidv4(),
      name: playerName,
      rid,
    };
    setLastAdded({ id: newPlayer.id, name: playerName, at: Date.now() });

    pendingLabelRef.current = `Added ${playerName}`;
    setGameState(prev => {
      const updatedState = { ...prev };
      updatedState.sessionStartedAt = prev.sessionStartedAt ?? Date.now();
      updatedState.nightId = prev.nightId ?? night;
      updatedState.playersTonight = prev.playersTonight.some(n => n.toLowerCase() === trimmedName.toLowerCase())
        ? prev.playersTonight
        : [...prev.playersTonight, playerName];

      // If we're in INITIAL state and teams aren't full, add directly to teams,
      // unless someone is already waiting in line (they go first)
      if (canFillDirectly(prev)) {
        if (prev.champions.length < 5) {
          updatedState.champions = [...prev.champions, newPlayer];
          Object.assign(updatedState, markSpotFilled(updatedState, 'champions'));
        } else if (prev.challengers.length < 5) {
          updatedState.challengers = [...prev.challengers, newPlayer];
          Object.assign(updatedState, markSpotFilled(updatedState, 'challengers'));
        } else {
          updatedState.waitingQueue = [...prev.waitingQueue, newPlayer];
        }

        // Check if we can start the game
        if (updatedState.champions.length === 5 && updatedState.challengers.length === 5) {
          console.log("[addPlayer] Both teams filled with 5 players each. Starting game and timer.");
          updatedState.status = 'READY';
          // Set the game start time immediately rather than waiting for the effect
          const now = Date.now();
          updatedState.gameStartTime = now;
          updatedState.elapsedMinutes = 0;
          
          // Start the interval timer in the next tick to avoid potential state conflicts
          setTimeout(runGameTimer, 0);
        }
      } else {
        // In any other state, add to waiting queue
        updatedState.waitingQueue = [...prev.waitingQueue, newPlayer];
      }

      return reconcileVacancy(updatedState);
    });
  }, [gameState, regulars, showNotification, runGameTimer, bringBack]);

  const forgetRegular = useCallback((id: string) => {
    setRegulars(list => list.filter(r => r.id !== id));
  }, []);

  // Remove player from any location (teams or queue)
  const removePlayer = useCallback((idOrName: string) => {
    console.log("[removePlayer] Attempting to remove player:", idOrName);
    if (stateRef.current.status === 'SHOOTOUT') {
      setErrorMessage('Finish the shootout first, then remove players.');
      return;
    }

    let playerFound = false;
    // Match by ID, or by name ignoring capitals (sign-in already ignores them)
    const target = idOrName.trim().toLowerCase();
    const isTarget = (p: Player) => p.id === idOrName || p.name.toLowerCase() === target;
    const everyone = [
      ...gameState.champions,
      ...gameState.challengers,
      ...gameState.waitingQueue.flatMap(item => (isPreviousTeam(item) ? item.players : [item])),
    ];
    const leaving = everyone.find(isTarget);
    pendingLabelRef.current = leaving ? `Removed ${leaving.name}` : null;

    setGameState(prev => {
      // Calculate total players in the system
      const totalPlayers = prev.champions.length + prev.challengers.length + 
        prev.waitingQueue.reduce((acc, item) => {
          if (!isPreviousTeam(item)) {
            return acc + 1;
          } else {
            return acc + item.players.length;
          }
        }, 0);

      console.log("[removePlayer] Total players in system:", totalPlayers);
      // Someone available in line moves up; otherwise new sign-ins fill the spot
      const shouldEnableManualMode = hasAvailableWaiter(prev);

      // Try to find and remove from champions
      const championsIndex = prev.champions.findIndex(p => isTarget(p));
      if (championsIndex !== -1) {
        console.log("[removePlayer] Found and removing", prev.champions[championsIndex].name, "from Champions");
        playerFound = true;
        
        // Only show notification and enable manual mode if there are more than 10 players
        if (shouldEnableManualMode && !prev.manualMode) {
          setInfoModalState({
            isOpen: true,
            message: "A spot opened on Champions. Move someone from the line into it (drag them, or tap them and then tap the open spot), then tap Done."
          });
        }

        return {
          ...prev,
          champions: [
            ...prev.champions.slice(0, championsIndex),
            ...prev.champions.slice(championsIndex + 1)
          ],
          manualMode: shouldEnableManualMode,
          status: shouldEnableManualMode ? 'WAITING_FOR_MANUAL_REPLACEMENT' : 'INITIAL'
        };
      }

      // Try to find and remove from challengers
      const challengersIndex = prev.challengers.findIndex(p => isTarget(p));
      if (challengersIndex !== -1) {
        console.log("[removePlayer] Found and removing", prev.challengers[challengersIndex].name, "from Challengers");
        playerFound = true;
        
        // Only show notification and enable manual mode if there are more than 10 players
        if (shouldEnableManualMode && !prev.manualMode) {
          setInfoModalState({
            isOpen: true,
            message: "A spot opened on Challengers. Move someone from the line into it (drag them, or tap them and then tap the open spot), then tap Done."
          });
        }

        return {
          ...prev,
          challengers: [
            ...prev.challengers.slice(0, challengersIndex),
            ...prev.challengers.slice(challengersIndex + 1)
          ],
          manualMode: shouldEnableManualMode,
          status: shouldEnableManualMode ? 'WAITING_FOR_MANUAL_REPLACEMENT' : 'INITIAL'
        };
      }

      // Try to find and remove from waiting queue
      let foundInQueue = false;
      const newQueue = prev.waitingQueue.reduce<WaitingQueueItem[]>((acc, item) => {
        if (!isPreviousTeam(item)) {
          // Individual player
          if (!isTarget(item)) {
            acc.push(item);
          } else {
            console.log("[removePlayer] Found and removing individual player from queue:", item.name);
            foundInQueue = true;
            playerFound = true;
          }
        } else {
          // Previous team - remove player if found, or keep whole team if not
          const teamWithoutPlayer = {
            ...item,
            players: item.players.filter(p => !isTarget(p))
          };
          
          if (teamWithoutPlayer.players.length !== item.players.length) {
            console.log("[removePlayer] Found and removing player from PreviousTeam ID:", item.id);
            foundInQueue = true;
            playerFound = true;
            if (teamWithoutPlayer.players.length > 0) {
              acc.push(teamWithoutPlayer);
            }
          } else {
            acc.push(item);
          }
        }
        return acc;
      }, []);

      if (foundInQueue) {
        return reconcileVacancy({
          ...prev,
          waitingQueue: newQueue
        });
      }

      // If we've reached this point and playerFound is still false,
      // then the player wasn't found in this current state
      if (!playerFound) {
        // Delay this check to ensure we properly check after state updates
        setTimeout(() => {
          // Double check if the player exists in any team or queue
          const playerExistsInCurrentState = 
            gameState.champions.some(p => isTarget(p)) ||
            gameState.challengers.some(p => isTarget(p)) ||
            gameState.waitingQueue.some(item => 
              !isPreviousTeam(item) 
                ? (isTarget(item))
                : item.players.some(p => isTarget(p))
            );
          
          if (!playerExistsInCurrentState) {
            setErrorMessage(`${idOrName} is not an active player.`);
          }
        }, 0);
      }

      return prev;
    });
  }, [gameState, setInfoModalState]);

  // Remove player by name
  const removePlayerByName = useCallback((playerName: string) => {
    // Check if player exists in any team or queue
    const playerExists = gameState.champions.some(p => p.name === playerName) ||
      gameState.challengers.some(p => p.name === playerName) ||
      gameState.waitingQueue.some(item => 
        !isPreviousTeam(item) ? item.name === playerName :
        item.players.some(p => p.name === playerName)
      );

    if (!playerExists) {
      setErrorMessage(`Player ${playerName} is not currently in the system.`);
      return;
    }

    // If player exists, find their ID and remove them
    const findPlayer = (name: string): string | undefined => {
      const player = [...gameState.champions, ...gameState.challengers].find(p => p.name === name) ||
        gameState.waitingQueue.find(item => !isPreviousTeam(item) && item.name === name) ||
        gameState.waitingQueue
          .filter(isPreviousTeam)
          .flatMap(team => team.players)
          .find(p => p.name === name);
      return player?.id;
    };

    const playerId = findPlayer(playerName);
    if (playerId) {
      removePlayer(playerId);
    }
  }, [gameState, removePlayer]);

  // Move player to a new position in the waiting queue or teams
  const movePlayer = useCallback((playerId: string, targetIndex: number) => {
    pendingLabelRef.current = 'Move';
    console.log(`[movePlayer START] playerId: ${playerId}, targetIndex: ${targetIndex}`); // Log start
    setGameState(prevState => {
      console.log(`[movePlayer setGameState] Initial waitingQueue:`, JSON.stringify(prevState.waitingQueue.map(item => isPreviousTeam(item) ? `Team(${item.players.map(p => p.name).join(',')})` : item.name))); // Log initial queue state

      // First, find and remove the player from their current position
      let playerToMove: Player | null = null;
      let newWaitingQueue = [...prevState.waitingQueue];
      let newChampions = [...prevState.champions];
      let newChallengers = [...prevState.challengers];
      let originalIndex = -1; // Track the original position in the queue

      // Check champions
      const championsIndex = newChampions.findIndex(p => p.id === playerId);
      if (championsIndex !== -1) {
        playerToMove = newChampions[championsIndex];
        newChampions.splice(championsIndex, 1);
      }

      // Check challengers if not found in champions
      if (!playerToMove) {
        const challengersIndex = newChallengers.findIndex(p => p.id === playerId);
        if (challengersIndex !== -1) {
          playerToMove = newChallengers[challengersIndex];
          newChallengers.splice(challengersIndex, 1);
        }
      }

      // If not found in teams, check waiting queue
      if (!playerToMove) {
        let teamRemoved = false; // Flag to track if a team was removed
        for (let i = 0; i < newWaitingQueue.length; i++) {
          const item = newWaitingQueue[i];
          if (isPreviousTeam(item)) {
            const playerIndex = item.players.findIndex(p => p.id === playerId);
            if (playerIndex !== -1) {
              playerToMove = item.players[playerIndex];
              console.log(`[movePlayer] Found player ${playerToMove.name} in Team ID ${item.id} at queue index ${i}`); // Log found in team
              // Remove player from previous team
              const remainingPlayers = item.players.filter(p => p.id !== playerId);

              // If this was the last player, remove the team entirely
              if (remainingPlayers.length === 0) {
                console.log(`[movePlayer] Removing Team ID ${item.id} (last player) at queue index ${i}`); // Log team removal
                newWaitingQueue.splice(i, 1);
                originalIndex = i; // Remember where the team *was*
                teamRemoved = true; // Mark that a team was removed
              } else {
                // Otherwise update the team with remaining players
                newWaitingQueue[i] = {
                  ...item,
                  players: remainingPlayers
                };
                console.log(`[movePlayer] Updated Team ID ${item.id} at queue index ${i}`); // Log team update
              }
              break; // Player found and handled
            }
          } else if (item.id === playerId) {
            // Individual player in the queue - save the player and its position
            playerToMove = item;
            originalIndex = i;
            console.log(`[movePlayer] Removing individual player ${playerToMove.name} at queue index ${i}`); // Log individual removal
            // Remove the player from the waiting queue
            newWaitingQueue.splice(i, 1);
            break;
          }
        }
        // Log queue state *after* potential removal
        console.log(`[movePlayer] Queue after removal (if any):`, JSON.stringify(newWaitingQueue.map(item => isPreviousTeam(item) ? `Team(${item.players.map(p => p.name).join(',')})` : item.name)));
        console.log(`[movePlayer] originalIndex after removal loop: ${originalIndex}, teamRemoved: ${teamRemoved}`); // Log originalIndex
      }

      if (!playerToMove) {
        console.error('[movePlayer] Player not found anywhere.'); // Log not found
        return prevState;
      }

      // Adjust target index if an item was removed from the queue *before* the target
      let adjustedTargetIndex = targetIndex;
      if (originalIndex !== -1 && originalIndex < targetIndex) {
          console.log(`[movePlayer] Adjusting targetIndex: ${targetIndex} -> ${targetIndex - 1} because originalIndex ${originalIndex} < targetIndex ${targetIndex}`); // Log adjustment
          adjustedTargetIndex = targetIndex - 1;
      } else {
          console.log(`[movePlayer] No targetIndex adjustment needed. originalIndex: ${originalIndex}, targetIndex: ${targetIndex}`); // Log no adjustment
      }

      // Insert the player at the *adjusted* target position
      // Ensure targetIndex is within bounds of the potentially modified queue
      const finalTargetIndex = Math.max(0, Math.min(adjustedTargetIndex, newWaitingQueue.length));
      console.log(`[movePlayer] Inserting ${playerToMove.name} at finalTargetIndex: ${finalTargetIndex}`); // Log insertion index
      newWaitingQueue.splice(finalTargetIndex, 0, playerToMove);
      console.log(`[movePlayer] Final waitingQueue:`, JSON.stringify(newWaitingQueue.map(item => isPreviousTeam(item) ? `Team(${item.players.map(p => p.name).join(',')})` : item.name))); // Log final queue

      return {
        ...prevState,
        champions: newChampions,
        challengers: newChallengers,
        waitingQueue: newWaitingQueue
      };
    });
  }, []);

  // Move team to a new position in the waiting queue
  const moveTeam = useCallback((teamId: string, targetIndex: number) => {
    pendingLabelRef.current = 'Move';
    setGameState(prev => {
      const teamIndex = prev.waitingQueue.findIndex(
        item => isPreviousTeam(item) && item.id === teamId
      );

      if (teamIndex === -1) {
        console.error('Team not found for moving');
        return prev;
      }

      const newWaitingQueue = [...prev.waitingQueue];
      const [team] = newWaitingQueue.splice(teamIndex, 1);
      // Drop spots are numbered before the team is lifted out, so moving down lands one spot early otherwise
      const insertAt = teamIndex < targetIndex ? targetIndex - 1 : targetIndex;
      newWaitingQueue.splice(Math.max(0, Math.min(insertAt, newWaitingQueue.length)), 0, team);

      return {
        ...prev,
        waitingQueue: newWaitingQueue
      };
    });
  }, []);

  // Add player to a specific team (champions or challengers)
  const addPlayerToTeam = useCallback((playerId: string, targetTeam: 'champions' | 'challengers') => {
    pendingLabelRef.current = 'Move';
    setGameState(prev => {
      let playerToMove: Player | null = null;
      let sourceTeam: 'champions' | 'challengers' | null = null;
      let sourceIndex: number | null = null;
      let sourceTeamId: string | null = null;

      // First check teams
      if (prev.champions.some(p => p.id === playerId)) {
        sourceTeam = 'champions';
        playerToMove = prev.champions.find(p => p.id === playerId)!;
      } else if (prev.challengers.some(p => p.id === playerId)) {
        sourceTeam = 'challengers';
        playerToMove = prev.challengers.find(p => p.id === playerId)!;
      } else {
        // Check waiting queue
        for (let i = 0; i < prev.waitingQueue.length; i++) {
          const item = prev.waitingQueue[i];
          if (isPreviousTeam(item)) {
            const player = item.players.find(p => p.id === playerId);
            if (player) {
              playerToMove = player;
              sourceIndex = i;
              sourceTeamId = item.id;
              break;
            }
          } else if (item.id === playerId) {
            // Don't modify the array here, just store the reference
            playerToMove = item;
            sourceIndex = i;
            break;
          }
        }
      }

      if (!playerToMove) {
        console.error('Player not found for moving to team:', playerId);
        return prev;
      }
      if (playerToMove.away) return prev; // sitting out: Back first

      // Check team capacity
      const targetTeamPlayers = targetTeam === 'champions' ? prev.champions : prev.challengers;
      if (targetTeamPlayers.length >= 5) {
        console.error(`${targetTeam} team is already full`);
        return prev;
      }

      // Create new state with player removed from source
      let newState = { ...prev };

      // Remove from source location
      if (sourceTeam) {
        if (sourceTeam === 'champions') {
          newState.champions = prev.champions.filter(p => p.id !== playerId);
        } else {
          newState.challengers = prev.challengers.filter(p => p.id !== playerId);
        }
      } else if (sourceIndex !== null) {
        const newWaitingQueue = [...prev.waitingQueue];
        if (sourceTeamId) {
          // Remove from previous team in queue
          const team = newWaitingQueue[sourceIndex] as PreviousTeam;
          const newPlayers = team.players.filter(p => p.id !== playerId);
          if (newPlayers.length > 0) {
            newWaitingQueue[sourceIndex] = { ...team, players: newPlayers };
          } else {
            newWaitingQueue.splice(sourceIndex, 1);
          }
        } else {
          // Remove individual player from queue only after we know they can be added
          newWaitingQueue.splice(sourceIndex, 1);
        }
        newState.waitingQueue = newWaitingQueue;
      }

      // Add to target team
      if (targetTeam === 'champions') {
        newState.champions = [...newState.champions, playerToMove];
      } else {
        newState.challengers = [...newState.challengers, playerToMove];
      }

      // If we were waiting for a manual replacement, check if we can turn off manual mode
      if (prev.status === 'WAITING_FOR_MANUAL_REPLACEMENT') {
        if (prev.champions.length === 5 && prev.challengers.length === 5) {
          newState.manualMode = false;
          newState.status = 'READY';
        }
      }

      // Whoever sat out from this team doesn't get this spot back
      return markSpotFilled(newState, targetTeam);
    });
  }, []);

  // Step 1: Process Game End (Initial setup)
  const processGameEnd = (winningTeam: Player[], losingTeam: Player[], winnerSide: 'champions' | 'challengers', startedAt: number | null, endedBy: EndedBy = 'manual') => {
    console.log("[processGameEnd - Step 1] Start");
    console.log("[processGameEnd - Step 1] Winners:", winningTeam);
    console.log("[processGameEnd - Step 1] Losers:", losingTeam);

    setGameState(prev => {
      // Handle winners - remove their replacement tracking if they were replacements
      const winningIds = new Set(winningTeam.map(p => p.id));
      const updatedReplacements = prev.replacementTracking.replacements.filter(
        r => !winningIds.has(r.playerId)
      );

      // Handle losers - separate into regular and replacement players
      const loserReplacements = prev.replacementTracking.replacements.filter(
        r => losingTeam.some(p => p.id === r.playerId)
      );
      
      const regularLosers = losingTeam.filter(
        p => !loserReplacements.some(r => r.playerId === p.id)
      );

      // Create Previous Team only from regular losers
      const losersToAdd: PreviousTeam | null = regularLosers.length > 0
        ? { type: 'PreviousTeam', id: uuidv4(), players: regularLosers } as PreviousTeam
        : null;

      console.log("[processGameEnd - Step 1] Setting status to PENDING_QUEUE_UPDATE");

      // Win streak belongs to whoever holds Champions. Challengers winning starts a new one.
      const streak = winnerSide === 'champions' ? prev.championStreak + 1 : 1;
      const bestStreak = !prev.bestStreak || streak > prev.bestStreak.count
        ? { count: streak, names: winningTeam.map(p => p.name) }
        : prev.bestStreak;
      
      // Store temporary state for the multi-step process
      return {
        ...prev,
        tempChampions: winningTeam,
        tempLosersToAdd: losersToAdd,
        tempQueueBeforeLosers: prev.waitingQueue, // Store current queue before adding losers
        replacementTracking: {
          replacements: updatedReplacements // Keep only non-winner replacements
        },
        status: 'PENDING_QUEUE_UPDATE',
        championStreak: streak,
        gamesPlayed: prev.gamesPlayed + 1,
        bestStreak,
        lastResultAt: Date.now(),
        games: [...prev.games, {
          id: uuidv4(),
          n: prev.games.length + 1,
          startedAt,
          endedAt: Date.now(),
          winner: winnerSide,
          winners: winningTeam.map(ref),
          losers: losingTeam.map(ref),
          ...(prev.score.champions + prev.score.challengers > 0 ? { final: { ...prev.score } } : {}),
          endedBy,
        } as GameRecord],
        // Fresh scoreboard for the next game, even when the same ten run it back
        score: newScore(),
        clock: newClock(),
        champions: [], // Clear current teams
        challengers: [],
        waitingQueue: [], // Clear queue, will be rebuilt in next step
      };
    });
  };

  // Step 2: Update Queue - Triggered by PENDING_QUEUE_UPDATE status
  useEffect(() => {
    if (gameState.status === 'PENDING_QUEUE_UPDATE' && gameState.tempChampions.length > 0) {
      console.log("[useEffect - Step 2] Updating Waiting Queue");
      console.log("[useEffect - Step 2] Queue before update:", gameState.tempQueueBeforeLosers);
      
      let newQueue = [...gameState.tempQueueBeforeLosers];
      
      // Add losers team if exists
      if (gameState.tempLosersToAdd) {
        console.log("[useEffect - Step 2] Adding Losers Team:", gameState.tempLosersToAdd.players);
        newQueue.push(gameState.tempLosersToAdd);
      }
      
      console.log("[useEffect - Step 2] Queue after update:", newQueue);
      console.log("[useEffect - Step 2] Setting new Champions:", gameState.tempChampions);
      console.log("[useEffect - Step 2] Setting status to FORMING_CHALLENGERS");

      setGameState(prev => ({
        ...prev,
        champions: prev.tempChampions,
        waitingQueue: newQueue,
        status: 'FORMING_CHALLENGERS',
        // Clear temporary state
        tempChampions: [],
        tempLosersToAdd: null,
        tempQueueBeforeLosers: [],
      }));
    }
  }, [gameState.status, gameState.tempChampions, gameState.tempLosersToAdd, gameState.tempQueueBeforeLosers]);

  // Step 3: Form Challengers - Triggered by FORMING_CHALLENGERS status
  useEffect(() => {
    if (gameState.status !== 'FORMING_CHALLENGERS') return;

    console.log("[useEffect - Step 3] Forming Challengers");
    console.log("[useEffect - Step 3] Processing Queue:", gameState.waitingQueue);

    // First, check for any duplicate players and fix them
    const { hasDuplicates, duplicateIds } = checkForDuplicatePlayers(gameState);
    if (hasDuplicates) {
      console.log("[useEffect - Step 3] Fixing duplicate player IDs:", duplicateIds);
      
      // If duplicates are found, regenerate IDs to ensure uniqueness
      setGameState(prev => {
        // Deep clone the waiting queue to fix duplicates
        const newQueue = prev.waitingQueue.map(item => {
          if (!isPreviousTeam(item)) {
            // For individual players, check if they have a duplicate ID
            if (duplicateIds.includes(item.id)) {
              return clonePlayerWithNewId(item);
            }
            return item;
          } else {
            // For teams, check each player
            return {
              ...item,
              players: item.players.map(player => 
                duplicateIds.includes(player.id) ? clonePlayerWithNewId(player) : player
              )
            };
          }
        });
        
        return {
          ...prev,
          waitingQueue: newQueue
        };
      });
      
      // Exit early - the effect will run again after state update
      return;
    }

    // Fill the Challengers from the front of the line (rules live in utils/formChallengers.ts)
    const plan = planChallengers(gameState.waitingQueue);

    if (plan.shootout) {
      const { team, spots } = plan.shootout;
      console.log("[useEffect - Step 3] Shootout required. Need " + spots + " from team of " + team.players.length + ".");
      setGameState(prev => ({
        ...prev,
        challengers: plan.picked, // These are the players we've collected before the shootout
        waitingQueue: [team, ...plan.rest, ...plan.passed], // Shooting group first; anyone whose turn passed while sitting out goes last
        shootoutTeam: team,
        requiredPlayers: spots,
        showShootoutModal: true,
        status: 'SHOOTOUT',
        selectedShootoutPlayers: [], // Reset selected players
      }));
      return;
    }

    // Anyone whose turn came while they were sitting out goes to the end of the line.
    // If sitting out leaves the Challengers short, new sign-ins (or someone coming back) fill them.
    setGameState(prev => ({
      ...prev,
      challengers: plan.picked,
      waitingQueue: [...plan.rest, ...plan.passed],
      status: plan.picked.length === 5 ? 'READY' : 'WAITING_FOR_PLAYERS',
    }));
    // Runs only when the status or line changes; reading the rest of gameState here is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.status, gameState.waitingQueue]);

  // Step 4: Handle Shootout Confirmation
  const confirmShootout = useCallback((selectedPlayers: Player[]) => {
    console.log("[confirmShootout] Confirming shootout with players:", selectedPlayers);
    pendingLabelRef.current = 'Shootout picks';
    
    if (selectedPlayers.length !== gameState.requiredPlayers) {
      setErrorMessage(`You must select exactly ${gameState.requiredPlayers} players.`);
      return;
    }
    
    // Picks must still be in the shooting group (nobody removed or moved since the shootout began)
    const group = stateRef.current.waitingQueue.find(item => isPreviousTeam(item) && item.id === stateRef.current.shootoutTeam?.id) as PreviousTeam | undefined;
    if (!group || !selectedPlayers.every(sp => group.players.some(p => p.id === sp.id))) {
      setErrorMessage('Those picks no longer match the shooting group. Pick again.');
      return;
    }

    setGameState(prev => {
      if (!prev.shootoutTeam) return prev;

      // Get any pending individuals from the queue BEFORE the shootout team
      const queueBeforeShootoutTeam = prev.waitingQueue.slice(0, prev.waitingQueue.findIndex(item => 
        isPreviousTeam(item) && item.id === prev.shootoutTeam?.id));
      const pendingIndividuals = queueBeforeShootoutTeam.filter(item => !isPreviousTeam(item)) as Player[];
      
      const queueAfterShootoutTeam = prev.waitingQueue.slice(prev.waitingQueue.findIndex(item => 
        isPreviousTeam(item) && item.id === prev.shootoutTeam?.id) + 1);

      console.log("[confirmShootout - Step 4] Current Challengers:", prev.challengers);
      console.log("[confirmShootout - Step 4] Pending Individuals:", pendingIndividuals);
      console.log("[confirmShootout - Step 4] Selected Players:", selectedPlayers);
      console.log("[confirmShootout - Step 4] Queue containing items AFTER shootout team:", queueAfterShootoutTeam);

      // Get players who lost the shootout
      const shootoutLosers = prev.shootoutTeam.players.filter(
        player => !selectedPlayers.some(selected => selected.id === player.id)
      );
      console.log("[confirmShootout - Step 4] Shootout Losers:", shootoutLosers);

      // Form final challengers team:
      // Start with existing challengers (players collected before shootout)
      // and add selected players from shootout - making deep copies to prevent reference issues
      const challengers = [
        ...prev.challengers.map(player => ({...player})),
        ...selectedPlayers.map(player => ({...player}))
      ];
      console.log("[confirmShootout - Step 4] Final Challengers Team:", challengers);

      // Create new queue:
      // 1. Add any individual players that were before the shootout team
      // 2. Add shootout losers as a team if more than 1, otherwise as individuals
      // 3. Add any remaining items that were after the shootout team
      let newQueue: WaitingQueueItem[] = [];
      
      // Add individual players that were before the shootout team - with deep copies
      newQueue.push(...pendingIndividuals.map(player => ({...player})));
      
      // Add shootout losers - with deep copies
      if (shootoutLosers.length > 1) {
        // Add as a team
        newQueue.push({
          type: 'PreviousTeam',
          id: uuidv4(),
          players: shootoutLosers.map(player => ({...player}))
        });
      } else {
        // Add as individuals - with deep copies
        newQueue.push(...shootoutLosers.map(player => ({...player})));
      }
      
      // Add remaining items - with deep copies for players
      newQueue = [
        ...newQueue, 
        ...queueAfterShootoutTeam.map(item => {
          if (!isPreviousTeam(item)) {
            return {...item};
          } else {
            return {
              ...item,
              players: item.players.map(player => ({...player}))
            };
          }
        })
      ];

      // Note the shootout on the game that caused it
      const games = prev.games.length === 0 ? prev.games : prev.games.map((g, i) =>
        i === prev.games.length - 1
          ? { ...g, shootout: { spots: selectedPlayers.length, shooters: prev.shootoutTeam!.players.map(ref), picked: selectedPlayers.map(ref) } }
          : g
      );

      // Check for duplicate IDs in the resulting state
      const resultState = {
        ...prev,
        games,
        challengers,
        waitingQueue: newQueue,
      };
      
      const { hasDuplicates, duplicateIds } = checkForDuplicatePlayers(resultState);
      if (hasDuplicates) {
        console.log("[confirmShootout - Step 4] Detected duplicate IDs, fixing:", duplicateIds);
        // Fix the players with duplicate IDs - regenerate their IDs
        const fixedChallengers = challengers.map(player => 
          duplicateIds.includes(player.id) ? clonePlayerWithNewId(player) : player
        );
        
        const fixedQueue = newQueue.map(item => {
          if (!isPreviousTeam(item)) {
            return duplicateIds.includes(item.id) ? clonePlayerWithNewId(item) : item;
          } else {
            return {
              ...item,
              players: item.players.map(player => 
                duplicateIds.includes(player.id) ? clonePlayerWithNewId(player) : player
              )
            };
          }
        });
        
        // Use fixed versions in the return value below
        return {
          ...prev,
          games,
          challengers: fixedChallengers,
          waitingQueue: fixedQueue,
          status: 'READY',
          showShootoutModal: false,
          shootoutTeam: null,
          requiredPlayers: 0,
          selectedShootoutPlayers: []
        };
      }

      console.log("[confirmShootout - Step 4] Final Waiting Queue:", newQueue);
      console.log("[confirmShootout - Step 4] Setting status to READY");
      
      return {
        ...prev,
        games,
        challengers,
        waitingQueue: newQueue,
        status: 'READY',
        showShootoutModal: false,
        shootoutTeam: null,
        requiredPlayers: 0,
        selectedShootoutPlayers: []
      };
    });
  }, [gameState.requiredPlayers, setErrorMessage]);

  // Toggle Manual Mode
  const toggleManualMode = useCallback(() => {
    setGameState(prev => {
      const newManualMode = !prev.manualMode;
      
      // If turning off manual mode
      if (!newManualMode) {
        // Check if teams are complete
        if (prev.champions.length === 5 && prev.challengers.length === 5) {
          return {
            ...prev,
            manualMode: false,
            status: 'READY'
          };
        } else {
          // Teams still incomplete, keep manual mode on
          setInfoModalState({
            isOpen: true,
            message: "Both teams must have exactly five players before turning manual mode off."
          });
          return {
            ...prev,
            manualMode: true // Force manual mode to stay on
          };
        }
      }

      return {
        ...prev,
        manualMode: newManualMode
      };
    });
  }, [setInfoModalState]);


  // Handle game end
  const handleGameEnd = (winner: 'champions' | 'challengers', endedBy: EndedBy = 'manual') => {
    // First check if teams are complete
    if (gameState.champions.length !== 5 || gameState.challengers.length !== 5) {
      setErrorMessage("Both teams must have 5 players before starting a new game.");
      console.warn(`[endGame] Attempted to end game with incomplete teams (Champs: ${gameState.champions.length}, Chall: ${gameState.challengers.length}). Aborted.`);
      return;
    }

    // Stop the game timer
    stopGameTimer();
    const startedAt = gameState.gameStartTime;
    const resultLabel = `${winner === 'champions' ? 'Champions' : 'Challengers'} won`;
    pendingLabelRef.current = resultLabel;

    // If we're in WAITING_FOR_MANUAL_REPLACEMENT state but teams are full, 
    // force-reset to READY state before processing the game end
    if (gameState.status === 'WAITING_FOR_MANUAL_REPLACEMENT') {
      console.log('[endGame] Detected full teams while in WAITING_FOR_MANUAL_REPLACEMENT state. Auto-resetting to READY.');
      setGameState(prev => ({
        ...prev,
        status: 'READY',
        manualMode: false,
        gameStartTime: null,
        elapsedMinutes: 0
      }));
      // Small delay to ensure state update is processed
      setTimeout(() => {
        const winningTeam = winner === 'champions' ? gameState.champions : gameState.challengers;
        const losingTeam = winner === 'champions' ? gameState.challengers : gameState.champions;
        pendingLabelRef.current = resultLabel;
        processGameEnd(winningTeam, losingTeam, winner, startedAt, endedBy);
      }, 50);
      return;
    }

    // For other states, maintain the existing checks
    if (gameState.status !== 'READY' && gameState.status !== 'WAITING_FOR_PLAYERS') {
      // Changed from showNotification to setErrorMessage to avoid toast
      setErrorMessage(`Cannot end game. Status is: ${gameState.status}`);
      console.warn(`[endGame] Attempted to end game with status: ${gameState.status}. Aborted.`);
      return;
    }

    console.log(`[endGame] Received command: ${winner} won.`);
    const winningTeam = winner === 'champions' ? gameState.champions : gameState.challengers;
    const losingTeam = winner === 'champions' ? gameState.challengers : gameState.champions;

    // Reset timer state before processing game end
    setGameState(prev => ({
      ...prev,
      gameStartTime: null,
      elapsedMinutes: 0
    }));

    processGameEnd(winningTeam, losingTeam, winner, startedAt, endedBy); // Start the multi-step process
  };

  const dismissShootoutModal = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      showShootoutModal: false
    }));
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Start timer when game status changes to READY
  useEffect(() => {
    if (gameState.status === 'READY' && 
        gameState.champions.length === 5 && 
        gameState.challengers.length === 5 &&
        !gameState.gameStartTime) {
      console.log("[GameTimer] Starting timer for new game");
      startGameTimer();
    }
  }, [gameState.status, gameState.champions.length, gameState.challengers.length, gameState.gameStartTime, startGameTimer]);

  // Move a player into a group that's waiting in line (drag onto the group, or tap)
  const movePlayerIntoGroup = useCallback((playerId: string, groupId: string) => {
    pendingLabelRef.current = 'Move';
    setGameState(prev => {
      const group = prev.waitingQueue.find(item => isPreviousTeam(item) && item.id === groupId) as PreviousTeam | undefined;
      if (!group || group.players.length >= 5 || group.players.some(p => p.id === playerId)) return prev;

      const found: { player: Player | null } = { player: null };
      const without = (list: Player[]) => list.filter(p => {
        if (p.id === playerId) { found.player = p; return false; }
        return true;
      });

      const champions = without(prev.champions);
      const challengers = without(prev.challengers);
      const queue: WaitingQueueItem[] = [];
      prev.waitingQueue.forEach(item => {
        if (isPreviousTeam(item)) {
          if (item.id === groupId) { queue.push(item); return; }
          const players = without(item.players);
          if (players.length > 0) queue.push(players.length === item.players.length ? item : { ...item, players });
        } else if (item.id === playerId) {
          found.player = item;
        } else {
          queue.push(item);
        }
      });
      if (!found.player) return prev;
      const moved = found.player;
      return {
        ...prev,
        champions,
        challengers,
        waitingQueue: queue.map(item =>
          isPreviousTeam(item) && item.id === groupId ? { ...item, players: [...item.players, moved] } : item
        ),
      };
    });
  }, []);

  const undo = useCallback(() => {
    const current = stateRef.current;
    const steps = historyRef.current;
    if (steps.length === 0) return;
    const entry = steps[steps.length - 1];
    historyRef.current = steps.slice(0, -1);
    setHistory(historyRef.current);
    restoringRef.current = true;
    stopGameTimer();
    setInfoModalState({ isOpen: false, message: '' });
    setSelectedPlayerId(null);
    // Undoing a basket keeps the clock as it is now. Undoing a result brings back that game's
    // final score with the clock paused where it was.
    const sameGame = entry.state.games.length === current.games.length;
    const c = entry.state.clock;
    const clock = sameGame
      ? current.clock
      : c.runningSince === null ? c : { ...c, remainingMs: timeLeft(c, entry.at ?? Date.now()), runningSince: null };
    setGameState({ ...entry.state, clock });
    if (entry.state.gameStartTime) resumeGameTimer();
  }, [stopGameTimer, resumeGameTimer]);

  // ---- Scoreboard ----

  const addPoints = useCallback((side: Side, points: number, correction = false) => {
    const s = stateRef.current;
    if (s.champions.length !== 5 || s.challengers.length !== 5 || !isStable(s.status) || s.status === 'SHOOTOUT') return;
    const now = Date.now();
    const clockNow = withBuzzer(s, now);
    // Once a game is decided, only corrections change the score
    if (decide(s.score, clockNow, now).winner && !correction) return;
    const next = Math.max(0, s.score[side] + points);
    if (next === s.score[side]) return;
    const team = side === 'champions' ? 'Champions' : 'Challengers';
    pendingLabelRef.current = `${points > 0 ? '+' : '−'}${Math.abs(points)} ${team}`;
    setGameState(prev => {
      let clock = withBuzzer(prev, now);
      const score = { ...prev.score, [side]: Math.max(0, prev.score[side] + points) };
      // A basket that decides the game stops the clock
      if (decide(score, clock, now).winner && clock.runningSince !== null) {
        clock = { ...clock, remainingMs: timeLeft(clock, now), runningSince: null };
      }
      return { ...prev, score, clock };
    });
  }, []);

  const startClock = useCallback(() => {
    setGameState(prev => {
      const c = prev.clock;
      if (c.runningSince !== null || c.buzzerScore || c.remainingMs <= 0) return prev;
      if (decide(prev.score, c).winner) return prev;
      return { ...prev, clock: { ...c, runningSince: Date.now() } };
    });
  }, []);

  const pauseClock = useCallback(() => {
    setGameState(prev => {
      const c = prev.clock;
      if (c.runningSince === null) return prev;
      const now = Date.now();
      const clock = withBuzzer(prev, now);
      return { ...prev, clock: clock.runningSince === null ? clock : { ...c, remainingMs: timeLeft(c, now), runningSince: null } };
    });
  }, []);

  // Fix the clock while it's stopped (a forgotten start, or left running)
  const adjustClock = useCallback((deltaMs: number) => {
    setGameState(prev => {
      const c = prev.clock;
      if (c.runningSince !== null) return prev;
      const remainingMs = Math.max(0, Math.min(c.lengthMs, c.remainingMs + deltaMs));
      const buzzerScore = remainingMs > 0 ? null : c.buzzerScore ?? { ...prev.score };
      return { ...prev, clock: { ...c, remainingMs, buzzerScore } };
    });
  }, []);

  // Time runs out: stop the clock and keep the score at the buzzer
  useEffect(() => {
    const c = gameState.clock;
    if (c.runningSince === null || c.buzzerScore) return;
    const id = setTimeout(() => {
      setGameState(prev => {
        const cl = prev.clock;
        if (cl.runningSince === null || cl.buzzerScore || timeLeft(cl) > 0) return prev;
        return { ...prev, clock: withBuzzer(prev, Date.now()) };
      });
    }, timeLeft(c) + 50);
    return () => clearTimeout(id);
  }, [gameState.clock]);

  const resumeSession = useCallback(() => {
    if (!savedSession) return;
    restoringRef.current = true;
    historyRef.current = savedSession.history;
    setHistory(savedSession.history);
    const c = savedSession.state.clock;
    const clock = c.runningSince === null ? c : { ...c, remainingMs: timeLeft(c, savedSession.lastSeen), runningSince: null };
    setGameState({ ...savedSession.state, clock });
    setSavedSession(null);
    if (savedSession.state.gameStartTime) resumeGameTimer();
  }, [savedSession, resumeGameTimer]);

  // Adds a night to Past nights on this device. Returns false if it couldn't be stored.
  const archiveNight = useCallback((summary: NightSummary): boolean => {
    if (!archiveKey) return true;
    const next = [summary, ...archive.filter(n => n.id !== summary.id)].slice(0, ARCHIVE_LIMIT);
    if (!writeList(archiveKey, next)) return false;
    setArchive(next);
    return true;
  }, [archive, archiveKey]);

  // Start fresh: a saved night that has results goes to Past nights first, so nothing is lost
  // Returns false (and keeps everything) if a night with results couldn't be put in Past nights first
  const discardSavedSession = useCallback((): boolean => {
    if (savedSession && savedSession.state.games.length > 0 && !archiveNight(summarize(savedSession.state))) {
      setSaveStatus('failed');
      return false;
    }
    if (persistKey) {
      try { window.localStorage.removeItem(persistKey); window.localStorage.removeItem(heartbeatKey(persistKey)); } catch { /* ignore */ }
    }
    setSavedSession(null);
    return true;
  }, [persistKey, savedSession, archiveNight]);

  // A copy of the saved night as a file, for when this browser won't store it anywhere else
  const downloadSavedBackup = useCallback(() => {
    if (!savedSession) return;
    downloadBackup(summarize(savedSession.state), { state: pausedSnapshot(savedSession.state, savedSession.lastSeen) });
  }, [savedSession]);

  // Finish night: keep a summary of tonight on this device, then clear the courts for next time.
  // Nothing is cleared unless the summary was stored first.
  const finishNight = useCallback((): { ok: true; summary: NightSummary } | { ok: false; reason: 'nothing' | 'busy' | 'storage' } => {
    const s = gameState;
    if (!isStable(s.status) || s.status === 'SHOOTOUT') return { ok: false, reason: 'busy' };
    if (!hasNight(s)) return { ok: false, reason: 'nothing' };
    const summary = summarize(s);
    if (!archiveNight(summary)) {
      setSaveStatus('failed');
      return { ok: false, reason: 'storage' };
    }
    stopGameTimer();
    restoringRef.current = true;
    historyRef.current = [];
    setHistory([]);
    setSelectedPlayerId(null);
    setLastAdded(null);
    setGameState({ ...defaultGameState });
    return { ok: true, summary };
  }, [gameState, archiveNight, stopGameTimer]);

  // Add a restored night to Past nights (never touches tonight)
  // A backup from another device uses that device's ids for people. Match them to the names saved
  // here, so someone who signs in again keeps one identity, and save anyone new.
  const adoptPeople = useCallback((people: PlayerRef[], nightId: string | null) => {
    const { map, added } = reconcileRegulars(regulars, people, nightId);
    if (added.length > 0) setRegulars(list => [...list, ...added.filter(a => !list.some(r => r.id === a.id))]);
    return map;
  }, [regulars]);

  const restoreNight = useCallback((night: NightSummary) => {
    const map = adoptPeople(night.games.flatMap(g => [...g.winners, ...g.losers]), night.id);
    return archiveNight(remapNight(night, map));
  }, [archiveNight, adoptPeople]);

  // Pick a backed-up night back up, only when no night is in progress, so it can't overwrite one
  const resumeFromBackup = useCallback((state: GameState): boolean => {
    if (hasNight(stateRef.current) || savedSession) return false;
    const merged = migrateSitters(withDefaults(state));
    if (!isStable(merged.status) || merged.status === 'SHOOTOUT') {
      merged.status = merged.champions.length === 5 && merged.challengers.length === 5 ? 'READY' : 'WAITING_FOR_PLAYERS';
      merged.shootoutTeam = null;
      merged.requiredPlayers = 0;
    }
    merged.notification = null;
    const c = merged.clock;
    merged.clock = c.runningSince === null ? c : { ...c, runningSince: null };
    merged.showShootoutModal = false;
    merged.manualMode = false;
    // Everyone tonight, including people who already went home, keeps one identity on this device
    const map = adoptPeople([...everyoneIn(merged).map(ref), ...merged.games.flatMap(g => [...g.winners, ...g.losers])], merged.nightId);
    const fix = (p: Player): Player => ({ ...p, rid: map[p.rid ?? p.id] ?? p.rid ?? p.id });
    merged.champions = merged.champions.map(fix);
    merged.challengers = merged.challengers.map(fix);
    merged.waitingQueue = merged.waitingQueue.map(item => (isPreviousTeam(item) ? { ...item, players: item.players.map(fix) } : fix(item)));
    merged.sittingOut = (merged.sittingOut ?? []).map(e => ({ ...e, player: fix(e.player) }));
    merged.games = remapNight({ games: merged.games } as NightSummary, map).games;
    restoringRef.current = true;
    historyRef.current = [];
    setHistory([]);
    setGameState(merged);
    return true;
  }, [savedSession, adoptPeople]);

  const value: GameContextProps = {
    gameState,
    setGameState,
    addPlayer,
    removePlayer,
    removePlayerByName,
    movePlayer,
    moveTeam,
    addPlayerToTeam,
    handleGameEnd,
    confirmShootout,
    toggleManualMode,
    dismissShootoutModal,
    dismissInfoModal,
    infoModalState,
    errorMessage,
    setErrorMessage,
    startGameTimer,
    stopGameTimer,
    undo,
    canUndo: history.length > 0,
    undoLabel: history.length > 0 ? history[history.length - 1].label : null,
    pendingResume: savedSession ? { savedAt: savedSession.savedAt, players: countPlayers(savedSession.state), games: savedSession.state.games.length } : null,
    resumeSession,
    discardSavedSession,
    downloadSavedBackup,
    movePlayerIntoGroup,
    selectedPlayerId,
    setSelectedPlayerId,
    regulars,
    forgetRegular,
    lastAdded,
    addPoints,
    startClock,
    pauseClock,
    adjustClock,
    saveStatus,
    otherTabOpen: otherTabs.length > 0,
    finishNight,
    archive,
    restoreNight,
    resumeFromBackup,
    swapPlayers,
    sitOut,
    bringBack,
    sitterLeft,
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
};

// Custom hook to use the game context
export const useGame = (): GameContextProps => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};
