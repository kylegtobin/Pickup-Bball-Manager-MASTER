import React, { useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { isPreviousTeam, WaitingQueueItem, Player, PreviousTeam as PreviousTeamType } from '../../types';
import ContextMenu from '../ContextMenu';
import PreviousTeam from './PreviousTeam';
import EmptySlot from '../common/EmptySlot';
import WaitingQueueLogo from '../../assets/images/WaitingQueue.jpg';
import { calculateWaitTimeInfo } from '../../utils/waitTimeUtils';
import { WaitTimeIndicator, GamesBehindIndicator } from './WaitTimeIndicators';

const WaitingQueue: React.FC = () => {
  const { gameState, removePlayer, movePlayer, moveTeam, addPlayerToTeam } = useGame();
  const { waitingQueue, manualMode, champions, challengers, elapsedMinutes } = gameState;
  const queueRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; options: { label: string; action: () => void }[] } | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Calculate total players in the system
  const totalPlayers = champions.length + challengers.length + waitingQueue.reduce((count, item) => {
    if (isPreviousTeam(item)) {
      return count + item.players.length;
    }
    return count + 1;
  }, 0);

  const handleContextMenu = (e: React.MouseEvent, player: Player | WaitingQueueItem) => {
    e.preventDefault();
    e.stopPropagation(); // Stop propagation to prevent event bubbling
    
    // Ensure we always have a player object with id and name
    const playerData = 'type' in player ? null : player;
    
    if (!playerData) {
      console.error('Invalid player data for context menu', player);
      return;
    }
    
    console.log('[Context Menu] Opening for player:', playerData.name);
    
    setContextMenu({
      position: { 
        x: e.clientX,
        y: e.clientY
      },
      options: [
        {
          label: `Remove ${playerData.name}`,
          action: () => {
            console.log('[Context Menu] Removing player:', playerData.name);
            removePlayer(playerData.id);
          },
        },
      ],
    });
  };

  const handleRemovePlayer = (player: Player) => {
    removePlayer(player.id);
  };

  const handleDragStart = (e: React.DragEvent, item: WaitingQueueItem, index: number) => {
    if (!manualMode) return;
    
    e.dataTransfer.setData('index', index.toString());
    e.dataTransfer.setData('source', 'waitingQueue');
    
    if (isPreviousTeam(item)) {
      e.dataTransfer.setData('teamId', item.id);
      e.dataTransfer.setData('type', 'team');
    } else {
      e.dataTransfer.setData('playerId', item.id);
      e.dataTransfer.setData('type', 'player');
    }
    
    e.dataTransfer.effectAllowed = 'move';
  };

  const handlePlayerDragStart = (e: React.DragEvent, player: Player) => {
    if (!manualMode) return;
    
    e.dataTransfer.setData('playerId', player.id);
    e.dataTransfer.setData('type', 'player');
    e.dataTransfer.setData('source', 'waitingQueue');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTeamDragStart = (e: React.DragEvent, teamId: string) => {
    if (!manualMode) return;
    
    e.dataTransfer.setData('teamId', teamId);
    e.dataTransfer.setData('type', 'team');
    e.dataTransfer.setData('source', 'waitingQueue');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index?: number) => {
    if (manualMode) {
      e.preventDefault();
      e.stopPropagation();
      // Only set dragOverIndex if we're hovering over a drop zone
      const target = e.currentTarget;
      if (target.classList.contains('drop-zone')) {
        setDragOverIndex(index ?? null);
      }
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const target = e.currentTarget;
    if (target.classList.contains('drop-zone')) {
      e.preventDefault();
      e.stopPropagation();
      setDragOverIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    if (!manualMode) return;
    
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    
    const type = e.dataTransfer.getData('type');
    const source = e.dataTransfer.getData('source');
    const sourceIndex = parseInt(e.dataTransfer.getData('index'), 10);

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

  const handlePlayerContextMenu = (e: React.MouseEvent, player: Player) => {
    e.preventDefault();
    e.stopPropagation(); // Stop propagation to prevent event bubbling
    
    console.log('[Context Menu] Opening for player:', player.name);
    
    setContextMenu({
      position: { 
        x: e.clientX,
        y: e.clientY
      },
      options: [
        {
          label: `Remove ${player.name}`,
          action: () => {
            console.log('[Context Menu] Removing player:', player.name);
            removePlayer(player.id);
          },
        },
      ],
    });
  };

  const handleContainerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div 
      className="rounded-lg p-4 shadow-sm bg-gray-200 relative"
      style={{ paddingLeft: '90px', paddingRight: '90px' }}
      ref={queueRef}
      onContextMenu={handleContainerContextMenu}
    >
      {!manualMode && waitingQueue.length > 0 && (
        <div 
          className="text-black font-bold text-xl underline absolute"
          style={{ top: '120px', left: '65px' }}
        >
          Estimated Wait Time
        </div>
      )}
        
      <div className="flex justify-center mb-3 mt-1">
        <img 
          src={WaitingQueueLogo} 
          alt="Waiting Queue" 
          className="h-32 object-contain"
          style={{ 
            maxWidth: '280px',
            width: '100%',
            mixBlendMode: 'multiply',
          }}
        />
      </div>
        
      {!manualMode && waitingQueue.length > 0 && (
        <div 
          className="text-black font-bold text-xl underline absolute"
          style={{ top: '120px', right: '77px' }}
        >
          Game Countdown
        </div>
      )}
      
      <div className="flex flex-col items-center">
        {/* Always show first drop zone in manual mode */}
        {manualMode && (
          <div className="w-full max-w-lg mb-1">
            <div
              className={`drop-zone border-dashed rounded text-center italic font-bold text-lg ${
                dragOverIndex === 0 ? 'border-[6px] border-white bg-gray-600 text-white' : 'border-2 border-black bg-gray-600 text-white'
              }`}
              style={{
                height: '42px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                transition: 'border-width 0.15s ease-in-out, border-color 0.15s ease-in-out'
              }}
              onDragOver={(e) => handleDragOver(e, 0)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 0)}
            >
              Drop Zone
            </div>
          </div>
        )}
        
        {/* Render queue items */}
        {waitingQueue.map((item, index) => (
          <div key={isPreviousTeam(item) ? `team-${item.id}` : `player-${item.id}`} className="mb-1 w-full max-w-lg relative">
            {isPreviousTeam(item) ? (
              <div 
                className={`w-full ${dragOverIndex === index ? 'border-[6px]' : 'border-[3px]'} border-gray-700 bg-gray-300 relative rounded`}
                draggable={manualMode}
                onDragStart={(e) => handleDragStart(e, item, index)}
              >
                <PreviousTeam 
                  team={item}
                  index={index}
                  onDragStart={(e) => handleDragStart(e, item, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onContextMenu={(e, player) => handlePlayerContextMenu(e, player)}
                  manualMode={manualMode}
                  isDragOver={dragOverIndex === index}
                />
                
                {/* Wait time and games behind indicators */}
                {!manualMode && gameState.gameStartTime !== null && (
                  <>
                    {/* Only calculate and show if not in manual mode */}
                    {(() => {
                      const waitTimeInfo = calculateWaitTimeInfo(waitingQueue, index, elapsedMinutes);
                      return (
                        <>
                          <WaitTimeIndicator 
                            waitMinutes={waitTimeInfo.waitMinutes} 
                            color={waitTimeInfo.color} 
                          />
                          <GamesBehindIndicator 
                            gamesBehind={waitTimeInfo.gamesBehind} 
                            color={waitTimeInfo.color} 
                          />
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            ) : (
              <div
                className={`w-full flex items-center text-center p-2 mb-0 border-[2px] border-black rounded bg-gray-300 relative ${
                  manualMode ? 'cursor-move hover:bg-gray-400 transition-colors duration-200' : ''
                }`}
                style={{
                  height: '42px',
                  transition: 'all 0.15s ease'
                }}
                draggable={manualMode}
                onDragStart={manualMode ? (e) => handleDragStart(e, item, index) : undefined}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onContextMenu={(e) => {
                  if (isPreviousTeam(item)) {
                    console.error('Invalid player data structure:', item);
                  } else {
                    handleContextMenu(e, item);
                  }
                }}
              >
                <div className="flex-grow text-center font-bold">
                  {item.name}
                </div>
                
                {/* Wait time and games behind indicators */}
                {!manualMode && gameState.gameStartTime !== null && (
                  <>
                    {/* Only calculate and show if not in manual mode */}
                    {(() => {
                      const waitTimeInfo = calculateWaitTimeInfo(waitingQueue, index, elapsedMinutes);
                      return (
                        <>
                          <WaitTimeIndicator 
                            waitMinutes={waitTimeInfo.waitMinutes} 
                            color={waitTimeInfo.color} 
                          />
                          <GamesBehindIndicator 
                            gamesBehind={waitTimeInfo.gamesBehind} 
                            color={waitTimeInfo.color} 
                          />
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
            
            {/* Always show drop zone after each item in manual mode */}
            {manualMode && (
              <div
                className={`drop-zone border-dashed rounded text-center italic font-bold text-lg mt-1 ${
                  dragOverIndex === index + 1 ? 'border-[6px] border-white bg-gray-600 text-white' : 'border-2 border-black bg-gray-600 text-white'
                }`}
                style={{
                  height: '42px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  transition: 'border-width 0.15s ease-in-out, border-color 0.15s ease-in-out'
                }}
                onDragOver={(e) => handleDragOver(e, index + 1)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index + 1)}
              >
                Drop Zone
              </div>
            )}
          </div>
        ))}
        
        {/* Show empty slot placeholder when queue is empty, but ONLY if more than 10 players in system */}
        {waitingQueue.length === 0 && totalPlayers > 10 && (
          <div className="mb-1 w-full max-w-lg">
            <EmptySlot teamType="queue" />
          </div>
        )}
        
        {contextMenu && (
          <ContextMenu
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
            options={contextMenu.options}
          />
        )}
      </div>
    </div>
  );
};

export default WaitingQueue;
