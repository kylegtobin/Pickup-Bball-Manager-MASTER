import React from 'react';
import { Player } from '../../types';

interface PlayerSlotProps {
  player?: Player;
  teamType: 'champions' | 'challengers';
  manualMode: boolean;
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent, player: Player) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onContextMenu?: (e: React.MouseEvent, playerId: string) => void;
}

const PlayerSlot: React.FC<PlayerSlotProps> = ({
  player,
  teamType,
  manualMode,
  isDragOver = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu
}) => {
  const isEmpty = !player;
  const bgColor = teamType === 'champions' ? 'bg-orange-50' : 'bg-blue-50';
  const hoverBgColor = teamType === 'champions' ? 'hover:bg-orange-100' : 'hover:bg-blue-100';
  
  // Special styling for empty slots in manual mode vs filled slots
  const slotStyle = isEmpty
    ? manualMode
      // Manual mode empty slot styling - same for both teams
      ? `border-dashed ${isDragOver ? 'border-[6px] border-white bg-gray-600 text-white' : 'border-2 border-black bg-gray-600 text-white'} italic font-bold`
      // Non-manual empty slot styling
      : `border-2 border-black ${bgColor}`
    // Filled slot styling
    : `border-2 border-black ${bgColor} font-bold`;
  
  return (
    <div
      className={`p-3 rounded text-center text-lg ${slotStyle} ${
        !isEmpty && manualMode ? `cursor-move ${hoverBgColor} transition-colors duration-200` : ''
      }`}
      style={{
        height: '42px', 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-width 0.15s ease-in-out, border-color 0.15s ease-in-out'
      }}
      draggable={!isEmpty && manualMode}
      onDragStart={player && onDragStart ? (e) => onDragStart(e, player) : undefined}
      onDragOver={isEmpty && manualMode && onDragOver ? onDragOver : undefined}
      onDragLeave={isEmpty && manualMode && onDragLeave ? onDragLeave : undefined}
      onDrop={isEmpty && manualMode && onDrop ? onDrop : undefined}
      onContextMenu={player && onContextMenu ? (e) => onContextMenu(e, player.id) : undefined}
    >
      {player ? player.name : (manualMode ? "Drop Zone" : "\u00A0")}
    </div>
  );
};

export default PlayerSlot;
