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
  const hoverBgColor = teamType === 'champions' ? 'hover:bg-orange-50' : 'hover:bg-blue-50';
  
  // Empty slots: manual mode shows a dark drop zone, otherwise a quiet dashed placeholder
  const slotStyle = manualMode
    ? `border-dashed ${isDragOver ? 'border-[6px] border-white bg-gray-600 text-white' : 'border-2 border-black bg-gray-600 text-white'} italic font-bold`
    : 'border border-dashed border-[#C9D0D9] bg-[#F7F8FA]';
  
  return (
    <div
      className={`px-3 rounded-md text-center ${isEmpty ? slotStyle : `border border-[#D5DAE1] bg-white ${hoverBgColor} ${isDragOver ? 'border-blue-500 border-[6px]' : ''} text-xl font-semibold`}`}
      style={{
        height: '46px', 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-width 0.15s ease-in-out, border-color 0.15s ease-in-out',
        cursor: !isEmpty && manualMode ? 'move' : 'default',
        width: '100%'
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
