import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Player, PreviousTeam, WaitingQueueItem, GameState, Regular, PlayerRef, GameRecord, NightSummary } from '../types';
import { useToast } from '../components/ui/Toast'; 
import { planChallengers } from '../utils/formChallengers';

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
  handleGameEnd: (winner: 'champions' | 'challengers') => void;
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
  pendingResume: { savedAt: number; players: number } | null;
  resumeSession: () => void;
  discardSavedSession: () => void;
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
  finishNight: () => NightSummary | null;
  archive: NightSummary[];
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
  games: []
};

// PENDING_QUEUE_UPDATE and FORMING_CHALLENGERS only exist for a moment while a result is processed.
const isStable = (status: GameState['status']) =>
  status !== 'PENDING_QUEUE_UPDATE' && status !== 'FORMING_CHALLENGERS';

const countPlayers = (s: GameState) =>
  s.champions.length + s.challengers.length +
  s.waitingQueue.reduce((n, item) => n + (isPreviousTeam(item) ? item.players.length : 1), 0);

// Who is where. Undo records a step whenever this changes (not on clock ticks or mode switches).
// The game count is part of it, so a result is always a step even when nobody moves
// (with exactly 10 players, a Champions win puts the same two teams right back on).
const rosterSignature = (s: GameState) => JSON.stringify([
  s.games.length,
  s.champions.map(p => p.id),
  s.challengers.map(p => p.id),
  s.waitingQueue.map(item => (isPreviousTeam(item) ? [item.id, item.players.map(p => p.id)] : item.id)),
]);

const SAVE_VERSION = 1;

type UndoStep = { state: GameState; label: string };
const SAVED_UNDO_STEPS = 15; // Undo steps kept with the saved night, so Undo still works after a refresh

