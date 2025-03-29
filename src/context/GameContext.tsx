import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Player, PreviousTeam, WaitingQueueItem, GameState } from '../types'; 
import { useToast } from '../components/ui/Toast'; 

// Helper function to check if an item is a PreviousTeam
export const isPreviousTeam = (item: WaitingQueueItem): item is PreviousTeam => {
  return typeof item === 'object' && item !== null && 'type' in item && item.type === 'PreviousTeam';
};

// Define the shape of the context value
export interface GameContextProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  addPlayer: (name: string) => void;
  removePlayer: (idOrName: string) => void;
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
  }
};

// Create the context
const GameContext = createContext<GameContextProps | undefined>(undefined);

// GameProvider component
export function GameProvider({ children }: { children: React.ReactNode }) {
  const [gameState, setGameState] = useState<GameState>(defaultGameState);
  const { toast } = useToast();
  const [infoModalState, setInfoModalState] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });

  // Track replacements separately from main game state
  const [replacementTracking, setReplacementTracking] = useState<{
    replacements: { playerId: string, originalPosition: number, teamId?: string }[];
  }>({
    replacements: []
  });

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
      showNotification("Player name cannot be empty.", 'error');
      return;
    }

    const allPlayers = [
      ...gameState.champions,
      ...gameState.challengers,
      ...gameState.waitingQueue.flatMap(item => isPreviousTeam(item) ? item.players : [item])
    ];
    if (allPlayers.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      showNotification(`Player "${trimmedName}" already exists.`, 'error');
      return;
    }

    const newPlayer: Player = {
      id: uuidv4(),
      name: trimmedName,
    };

    setGameState(prev => {
      const updatedState = { ...prev };

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
          updatedState.status = 'READY';
        }
      } else {
        // In any other state, add to waiting queue
        updatedState.waitingQueue = [...prev.waitingQueue, newPlayer];
      }

      return updatedState;
    });
  }, [gameState, showNotification]);

  // Remove player from any location (teams or queue)
  const removePlayer = useCallback((idOrName: string) => {
    console.log("[removePlayer] Attempting to remove player:", idOrName);

    setGameState(prev => {
      // Try to find and remove from champions
      const championsIndex = prev.champions.findIndex(p => p.id === idOrName || p.name === idOrName);
      if (championsIndex !== -1) {
        console.log("[removePlayer] Found and removing", prev.champions[championsIndex].name, "from Champions");
        
        // Enable manual mode and show notification
        setInfoModalState({
          isOpen: true,
          message: "Manual Mode enabled. Please drag a player from the waiting queue to the Champions team, then turn off manual mode to continue."
        });

        return {
          ...prev,
          champions: [
            ...prev.champions.slice(0, championsIndex),
            ...prev.champions.slice(championsIndex + 1)
          ],
          manualMode: true,
          status: 'WAITING_FOR_MANUAL_REPLACEMENT'
        };
      }

      // Try to find and remove from challengers
      const challengersIndex = prev.challengers.findIndex(p => p.id === idOrName || p.name === idOrName);
      if (challengersIndex !== -1) {
        console.log("[removePlayer] Found and removing", prev.challengers[challengersIndex].name, "from Challengers");
        
        // Enable manual mode and show notification
        setInfoModalState({
          isOpen: true,
          message: "Manual Mode enabled. Please drag a player from the waiting queue to the Challengers team, then turn off manual mode to continue."
        });

        return {
          ...prev,
          challengers: [
            ...prev.challengers.slice(0, challengersIndex),
            ...prev.challengers.slice(challengersIndex + 1)
          ],
          manualMode: true,
          status: 'WAITING_FOR_MANUAL_REPLACEMENT'
        };
      }

      // Try to find and remove from waiting queue
      const newQueue = prev.waitingQueue.reduce<WaitingQueueItem[]>((acc, item) => {
        if (!isPreviousTeam(item)) {
          // Individual player
          if (item.id !== idOrName && item.name !== idOrName) {
            acc.push(item);
          } else {
            console.log("[removePlayer] Found and removing individual player from queue:", item.name);
          }
        } else {
          // Previous team - remove player if found, or keep whole team if not
          const teamWithoutPlayer = {
            ...item,
            players: item.players.filter(p => p.id !== idOrName && p.name !== idOrName)
          };
          
          if (teamWithoutPlayer.players.length !== item.players.length) {
            console.log("[removePlayer] Found and removing player from PreviousTeam ID:", item.id);
            if (teamWithoutPlayer.players.length > 0) {
              acc.push(teamWithoutPlayer);
            }
          } else {
            acc.push(item);
          }
        }

        return acc;
      }, []);

      return {
        ...prev,
        waitingQueue: newQueue
      };
    });
  }, [setInfoModalState]);

  // Move player to a new position in the waiting queue or teams
  const movePlayer = useCallback((playerId: string, targetIndex: number) => {
    setGameState(prev => {
      let playerToMove: Player | null = null;
      let sourceLocation: 'champions' | 'challengers' | 'waitingQueue' | 'team' = 'waitingQueue';
      let sourceIndex: number | null = null;
      let sourceTeamId: string | null = null;

      // Check champions
      const championsIndex = prev.champions.findIndex(p => p.id === playerId);
      if (championsIndex !== -1) {
        playerToMove = prev.champions[championsIndex];
        sourceLocation = 'champions';
        sourceIndex = championsIndex;
      }

      // Check challengers
      if (!playerToMove) {
        const challengersIndex = prev.challengers.findIndex(p => p.id === playerId);
        if (challengersIndex !== -1) {
          playerToMove = prev.challengers[challengersIndex];
          sourceLocation = 'challengers';
          sourceIndex = challengersIndex;
        }
      }

      // Check waiting queue for individual players
      if (!playerToMove) {
        const queueIndex = prev.waitingQueue.findIndex(item => !isPreviousTeam(item) && item.id === playerId);
        if (queueIndex !== -1) {
          playerToMove = prev.waitingQueue[queueIndex] as Player;
          sourceLocation = 'waitingQueue';
          sourceIndex = queueIndex;
        }
      }

      // Check waiting queue for players in teams
      if (!playerToMove) {
        for (let i = 0; i < prev.waitingQueue.length; i++) {
          const item = prev.waitingQueue[i];
          if (isPreviousTeam(item)) {
            const playerIndex = item.players.findIndex(p => p.id === playerId);
            if (playerIndex !== -1) {
              playerToMove = item.players[playerIndex];
              sourceLocation = 'team';
              sourceIndex = playerIndex;
              sourceTeamId = item.id;
              break;
            }
          }
        }
      }

      if (!playerToMove) {
        console.error('Player not found for moving');
        return prev;
      }

      // Remove player from source
      let newChampions = [...prev.champions];
      let newChallengers = [...prev.challengers];
      let newWaitingQueue = [...prev.waitingQueue];

      if (sourceLocation === 'champions') {
        newChampions.splice(sourceIndex!, 1);
      } else if (sourceLocation === 'challengers') {
        newChallengers.splice(sourceIndex!, 1);
      } else if (sourceLocation === 'waitingQueue') {
        newWaitingQueue.splice(sourceIndex!, 1);
      } else if (sourceLocation === 'team' && sourceTeamId) {
        const teamIndex = newWaitingQueue.findIndex(item => isPreviousTeam(item) && item.id === sourceTeamId);
        if (teamIndex !== -1) {
          const team = newWaitingQueue[teamIndex] as PreviousTeam;
          const newPlayers = team.players.filter(p => p.id !== playerId);
          if (newPlayers.length > 0) {
            newWaitingQueue[teamIndex] = { ...team, players: newPlayers };
          } else {
            newWaitingQueue.splice(teamIndex, 1);
          }
        }
      }

      // Insert player at target position
      newWaitingQueue.splice(targetIndex, 0, playerToMove);

      return {
        ...prev,
        champions: newChampions,
        challengers: newChallengers,
        waitingQueue: newWaitingQueue
      };
    });
  }, []);

  // Move team to a new position in the waiting queue
  const moveTeam = useCallback((teamId: string, targetIndex: number) => {
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
      newWaitingQueue.splice(targetIndex, 0, team);

      return {
        ...prev,
        waitingQueue: newWaitingQueue
      };
    });
  }, []);

  // Add player to a team (champions or challengers)
  const addPlayerToTeam = useCallback((playerId: string, targetTeam: 'champions' | 'challengers') => {
    setGameState(prev => {
      let playerToMove: Player | null = null;
      let sourceIndex: number | null = null;
      let sourceTeamId: string | null = null;

      // Find player in waiting queue (individual or in team)
      for (let i = 0; i < prev.waitingQueue.length; i++) {
        const item = prev.waitingQueue[i];
        if (isPreviousTeam(item)) {
          const playerIndex = item.players.findIndex(p => p.id === playerId);
          if (playerIndex !== -1) {
            playerToMove = item.players[playerIndex];
            sourceTeamId = item.id;
            sourceIndex = i;
            break;
          }
        } else if (item.id === playerId) {
          playerToMove = item;
          sourceIndex = i;
          break;
        }
      }

      if (!playerToMove) {
        console.error('Player not found for moving to team');
        return prev;
      }

      // Check team capacity
      const targetTeamPlayers = targetTeam === 'champions' ? prev.champions : prev.challengers;
      if (targetTeamPlayers.length >= 5) {
        console.error(`${targetTeam} team is already full`);
        return prev;
      }

      // Remove from source
      const newWaitingQueue = [...prev.waitingQueue];
      if (sourceTeamId) {
        const team = newWaitingQueue[sourceIndex!] as PreviousTeam;
        const newPlayers = team.players.filter(p => p.id !== playerId);
        if (newPlayers.length > 0) {
          newWaitingQueue[sourceIndex!] = { ...team, players: newPlayers };
        } else {
          newWaitingQueue.splice(sourceIndex!, 1);
        }
      } else {
        newWaitingQueue.splice(sourceIndex!, 1);
      }

      // Add to target team
      const newState = {
        ...prev,
        waitingQueue: newWaitingQueue,
        champions: targetTeam === 'champions' ? [...prev.champions, playerToMove] : prev.champions,
        challengers: targetTeam === 'challengers' ? [...prev.challengers, playerToMove] : prev.challengers
      };

      return newState;
    });
  }, []);

  // Step 1: Process Game End (Initial setup)
  const processGameEnd = (winningTeam: Player[], losingTeam: Player[]) => {
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

    const pendingChallengers: Player[] = [];
    let remainingQueue = [...gameState.waitingQueue];

    // Process queue items until we have enough players or need a shootout
    while (pendingChallengers.length < 5 && remainingQueue.length > 0) {
      const item = remainingQueue[0];
      remainingQueue = remainingQueue.slice(1); // Remove the processed item

      if (!isPreviousTeam(item)) {
        // Handle individual player
        console.log("[useEffect - Step 3] Taking individual player:", item.name);
        pendingChallengers.push(item);
        console.log("[useEffect - Step 3] Challengers in progress:", pendingChallengers.length + "/5");
      } else {
        // Handle team
        console.log("[useEffect - Step 3] Encountered PreviousTeam (size " + item.players.length + ")");
        const remainingSpots = 5 - pendingChallengers.length;

        if (item.players.length <= remainingSpots) {
          // Take all players from the team
          console.log("[useEffect - Step 3] Taking all " + item.players.length + " players from team" + 
                     (item.players.length < remainingSpots ? " (not enough to finish)." : "."));
          pendingChallengers.push(...item.players);
          console.log("[useEffect - Step 3] Challengers in progress:", pendingChallengers.length + "/5");
        } else {
          // Need shootout
          console.log("[useEffect - Step 3] Shootout required. Need " + remainingSpots + " from team of " + item.players.length + ".");
          
          setGameState(prev => ({
            ...prev,
            challengers: pendingChallengers, // These are the players we've collected before the shootout
            waitingQueue: [item, ...remainingQueue], // Keep current team and remaining queue
            shootoutTeam: item,
            requiredPlayers: remainingSpots,
            showShootoutModal: true,
            status: 'SHOOTOUT',
            selectedShootoutPlayers: [], // Reset selected players
          }));
          return;
        }
      }
    }

    // After processing all items, update state based on result
    if (pendingChallengers.length === 5) {
      // We have exactly 5 players, no shootout needed
      setGameState(prev => ({
        ...prev,
        challengers: pendingChallengers,
        waitingQueue: remainingQueue,
        status: 'READY',
        shootoutTeam: null,
        requiredPlayers: 0,
        showShootoutModal: false,
        selectedShootoutPlayers: [],
      }));
    } else if (pendingChallengers.length < 5) {
      // Not enough players
      setGameState(prev => ({
        ...prev,
        challengers: pendingChallengers,
        waitingQueue: remainingQueue,
        status: 'WAITING_FOR_PLAYERS',
        shootoutTeam: null,
        requiredPlayers: 0,
        showShootoutModal: false,
        selectedShootoutPlayers: [],
      }));
    }
  }, [gameState.status, gameState.waitingQueue]);

  // Step 4: Handle Shootout Confirmation
  const confirmShootout = useCallback((selectedPlayers: Player[]) => {
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
      // and add selected players from shootout
      const challengers = [...prev.challengers, ...selectedPlayers];
      console.log("[confirmShootout - Step 4] Final Challengers Team:", challengers);

      // Create new queue:
      // 1. Add shootout losers as a team if more than 1, otherwise as individuals
      // 2. Add any remaining items that were after the shootout team
      let newQueue: WaitingQueueItem[] = [];
      
      // Add shootout losers
      if (shootoutLosers.length > 1) {
        // Add as a team
        newQueue.push({
          type: 'PreviousTeam',
          id: uuidv4(),
          players: shootoutLosers
        });
      } else {
        // Add as individuals
        newQueue.push(...shootoutLosers);
      }
      
      // Add remaining items
      newQueue = [...newQueue, ...queueAfterShootoutTeam];

      console.log("[confirmShootout - Step 4] Final Waiting Queue:", newQueue);
      console.log("[confirmShootout - Step 4] Setting status to READY");

      return {
        ...prev,
        challengers,
        waitingQueue: newQueue,
        status: 'READY',
        showShootoutModal: false,
        shootoutTeam: null,
        requiredPlayers: 0
      };
    });
  }, []);

  // Toggle Manual Mode
  const toggleManualMode = useCallback(() => {
    setGameState(prev => {
      const newManualMode = !prev.manualMode;
      
      // If turning off manual mode and we were waiting for replacement
      if (!newManualMode && prev.status === 'WAITING_FOR_MANUAL_REPLACEMENT') {
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
            message: "Teams must be complete before turning off manual mode."
          });
          return prev;
        }
      }

      return {
        ...prev,
        manualMode: newManualMode
      };
    });
  }, [setInfoModalState]);

  // Direct Setters (primarily for manual mode or testing)
  const setChampions = (team: Player[]) => setGameState(prev => ({ ...prev, champions: team }));
  const setChallengers = (team: Player[]) => setGameState(prev => ({ ...prev, challengers: team }));
  const setWaitingQueue = (queue: WaitingQueueItem[]) => setGameState(prev => ({ ...prev, waitingQueue: queue }));

  // Handle game end
  const handleGameEnd = (winner: 'champions' | 'challengers') => {
    // Check if the game is in a state where it can end (e.g., teams are full)
    if (gameState.status !== 'READY' && gameState.status !== 'WAITING_FOR_PLAYERS') {
        showNotification(`Cannot end game. Status is: ${gameState.status}`, 'error');
        console.warn(`[endGame] Attempted to end game with status: ${gameState.status}. Aborted.`);
        return;
    }
    if (gameState.champions.length !== 5 || gameState.challengers.length !== 5) {
        showNotification("Both teams must have 5 players to end the game.", 'error');
        console.warn(`[endGame] Attempted to end game with incomplete teams (Champs: ${gameState.champions.length}, Chall: ${gameState.challengers.length}). Aborted.`);
        return;
    }

    console.log(`[endGame] Received command: ${winner} won.`);
    const winningTeam = winner === 'champions' ? gameState.champions : gameState.challengers;
    const losingTeam = winner === 'champions' ? gameState.challengers : gameState.champions;

    processGameEnd(winningTeam, losingTeam); // Start the multi-step process
  };

  const dismissShootoutModal = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      showShootoutModal: false
    }));
  }, []);

  const value: GameContextProps = {
    gameState,
    setGameState,
    addPlayer,
    removePlayer,
    movePlayer,
    moveTeam,
    addPlayerToTeam,
    handleGameEnd,
    confirmShootout,
    toggleManualMode,
    dismissShootoutModal,
    dismissInfoModal,
    infoModalState,
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
