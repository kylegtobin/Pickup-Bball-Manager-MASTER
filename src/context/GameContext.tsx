import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Player, PreviousTeam, WaitingQueueItem, GameState } from '../types'; 
import { useToast } from '../components/ui/Toast'; 

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
  elapsedMinutes: 0
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          console.log("[addPlayer] Both teams filled with 5 players each. Starting game and timer.");
          updatedState.status = 'READY';
          // Set the game start time immediately rather than waiting for the effect
          const now = Date.now();
          updatedState.gameStartTime = now;
          updatedState.elapsedMinutes = 0;
          
          // Start the interval timer in the next tick to avoid potential state conflicts
          setTimeout(() => {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
            }
            timerIntervalRef.current = setInterval(() => {
              setGameState(prev => {
                if (!prev.gameStartTime) return prev;
                
                // Calculate elapsed minutes, capped at 12
                const elapsedMs = Date.now() - prev.gameStartTime;
                const minutes = Math.min(12, Math.floor(elapsedMs / (1000 * 60)));
                
                return {
                  ...prev,
                  elapsedMinutes: minutes
                };
              });
            }, 60000); // Update every minute
          }, 0);
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

    let playerFound = false;

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
      const championsIndex = prev.champions.findIndex(p => p.id === idOrName || p.name === idOrName);
      if (championsIndex !== -1) {
        console.log("[removePlayer] Found and removing", prev.champions[championsIndex].name, "from Champions");
        playerFound = true;
        
        // Only show notification and enable manual mode if there are more than 10 players
        if (shouldEnableManualMode && !prev.manualMode) {
          setInfoModalState({
            isOpen: true,
            message: "Manual mode enabled. Please drag a player from the waiting queue to the Champions team, then turn off manual mode to continue."
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
      const challengersIndex = prev.challengers.findIndex(p => p.id === idOrName || p.name === idOrName);
      if (challengersIndex !== -1) {
        console.log("[removePlayer] Found and removing", prev.challengers[challengersIndex].name, "from Challengers");
        playerFound = true;
        
        // Only show notification and enable manual mode if there are more than 10 players
        if (shouldEnableManualMode && !prev.manualMode) {
          setInfoModalState({
            isOpen: true,
            message: "Manual mode enabled. Please drag a player from the waiting queue to the Challengers team, then turn off manual mode to continue."
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
          if (item.id !== idOrName && item.name !== idOrName) {
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
            players: item.players.filter(p => p.id !== idOrName && p.name !== idOrName)
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
            gameState.champions.some(p => p.id === idOrName || p.name === idOrName) ||
            gameState.challengers.some(p => p.id === idOrName || p.name === idOrName) ||
            gameState.waitingQueue.some(item => 
              !isPreviousTeam(item) 
                ? (item.id === idOrName || item.name === idOrName)
                : item.players.some(p => p.id === idOrName || p.name === idOrName)
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

  // Add player to a specific team (champions or challengers)
  const addPlayerToTeam = useCallback((playerId: string, targetTeam: 'champions' | 'challengers') => {
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

    const pendingChallengers: Player[] = [];
    let remainingQueue = [...gameState.waitingQueue];

    // Process queue items until we have enough players or need a shootout
    while (pendingChallengers.length < 5 && remainingQueue.length > 0) {
      const item = remainingQueue[0];
      remainingQueue = remainingQueue.slice(1); // Remove the processed item

      if (!isPreviousTeam(item)) {
        // Handle individual player - Create a deep copy to prevent reference issues
        console.log("[useEffect - Step 3] Taking individual player:", item.name);
        pendingChallengers.push({...item}); // Create a new object to avoid reference issues
        console.log("[useEffect - Step 3] Challengers in progress:", pendingChallengers.length + "/5");
      } else {
        // Handle team
        console.log("[useEffect - Step 3] Encountered PreviousTeam (size " + item.players.length + ")");
        const remainingSpots = 5 - pendingChallengers.length;

        if (item.players.length <= remainingSpots) {
          // Take all players from the team - Create deep copies
          console.log("[useEffect - Step 3] Taking all " + item.players.length + " players from team" + 
                     (item.players.length < remainingSpots ? " (not enough to finish)." : "."));
          pendingChallengers.push(...item.players.map(player => ({...player}))); // Create new objects
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
          return; // Exit early
        }
      }
    }

    // If we got here, we have enough players for both teams
    setGameState(prev => ({
      ...prev,
      challengers: pendingChallengers,
      waitingQueue: remainingQueue,
      status: 'READY',
    }));
  }, [gameState.status, gameState.waitingQueue]);

  // Step 4: Handle Shootout Confirmation
  const confirmShootout = useCallback((selectedPlayers: Player[]) => {
    console.log("[confirmShootout] Confirming shootout with players:", selectedPlayers);
    
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

      // Check for duplicate IDs in the resulting state
      const resultState = {
        ...prev,
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

  // Direct Setters (primarily for manual mode or testing)
  const setChampions = (team: Player[]) => setGameState(prev => ({ ...prev, champions: team }));
  const setChallengers = (team: Player[]) => setGameState(prev => ({ ...prev, challengers: team }));
  const setWaitingQueue = (queue: WaitingQueueItem[]) => setGameState(prev => ({ ...prev, waitingQueue: queue }));

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
        processGameEnd(winningTeam, losingTeam);
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

    processGameEnd(winningTeam, losingTeam); // Start the multi-step process
  };

  const dismissShootoutModal = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      showShootoutModal: false
    }));
  }, []);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Timer functionality to track elapsed minutes
  const startGameTimer = useCallback(() => {
    // Clear any existing timer
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    // Set the game start time to now
    const now = Date.now();
    setGameState(prev => ({
      ...prev,
      gameStartTime: now,
      elapsedMinutes: 0
    }));

    // Start a timer that updates elapsed minutes every minute
    timerIntervalRef.current = setInterval(() => {
      setGameState(prev => {
        if (!prev.gameStartTime) return prev;
        
        // Calculate elapsed minutes, capped at 12
        const elapsedMs = Date.now() - prev.gameStartTime;
        const minutes = Math.min(12, Math.floor(elapsedMs / (1000 * 60)));
        
        return {
          ...prev,
          elapsedMinutes: minutes
        };
      });
    }, 60000); // Update every minute
  }, []);

  // Stop the game timer
  const stopGameTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
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
    stopGameTimer
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