const readSavedSession = (key: string): { savedAt: number; state: GameState; history: UndoStep[] } | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION || !data.state) return null;
    const state: GameState = { ...defaultGameState, ...data.state };
    if (countPlayers(state) === 0 || !isStable(state.status)) return null;
    const history: UndoStep[] = Array.isArray(data.history)
      ? data.history
          .filter((h: UndoStep) => h && h.state && typeof h.label === 'string')
          .map((h: UndoStep) => ({ label: h.label, state: { ...defaultGameState, ...h.state } }))
      : [];
    return { savedAt: Number(data.savedAt) || Date.now(), state, history };
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
      const entry = { state: lastStableRef.current, label: pendingLabelRef.current || 'Last change' };
      historyRef.current = [...historyRef.current.slice(-29), entry];
      setHistory(historyRef.current);
      pendingLabelRef.current = null;
    }
    lastStableRef.current = gameState;
    lastSignatureRef.current = sig;
  }, [gameState]);

  // ---- Save the night (real session only) ----
  const [savedSession, setSavedSession] = useState<{ savedAt: number; state: GameState; history: UndoStep[] } | null>(
    () => (persistKey ? readSavedSession(persistKey) : null)
  );

  useEffect(() => {
    // Never save while a saved night is waiting for Resume or Start fresh, or mid-result.
    if (!persistKey || savedSession || !isStable(gameState.status)) return;
    let ok = true;
    try {
      if (countPlayers(gameState) === 0) {
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

  // Add Player
  const addPlayer = useCallback((name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showNotification("Name cannot be empty.", 'error');
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
    const night = gameState.sessionStartedAt ?? Date.now();
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
      updatedState.sessionStartedAt = prev.sessionStartedAt ?? night;
      updatedState.playersTonight = prev.playersTonight.some(n => n.toLowerCase() === trimmedName.toLowerCase())
        ? prev.playersTonight
        : [...prev.playersTonight, playerName];

      // If we're in INITIAL state and teams aren't full, add directly to teams
      if (prev.status === 'INITIAL' || prev.status === 'WAITING_FOR_PLAYERS') {
        if (prev.champions.length < 5) {
          updatedState.champions = [...prev.champions, newPlayer];
        } else if (prev.challengers.length < 5) {
          updatedState.challengers = [...prev.challengers, newPlayer];
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

      return updatedState;
    });
  }, [gameState, regulars, showNotification, runGameTimer]);

  const forgetRegular = useCallback((id: string) => {
    setRegulars(list => list.filter(r => r.id !== id));
  }, []);

  // Remove player from any location (teams or queue)
  const removePlayer = useCallback((idOrName: string) => {
    console.log("[removePlayer] Attempting to remove player:", idOrName);

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
      const shouldEnableManualMode = totalPlayers > 10;

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
        return {
          ...prev,
          waitingQueue: newQueue
        };
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

      return newState;
    });
  }, []);

  // Step 1: Process Game End (Initial setup)
  const processGameEnd = (winningTeam: Player[], losingTeam: Player[], winnerSide: 'champions' | 'challengers', startedAt: number | null) => {
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
          n: prev.games.length + 1,
          startedAt,
          endedAt: Date.now(),
          winner: winnerSide,
          winners: winningTeam.map(ref),
          losers: losingTeam.map(ref),
        } as GameRecord],
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
        waitingQueue: [team, ...plan.rest], // Keep current team and remaining queue
        shootoutTeam: team,
        requiredPlayers: spots,
        showShootoutModal: true,
        status: 'SHOOTOUT',
        selectedShootoutPlayers: [], // Reset selected players
      }));
      return;
    }

    // If we got here, we have enough players for both teams
    setGameState(prev => ({
      ...prev,
      challengers: plan.picked,
      waitingQueue: plan.rest,
      status: 'READY',
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
  const handleGameEnd = (winner: 'champions' | 'challengers') => {
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
        processGameEnd(winningTeam, losingTeam, winner, startedAt);
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

    processGameEnd(winningTeam, losingTeam, winner, startedAt); // Start the multi-step process
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
    const steps = historyRef.current;
    if (steps.length === 0) return;
    const entry = steps[steps.length - 1];
    historyRef.current = steps.slice(0, -1);
    setHistory(historyRef.current);
    restoringRef.current = true;
    stopGameTimer();
    setInfoModalState({ isOpen: false, message: '' });
    setSelectedPlayerId(null);
    setGameState(entry.state);
    if (entry.state.gameStartTime) resumeGameTimer();
  }, [stopGameTimer, resumeGameTimer]);

  const resumeSession = useCallback(() => {
    if (!savedSession) return;
    restoringRef.current = true;
    historyRef.current = savedSession.history;
    setHistory(savedSession.history);
    setGameState(savedSession.state);
    setSavedSession(null);
    if (savedSession.state.gameStartTime) resumeGameTimer();
  }, [savedSession, resumeGameTimer]);

  const discardSavedSession = useCallback(() => {
    if (persistKey) {
      try { window.localStorage.removeItem(persistKey); } catch { /* ignore */ }
    }
    setSavedSession(null);
  }, [persistKey]);

  // Finish night: keep a summary of tonight on this device, then clear the courts for next time.
  const finishNight = useCallback((): NightSummary | null => {
    const s = gameState;
    if (!isStable(s.status) || (s.games.length === 0 && countPlayers(s) === 0)) return null;
    const summary: NightSummary = {
      id: uuidv4(),
      startedAt: s.sessionStartedAt,
      endedAt: Date.now(),
      gamesPlayed: s.gamesPlayed,
      playersTonight: s.playersTonight,
      bestStreak: s.bestStreak,
      games: s.games,
    };
    if (archiveKey) {
      const next = [summary, ...archive].slice(0, ARCHIVE_LIMIT);
      setArchive(next);
      if (!writeList(archiveKey, next)) setSaveStatus('failed');
    }
    stopGameTimer();
    restoringRef.current = true;
    historyRef.current = [];
    setHistory([]);
    setSelectedPlayerId(null);
    setLastAdded(null);
    setGameState({ ...defaultGameState });
    return summary;
  }, [gameState, archive, archiveKey, stopGameTimer]);

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
    pendingResume: savedSession ? { savedAt: savedSession.savedAt, players: countPlayers(savedSession.state) } : null,
    resumeSession,
    discardSavedSession,
    movePlayerIntoGroup,
    selectedPlayerId,
    setSelectedPlayerId,
    regulars,
    forgetRegular,
    lastAdded,
    saveStatus,
    otherTabOpen: otherTabs.length > 0,
    finishNight,
    archive,
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
