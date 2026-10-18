import React, { useRef, useState } from 'react';
import { useGame } from '../../context/GameContext';
import { isPreviousTeam, WaitingQueueItem, Player } from '../../types';
import ContextMenu from '../ContextMenu';
import PreviousTeam from './PreviousTeam';
import EmptySlot from '../common/EmptySlot';
import WaitingQueueLogo from '../../assets/images/WaitingQueue.jpg';
import { calculateWaitTimeInfo } from '../../utils/waitTimeUtils';
import { WaitTimeIndicator, GamesBehindIndicator } from './WaitTimeIndicators';
import { activateOnKey } from '../../utils/visibility';
import { findSelection, dropSpotClass, selectedClass } from '../../utils/selection';

const WaitingQueue: React.FC = () => {
  const { gameState, removePlayer, movePlayer, moveTeam, swapPlayers, selectedPlayerId, setSelectedPlayerId } = useGame();
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

    if (type === 'player') {
      const playerId = e.dataTransfer.getData('playerId');
      movePlayer(playerId, index);
    } else if (type === 'team') {
      const teamId = e.dataTransfer.getData('teamId');
      moveTeam(teamId, index);
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

  const showTimes = !manualMode && gameState.gameStartTime !== null;
  // Three columns: wait time | the line | games until up. The side columns
  // shrink with the screen, so nothing gets pushed off the edge on a tablet.
  const rowGrid = 'grid grid-cols-[minmax(0,1fr)_minmax(0,32rem)_minmax(0,1fr)] gap-4';

  // Tap to move: whatever is picked up (a player or a whole group) can land on any spot in the line
  const selection = findSelection(gameState, selectedPlayerId);
  const handleSpotTap = (zoneIndex: number) => {
    if (!selection || isNoOpSpot(zoneIndex)) return;
    if (selection.kind === 'group') moveTeam(selection.group.id, zoneIndex);
    else movePlayer(selection.player.id, zoneIndex);
    setSelectedPlayerId(null);
  };

  // The spots right above and below the picked-up item wouldn't move it, so they stay quiet
  const pickedIndex = selection
    ? waitingQueue.findIndex(item =>
        selection.kind === 'group' ? item.id === selection.group.id : selection.where === 'line' && item.id === selection.player.id)
    : -1;
  // A player picked up from the court swaps with whoever is tapped in line
  const courtPicked = selection?.kind === 'player' && (selection.where === 'champions' || selection.where === 'challengers');
  const tapLinePlayer = (id: string) => {
    if (courtPicked && selection?.kind === 'player') { swapPlayers(selection.player.id, id); setSelectedPlayerId(null); return; }
    setSelectedPlayerId(selectedPlayerId === id ? null : id);
  };
  const isNoOpSpot = (zoneIndex: number) => pickedIndex !== -1 && (zoneIndex === pickedIndex || zoneIndex === pickedIndex + 1);

  const dropZone = (zoneIndex: number, extraClass = '') => (
    <div
      className={`focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1E3A8A]/50 ${dropSpotClass(dragOverIndex === zoneIndex, !!selection && !isNoOpSpot(zoneIndex))} ${extraClass}`}
      style={{
        height: '38px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%'
      }}
      role="button"
      tabIndex={0}
      onKeyDown={activateOnKey(() => handleSpotTap(zoneIndex))}
      onClick={() => handleSpotTap(zoneIndex)}
      onDragOver={(e) => handleDragOver(e, zoneIndex)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, zoneIndex)}
    >
      {selection && !isNoOpSpot(zoneIndex) ? `Move ${selection.kind === 'group' ? 'group' : selection.player.name} here` : 'Move here'}
    </div>
  );

  return (
    <div 
      className="rounded-lg px-4 pb-4 pt-2 bg-white border-t-[10px] border-[#64748B]"
      ref={queueRef}
      onContextMenu={handleContainerContextMenu}
    >
      <div className="flex justify-center mb-2">
        <img 
          src={WaitingQueueLogo} 
          alt="Waiting Queue" 
          className="h-20 object-contain"
          style={{ mixBlendMode: 'multiply' }}
        />
      </div>

      {showTimes && waitingQueue.length > 0 && (
        <div className={`${rowGrid} mb-2 text-base font-semibold text-gray-600`}>
          <div className="text-center">Estimated wait</div>
          <div />
          <div className="text-center">Games until up</div>
        </div>
      )}

      <div className="flex flex-col">
        {/* Always show first drop zone in manual mode */}
        {manualMode && (
          <div className={`${rowGrid} mb-2`}>
            <div />
            {dropZone(0)}
            <div />
          </div>
        )}
        
        {/* Render queue items */}
        {waitingQueue.map((item, index) => {
          const waitTimeInfo = showTimes ? calculateWaitTimeInfo(waitingQueue, index, elapsedMinutes) : null;
          return (
          <div key={isPreviousTeam(item) ? `team-${item.id}` : `player-${item.id}`} className={`${rowGrid} items-center mb-2`}>
            <div className="flex justify-center">
              {waitTimeInfo && <WaitTimeIndicator waitMinutes={waitTimeInfo.waitMinutes} color={waitTimeInfo.color} />}
            </div>

            <div>
            {isPreviousTeam(item) ? (
              <div 
                className={`w-full relative rounded-md ${dragOverIndex === index ? 'ring-4 ring-[#1E3A8A]/40' : ''}`}
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
              </div>
            ) : (
              <div
                key={item.id}
                className={`px-3 rounded-md text-center border border-[#D5DAE1] text-xl font-semibold select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1E3A8A]/50 ${
                  selectedPlayerId === item.id ? selectedClass : 'bg-white hover:bg-gray-50'
                } ${manualMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                style={{
                  height: '46px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%'
                }}
                data-player-id={item.id}
                role={manualMode ? 'button' : undefined}
                tabIndex={manualMode ? 0 : undefined}
                aria-pressed={manualMode ? selectedPlayerId === item.id : undefined}
                title={manualMode && courtPicked && !item.away ? `Swap with ${item.name}` : undefined}
                onKeyDown={manualMode ? activateOnKey(() => tapLinePlayer(item.id)) : undefined}
                onClick={manualMode ? () => tapLinePlayer(item.id) : undefined}
                draggable={manualMode}
                onDragStart={manualMode ? (e) => handleDragStart(e, item, index) : undefined}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <span className={item.away ? 'text-gray-400' : ''}>{item.name}</span>{item.away && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-800">sitting out</span>}
              </div>
            )}

            {/* Always show drop zone after each item in manual mode */}
            {manualMode && dropZone(index + 1, 'mt-2')}
            </div>

            <div className="flex justify-center">
              {waitTimeInfo && <GamesBehindIndicator gamesBehind={waitTimeInfo.gamesBehind} color={waitTimeInfo.color} />}
            </div>
          </div>
          );
        })}
        
        {/* Show empty slot placeholder when queue is empty, but ONLY if more than 10 players in system */}
        {waitingQueue.length === 0 && totalPlayers > 10 && (
          <div className={`${rowGrid} mb-2`}>
            <div />
            <EmptySlot teamType="queue" />
            <div />
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
