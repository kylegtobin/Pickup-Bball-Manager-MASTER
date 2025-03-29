import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Player } from '../../types';

interface TeamBoxProps {
  title: string;
  team: Player[];
  type: 'champions' | 'challengers';
}

const TeamBox: React.FC<TeamBoxProps> = ({ title, team, type }) => {
  const { gameState, removePlayer, addPlayerToTeam } = useGame();
  const { manualMode } = gameState;
  const [isDragOver, setIsDragOver] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playerId: string } | null>(null);

  const handleRemovePlayer = (player: Player) => {
    removePlayer(player.id);
    setContextMenu(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!manualMode) return;
    if (team.length >= 5) return;

    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!manualMode) return;
    if (team.length >= 5) return;

    e.preventDefault();
    setIsDragOver(false);

    const playerId = e.dataTransfer.getData('playerId');
    if (playerId) {
      addPlayerToTeam(playerId, type);
    }
  };

  const handlePlayerDragStart = (e: React.DragEvent, player: Player) => {
    if (!manualMode) return;

    e.dataTransfer.setData('playerId', player.id);
    e.dataTransfer.setData('type', 'player');
    e.dataTransfer.setData('source', type);
    e.dataTransfer.setData('sourceTeam', type);
    e.dataTransfer.setData('playerName', player.name);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleContextMenu = (e: React.MouseEvent, player: Player) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      playerId: player.id
    });
  };

  const handleDocumentClick = () => {
    setContextMenu(null);
  };

  React.useEffect(() => {
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  return (
    <div
      className={`p-4 rounded-lg border-2 ${
        isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <h2 className="text-lg font-semibold mb-2">{title} ({team.length})</h2>
      <div className="space-y-2">
        {team.map((player) => (
          <div
            key={player.id}
            className={`p-2 rounded border ${manualMode ? 'cursor-move' : ''}`}
            draggable={manualMode}
            onDragStart={(e) => handlePlayerDragStart(e, player)}
            onContextMenu={(e) => handleContextMenu(e, player)}
          >
            {player.name}
          </div>
        ))}
        {manualMode && team.length < 5 && (
          <div className="p-2 rounded border-2 border-dashed border-gray-300 text-center text-gray-500">
            Drop player here (max 5)
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed bg-white shadow-lg border rounded py-1 z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full px-4 py-2 text-left hover:bg-gray-100"
            onClick={() => handleRemovePlayer(team.find(p => p.id === contextMenu.playerId)!)}
          >
            Remove Player
          </button>
        </div>
      )}
    </div>
  );
};

export default TeamBox;
