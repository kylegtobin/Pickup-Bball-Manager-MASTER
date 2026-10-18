import React, { useState } from 'react';
import { PreviousTeam as PreviousTeamType, Player } from '../../types';
import { useGame } from '../../context/GameContext';
import { findSelection, dropSpotClass, selectedClass } from '../../utils/selection';

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
  const { gameState, movePlayerIntoGroup, swapPlayers, selectedPlayerId, setSelectedPlayerId } = useGame();
  const selection = findSelection(gameState, selectedPlayerId);
  const groupSelected = selectedPlayerId === team.id;
  // A picked-up player from anywhere else can join this group if it has room
  const canJoin = selection?.kind === 'player' && selection.groupId !== team.id && team.players.length < 5;

  // A player picked up from the court swaps with whoever is tapped here
  const courtPicked = selection?.kind === 'player' && (selection.where === 'champions' || selection.where === 'challengers');
  const toggleSelect = (id: string) => {
    if (courtPicked && selection?.kind === 'player') { swapPlayers(selection.player.id, id); setSelectedPlayerId(null); return; }
    setSelectedPlayerId(selectedPlayerId === id ? null : id);
  };
  const handleJoinTap = () => {
    if (!canJoin || selection?.kind !== 'player') return;
    movePlayerIntoGroup(selection.player.id, team.id);
    setSelectedPlayerId(null);
  };
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

    if (type === 'player' && playerId) {
      movePlayerIntoGroup(playerId, team.id);
    }
  };

  return (
    <div
      className={`rounded-md pl-3 pr-2 pt-2 pb-2 border-l-[6px] ${groupSelected ? 'border-[#F5B301] ring-4 ring-[#F5B301]' : 'border-[#64748B]'} ${
        manualMode ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isDragOverState ? 'bg-blue-50' : groupSelected ? 'bg-amber-50' : 'bg-[#EEF1F5]'} w-full transition-all duration-150`}
      draggable={manualMode}
      onDragStart={handleTeamDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleTeamDrop}
    >
      {manualMode ? (
        <button
          type="button"
          onClick={() => toggleSelect(team.id)}
          aria-pressed={groupSelected}
          className="w-full flex items-center justify-between mb-2 text-base font-semibold text-gray-600 hover:text-[#1E3A8A]"
        >
          <span>Previous team</span>
          <span className="text-sm font-medium">{groupSelected ? 'Group picked up' : 'Tap to move the group'}</span>
        </button>
      ) : (
        <h3 className="font-semibold mb-2 text-base text-gray-600">Previous team</h3>
      )}
      <div className="space-y-2">
        {team.players.map((player, playerIndex) => (
          <div 
            key={`player-${player.id}`}
            className={`px-3 rounded-md text-center border border-[#D5DAE1] text-xl font-semibold select-none ${
              selectedPlayerId === player.id ? selectedClass : 'bg-white hover:bg-gray-50'
            } ${manualMode ? 'cursor-grab active:cursor-grabbing' : ''}`}
            style={{
              height: '46px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%'
            }}
            data-player-id={player.id}
            role={manualMode ? 'button' : undefined}
            aria-pressed={manualMode ? selectedPlayerId === player.id : undefined}
            onClick={manualMode ? (e) => { e.stopPropagation(); toggleSelect(player.id); } : undefined}
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
            className={`px-3 ${dropSpotClass(isDragOverDropZone, canJoin)}`}
            style={{
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%'
            }}
            role="button"
            onClick={(e) => { e.stopPropagation(); handleJoinTap(); }}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleTeamDrop}
          >
            {canJoin && selection?.kind === 'player' ? `Add ${selection.player.name} to this group` : 'Join this group'}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviousTeam;
