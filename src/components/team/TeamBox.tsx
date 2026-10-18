import React, { useState } from 'react';
import { useGame } from '../../context/GameContext';
import { Player } from '../../types';
import PlayerSlot from './PlayerSlot';
import Champions3Logo from '../../assets/images/Champions3.jpg';
import Challengers3Logo from '../../assets/images/Challengers3.jpg';
import { findSelection } from '../../utils/selection';

interface TeamBoxProps {
  title: string;
  team: Player[];
  type: 'champions' | 'challengers';
}

const TeamBox: React.FC<TeamBoxProps> = ({ title, team, type }) => {
  const { gameState, removePlayer, addPlayerToTeam, swapPlayers, selectedPlayerId, setSelectedPlayerId } = useGame();
  const { manualMode } = gameState;
  const [isDragOver, setIsDragOver] = useState(false);

  // Tap to move: a picked-up player can land in any open spot on this team
  const selection = findSelection(gameState, selectedPlayerId);
  const canLandHere = selection?.kind === 'player' && selection.where !== type && team.length < 5;
  const handleOpenSpotTap = () => {
    if (!canLandHere || selection?.kind !== 'player') return;
    addPlayerToTeam(selection.player.id, type);
    setSelectedPlayerId(null);
  };
  // With someone from the line or the other team picked up, tapping a player here swaps the two
  const canSwapHere = selection?.kind === 'player' && selection.where !== type;
  const handlePlayerTap = (player: Player) => {
    if (canSwapHere && selection?.kind === 'player') {
      swapPlayers(selection.player.id, player.id);
      setSelectedPlayerId(null);
      return;
    }
    setSelectedPlayerId(selectedPlayerId === player.id ? null : player.id);
  };
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playerId: string; options: { label: string; action: () => void }[] } | null>(null);

  const handleRemovePlayer = (player: Player) => {
    removePlayer(player.id);
    setContextMenu(null);
  };

  const handleBoxDragOver = (e: React.DragEvent) => {
    if (!manualMode) return;
    if (team.length >= 5) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleBoxDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleBoxDrop = (e: React.DragEvent) => {
    if (!manualMode) return;
    if (team.length >= 5) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const playerId = e.dataTransfer.getData('playerId');
    const playerType = e.dataTransfer.getData('type');
    const sourceTeam = e.dataTransfer.getData('sourceTeam');
    if (playerId && playerType === 'player' && sourceTeam !== type) {
      addPlayerToTeam(playerId, type);
    }
  };

  const handleSlotDragOver = (e: React.DragEvent) => {
    handleBoxDragOver(e);
  };

  const handleSlotDrop = (e: React.DragEvent) => {
    handleBoxDrop(e);
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

  const handleContextMenu = (e: React.MouseEvent, playerId: string) => {
    e.preventDefault();
    const player = team.find(p => p.id === playerId);
    if (!player) return;
    
    setContextMenu({
      playerId,
      x: e.clientX,
      y: e.clientY,
      options: [
        {
          label: `Remove ${player.name}`,
          action: () => handleRemovePlayer(player),
        },
      ],
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
      className={`rounded-lg px-4 pb-4 pt-2 border-t-[10px] ${
        type === 'champions' ? 'border-[#E85A00]' : 'border-[#1E3A8A]'
      } ${
        isDragOver && manualMode
          ? type === 'champions' ? 'bg-orange-50' : 'bg-blue-50'
          : 'bg-white'
      } transition-colors duration-200`}
      onDragOver={handleBoxDragOver}
      onDragLeave={handleBoxDragLeave}
      onDrop={handleBoxDrop}
    >
      <div className="relative flex justify-center mb-2">
        {type === 'champions' && gameState.championStreak >= 2 && (
          <span className="absolute right-0 top-1 whitespace-nowrap rounded-full bg-[#E85A00] text-white px-3 py-1 text-sm font-bold">
            {gameState.championStreak} straight wins
          </span>
        )}
        <img 
          src={type === 'champions' ? Champions3Logo : Challengers3Logo} 
          alt={type === 'champions' ? 'Champions' : 'Challengers'} 
          className="h-20 object-contain"
          style={{ mixBlendMode: 'multiply' }}
        />
      </div>
      <div className="space-y-2">
        {/* Render actual players */}
        {team.map((player, index) => (
          <PlayerSlot
            key={player.id}
            player={player}
            teamType={type}
            manualMode={manualMode}
            selected={selectedPlayerId === player.id}
            swapTarget={canSwapHere}
            onClick={() => handlePlayerTap(player)}
            onDragStart={handlePlayerDragStart}
            onContextMenu={handleContextMenu}
            isDragOver={false}
            onDragOver={handleSlotDragOver}
            onDragLeave={handleBoxDragLeave}
            onDrop={handleSlotDrop}
          />
        ))}
        
        {/* Render empty slots */}
        {team.length < 5 && Array(5 - team.length).fill(null).map((_, index) => (
          <PlayerSlot
            key={`empty-${index}`}
            teamType={type}
            manualMode={manualMode}
            isDragOver={isDragOver && index === 0}
            armed={canLandHere}
            onClick={handleOpenSpotTap}
            onDragOver={handleSlotDragOver}
            onDragLeave={handleBoxDragLeave}
            onDrop={handleSlotDrop}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white shadow-lg rounded-md border border-gray-200 py-1 min-w-[150px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.options.map((option, index) => (
            <button
              key={index}
              onClick={option.action}
              className="w-full text-center px-4 py-2 hover:bg-gray-100 text-red-600 font-bold text-base"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamBox;
