import React, { useState } from 'react';
import { PreviousTeam as PreviousTeamType, Player, GameState } from '../../types';
import { useGame } from '../../context/GameContext';

interface PreviousTeamProps {
  team: PreviousTeamType;
  index: number;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, player: Player) => void;
  manualMode: boolean;
  isDragOver: boolean;
}

const PreviousTeam: React.FC<PreviousTeamProps> = ({
  team,
  index,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  manualMode,
  isDragOver
}) => {
  const { gameState, setGameState, removePlayer } = useGame();
  const { manualMode: gameManualMode } = gameState;
  const [isDragOverState, setIsDragOver] = useState(false);
  const [isDragOverDropZone, setIsDragOverDropZone] = useState(false);

  const handlePlayerDragStart = (e: React.DragEvent, player: Player, playerIndex: number) => {
    if (!manualMode) return;
    e.stopPropagation(); // Prevent team drag when dragging a player
    
    e.dataTransfer.setData('type', 'player');
    e.dataTransfer.setData('playerId', player.id);
    e.dataTransfer.setData('playerName', player.name);
    e.dataTransfer.setData('source', team.id); // Set the team ID as source
    e.dataTransfer.setData('sourceTeam', 'previousTeam'); // Mark as coming from a previous team
    e.dataTransfer.effectAllowed = 'move';
  };

  // Direct player context menu handler
  const handlePlayerContextMenu = (e: React.MouseEvent, player: Player) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Log the event for debugging
    console.log('[PreviousTeam] Context menu requested for player:', player.name);
    
    // Directly use the removePlayer function from context instead of relying on prop
    if (onContextMenu) {
      onContextMenu(e, player);
    } else {
      console.error('No context menu handler provided');
    }
  };

  const handleTeamDragStart = (e: React.DragEvent) => {
    if (!manualMode) return;
    e.dataTransfer.setData('teamId', team.id);
    e.dataTransfer.setData('type', 'team');
    e.dataTransfer.setData('source', 'waitingQueue');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!manualMode) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    setIsDragOverDropZone(true); // Also highlight the drop zone when hovering over the container
  };

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    if (!manualMode) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    setIsDragOverDropZone(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setIsDragOverDropZone(false); // Reset drop zone highlight when leaving the container
  };

  const handleDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only turn off drop zone highlight if we're actually leaving the drop zone
    // but don't turn off container highlight
    if (!isDragOverState) {
      setIsDragOverDropZone(false);
    }
  };

  const handleTeamDrop = (e: React.DragEvent) => {
    if (!manualMode) return;
    
    e.preventDefault();
    e.stopPropagation(); // Prevent the drop from bubbling to the queue
    
    // Reset all highlighting states immediately
    setIsDragOver(false);
    setIsDragOverDropZone(false);

    // Check team size after highlight reset
    if (team.players.length >= 5) return;

    const type = e.dataTransfer.getData('type');
    const playerId = e.dataTransfer.getData('playerId');
    const source = e.dataTransfer.getData('source');
    const sourceTeam = e.dataTransfer.getData('sourceTeam');
    const playerName = e.dataTransfer.getData('playerName');

    if (type === 'player' && playerId) {
      setGameState(prev => {
        // Find and remove the player from their current location
        let newWaitingQueue = [...prev.waitingQueue];
        let newChampions = [...prev.champions];
        let newChallengers = [...prev.challengers];
        let playerToAdd: Player | null = null;

        // Check if player is coming from champions or challengers
        if (sourceTeam === 'champions') {
          const playerIndex = newChampions.findIndex(p => p.id === playerId);
          if (playerIndex !== -1) {
            playerToAdd = { ...newChampions[playerIndex] }; // Create a copy
            newChampions.splice(playerIndex, 1);
          }
        } else if (sourceTeam === 'challengers') {
          const playerIndex = newChallengers.findIndex(p => p.id === playerId);
          if (playerIndex !== -1) {
            playerToAdd = { ...newChallengers[playerIndex] }; // Create a copy
            newChallengers.splice(playerIndex, 1);
          }
        }

        // If we haven't found the player in teams, look in the queue
        if (!playerToAdd) {
          // Check if player is an individual in the queue
          const individualIndex = newWaitingQueue.findIndex(
            item => !isPreviousTeam(item) && item.id === playerId
          );

          if (individualIndex !== -1) {
            playerToAdd = { ...newWaitingQueue[individualIndex] as Player }; // Create a copy
            newWaitingQueue.splice(individualIndex, 1);
          } else {
            // Look for player in previous teams
            for (let i = 0; i < newWaitingQueue.length; i++) {
              const item = newWaitingQueue[i];
              if (isPreviousTeam(item)) {
                const playerIndex = item.players.findIndex(p => p.id === playerId);
                if (playerIndex !== -1) {
                  playerToAdd = { ...item.players[playerIndex] }; // Create a copy
                  
                  // Special handling for any players dragged within their own team
                  if (item.id === team.id) {
                    // This is a player in the current team being dragged within the same team
                    // Don't remove the player here, as we'll handle it in the same-team case
                  } else {
                    // Remove player from team
                    item.players.splice(playerIndex, 1);
                    // Remove the team if it's now empty
                    if (item.players.length === 0) {
                      newWaitingQueue.splice(i, 1);
                    }
                  }
                  break;
                }
              }
            }
          }
        }

        // Add the player to the target team
        if (playerToAdd) {
          // Check if we're trying to add to the same team the player came from
          const sourceIsSameAsCurrent = sourceTeam === 'previousTeam' && source === team.id;
          
          if (sourceIsSameAsCurrent) {
            // If this is a single-player team (special case we handled earlier),
            // the player is already in the team, so we don't need to add it again.
            // Do nothing here to avoid duplication - player remains in the team.
            console.log("Same team drag detected - no need to modify team");
          } else {
            // Player is coming from elsewhere, add to the target team in the queue
            const targetTeamIndex = newWaitingQueue.findIndex(item => 
              isPreviousTeam(item) && item.id === team.id
            );

            if (targetTeamIndex !== -1) {
              const targetTeam = newWaitingQueue[targetTeamIndex] as PreviousTeamType;
              // Check if player is already in the team to prevent duplicates
              if (!targetTeam.players.some(p => p.id === playerToAdd!.id)) {
                targetTeam.players.push(playerToAdd);
              }
            } else {
              // If team not found in the queue (might have been removed), add it back
              newWaitingQueue.push({
                type: 'PreviousTeam',
                id: team.id,
                players: [playerToAdd]
              });
            }
          }
        }

        return {
          ...prev,
          champions: newChampions,
          challengers: newChallengers,
          waitingQueue: newWaitingQueue
        };
      });
    }
  };

  const isPreviousTeam = (item: any): item is PreviousTeamType => {
    return 'players' in item;
  };

  return (
    <div
      className={`rounded-md pl-3 pr-2 pt-2 pb-2 border-l-[6px] border-[#64748B] ${
        manualMode ? 'cursor-move' : ''
      } ${isDragOverState ? 'bg-gray-300' : 'bg-[#EEF1F5]'} w-full transition-all duration-150`}
      draggable={manualMode}
      onDragStart={handleTeamDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleTeamDrop}
    >
      <h3 className="font-semibold mb-2 text-base text-gray-600">Previous team</h3>
      <div className="space-y-2">
        {team.players.map((player, playerIndex) => (
          <div 
            key={`player-${player.id}`}
            className="px-3 rounded-md text-center border border-[#D5DAE1] bg-white hover:bg-gray-50 text-xl font-semibold"
            style={{
              height: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: manualMode ? 'move' : 'default',
              width: '100%'
            }}
            draggable={manualMode}
            onDragStart={(e) => handlePlayerDragStart(e, player, playerIndex)}
            onContextMenu={(e) => handlePlayerContextMenu(e, player)}
          >
            {player.name}
          </div>
        ))}
        {/* Show drop zone if team is not full AND manual mode is on */}
        {manualMode && team.players.length < 5 && (
          <div
            className={`px-3 border-dashed rounded-md text-center italic font-bold text-lg ${
              isDragOverDropZone ? 'border-[6px] border-white bg-gray-600 text-white' : 'border-2 border-black bg-gray-600 text-white'
            }`}
            style={{
              height: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              transition: 'border-width 0.15s ease-in-out, border-color 0.15s ease-in-out'
            }}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleTeamDrop}
          >
            Drop Zone
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviousTeam;
