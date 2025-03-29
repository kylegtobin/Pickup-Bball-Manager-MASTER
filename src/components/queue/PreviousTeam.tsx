import React from 'react';
import { PreviousTeam as PreviousTeamType, Player, GameState } from '../../types';
import { useGame } from '../../context/GameContext';

interface PreviousTeamProps {
  team: PreviousTeamType;
  index: number;
  onDragStart: (e: React.DragEvent, item: PreviousTeamType, index: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onContextMenu: (e: React.MouseEvent, player: Player) => void;
  isDragOver: boolean;
  manualMode: boolean;
}

const PreviousTeam: React.FC<PreviousTeamProps> = ({
  team,
  index,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  isDragOver,
  manualMode
}) => {
  const { gameState, setGameState } = useGame();
  const { manualMode: gameManualMode } = gameState;

  const handlePlayerDragStart = (e: React.DragEvent, player: Player) => {
    if (!manualMode) return;
    e.stopPropagation(); // Prevent team drag when dragging a player
    
    e.dataTransfer.setData('playerId', player.id);
    e.dataTransfer.setData('type', 'player');
    e.dataTransfer.setData('source', 'team');
    e.dataTransfer.setData('sourceTeamId', team.id);
    e.dataTransfer.setData('playerName', player.name);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTeamDrop = (e: React.DragEvent) => {
    if (!manualMode) return;
    if (team.players.length >= 5) return;

    e.preventDefault();
    e.stopPropagation(); // Prevent the drop from bubbling to the queue

    const type = e.dataTransfer.getData('type');
    const playerId = e.dataTransfer.getData('playerId');
    const source = e.dataTransfer.getData('source');
    const sourceTeam = e.dataTransfer.getData('sourceTeam');

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
            playerToAdd = newChampions[playerIndex];
            newChampions.splice(playerIndex, 1);
          }
        } else if (sourceTeam === 'challengers') {
          const playerIndex = newChallengers.findIndex(p => p.id === playerId);
          if (playerIndex !== -1) {
            playerToAdd = newChallengers[playerIndex];
            newChallengers.splice(playerIndex, 1);
          }
        } else {
          // Check if player is an individual in the queue
          const individualIndex = newWaitingQueue.findIndex(
            item => !isPreviousTeam(item) && item.id === playerId
          );

          if (individualIndex !== -1) {
            playerToAdd = newWaitingQueue[individualIndex] as Player;
            newWaitingQueue.splice(individualIndex, 1);
          } else {
            // Check if player is in another team
            for (let i = 0; i < newWaitingQueue.length; i++) {
              const item = newWaitingQueue[i];
              if (isPreviousTeam(item)) {
                const playerIndex = item.players.findIndex(p => p.id === playerId);
                if (playerIndex !== -1) {
                  playerToAdd = item.players[playerIndex];
                  const newPlayers = item.players.filter(p => p.id !== playerId);
                  if (newPlayers.length > 0) {
                    newWaitingQueue[i] = { ...item, players: newPlayers };
                  } else {
                    newWaitingQueue.splice(i, 1);
                  }
                  break;
                }
              }
            }
          }
        }

        if (!playerToAdd) {
          console.error('Player not found for adding to team');
          return prev;
        }

        // Find and update the target team
        const teamIndex = newWaitingQueue.findIndex(
          item => isPreviousTeam(item) && item.id === team.id
        );

        if (teamIndex !== -1) {
          const updatedTeam = {
            ...newWaitingQueue[teamIndex] as PreviousTeamType,
            players: [...(newWaitingQueue[teamIndex] as PreviousTeamType).players, playerToAdd]
          };
          newWaitingQueue[teamIndex] = updatedTeam;
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
      className={`p-4 mb-2 rounded border-2 ${
        isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      } ${manualMode && gameManualMode ? 'cursor-move' : ''}`}
      draggable={manualMode && gameManualMode}
      onDragStart={(e) => onDragStart(e, team, index)}
      onDragOver={(e) => {
        onDragOver(e);
        if (team.players.length < 5) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDragLeave={onDragLeave}
      onDrop={handleTeamDrop}
    >
      <div className="font-semibold mb-2">Previous Team ({team.players.length})</div>
      <div className="space-y-2">
        {team.players.map((player) => (
          <div
            key={player.id}
            className={`p-2 bg-gray-100 rounded border ${manualMode && gameManualMode ? 'cursor-move' : ''}`}
            draggable={manualMode && gameManualMode}
            onDragStart={(e) => handlePlayerDragStart(e, player)}
            onContextMenu={(e) => onContextMenu(e, player)}
          >
            {player.name}
          </div>
        ))}
        {team.players.length < 5 && manualMode && gameManualMode && (
          <div className="p-2 bg-gray-100 rounded border-2 border-dashed border-gray-300 text-center text-sm text-gray-500">
            Drop player here (max 5)
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviousTeam;
