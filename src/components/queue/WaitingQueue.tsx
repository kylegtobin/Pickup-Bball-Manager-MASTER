import React, { useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { isPreviousTeam, WaitingQueueItem, Player, PreviousTeam as PreviousTeamType } from '../../types';
import ContextMenu from '../ContextMenu';
import PreviousTeam from './PreviousTeam';

const WaitingQueue: React.FC = () => {
  const { gameState, removePlayer, movePlayer, moveTeam, addPlayerToTeam } = useGame();
  const { waitingQueue, manualMode } = gameState;
  const queueRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; player: Player } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleContextMenu = (e: React.MouseEvent, player: Player) => {
    e.preventDefault();
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      player
    });
  };

  const handleRemovePlayer = (player: Player) => {
    removePlayer(player.id);
  };

  const handleDragStart = (e: React.DragEvent, item: WaitingQueueItem, index: number) => {
    if (!manualMode) return;
    
    if (isPreviousTeam(item)) {
      e.dataTransfer.setData('teamId', item.id);
      e.dataTransfer.setData('type', 'team');
      e.dataTransfer.setData('source', 'waitingQueue');
      e.dataTransfer.setData('sourceIndex', index.toString());
    } else {
      e.dataTransfer.setData('playerId', item.id);
      e.dataTransfer.setData('type', 'player');
      e.dataTransfer.setData('source', 'waitingQueue');
      e.dataTransfer.setData('sourceIndex', index.toString());
      e.dataTransfer.setData('playerName', item.name);
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePlayerDragStart = (e: React.DragEvent, player: Player, teamIndex: number, playerIndex: number) => {
    if (!manualMode) return;
    
    e.dataTransfer.setData('playerId', player.id);
    e.dataTransfer.setData('teamIndex', teamIndex.toString());
    e.dataTransfer.setData('playerIndex', playerIndex.toString());
    e.dataTransfer.setData('source', 'waitingQueue');
    e.dataTransfer.setData('playerName', player.name);
    e.dataTransfer.setData('isTeam', 'false');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index?: number) => {
    if (manualMode) {
      e.preventDefault();
      if (index !== undefined) {
        setDragOverIndex(index);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    if (!manualMode) return;
    
    e.preventDefault();
    setDragOverIndex(null);
    
    const type = e.dataTransfer.getData('type');
    const source = e.dataTransfer.getData('source');
    const sourceIndex = parseInt(e.dataTransfer.getData('sourceIndex'), 10);

    if (type === 'player') {
      const playerId = e.dataTransfer.getData('playerId');
      movePlayer(playerId, index);
    } else if (type === 'team') {
      const teamId = e.dataTransfer.getData('teamId');
      moveTeam(teamId, index);
    }
  };

  const handleDropOnTeam = (e: React.DragEvent, targetTeam: 'champions' | 'challengers') => {
    if (!manualMode) return;
    
    e.preventDefault();
    const playerId = e.dataTransfer.getData('playerId');
    if (playerId) {
      addPlayerToTeam(playerId, targetTeam);
    }
  };

  return (
    <div ref={queueRef} className="mt-4">
      <h2 className="text-lg font-semibold mb-2">Waiting Queue ({waitingQueue.length})</h2>
      
      {/* Drop zone at the beginning */}
      {manualMode && (
        <div
          className={`border-2 border-dashed p-4 mb-2 rounded text-center ${
            dragOverIndex === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={(e) => handleDragOver(e, 0)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 0)}
        >
          Drop here
        </div>
      )}

      {waitingQueue.map((item, index) => (
        <React.Fragment key={isPreviousTeam(item) ? item.id : item.id}>
          {isPreviousTeam(item) ? (
            <PreviousTeam
              team={item}
              index={index}
              onDragStart={(e) => handleDragStart(e, item, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onContextMenu={handleContextMenu}
              isDragOver={dragOverIndex === index}
              manualMode={manualMode}
            />
          ) : (
            <div
              className={`p-2 mb-2 rounded border ${
                dragOverIndex === index ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              } ${manualMode ? 'cursor-move' : ''}`}
              draggable={manualMode}
              onDragStart={(e) => handleDragStart(e, item, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onContextMenu={(e) => handleContextMenu(e, item)}
            >
              {item.name}
            </div>
          )}

          {/* Drop zone after each item */}
          {manualMode && (
            <div
              className={`border-2 border-dashed p-4 mb-2 rounded text-center ${
                dragOverIndex === index + 1 ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
              onDragOver={(e) => handleDragOver(e, index + 1)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index + 1)}
            >
              Drop here
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Final drop zone if queue is empty */}
      {manualMode && waitingQueue.length === 0 && (
        <div
          className={`border-2 border-dashed p-4 rounded text-center ${
            dragOverIndex === 0 ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={(e) => handleDragOver(e, 0)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, 0)}
        >
          Drop here
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          options={[
            {
              label: 'Remove Player',
              action: () => handleRemovePlayer(contextMenu.player)
            }
          ]}
        />
      )}
    </div>
  );
};

export default WaitingQueue;
