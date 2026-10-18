import React from 'react';
import { Player } from '../../types';
import { dropSpotClass, selectedClass } from '../../utils/selection';
import { activateOnKey } from '../../utils/visibility';

interface PlayerSlotProps {
  player?: Player;
  teamType: 'champions' | 'challengers';
  manualMode: boolean;
  isDragOver?: boolean;
  selected?: boolean; // this player is picked up in manual mode
  armed?: boolean; // someone is picked up and this open spot can take them
  swapTarget?: boolean; // someone is picked up and tapping this player swaps them
  onClick?: () => void;
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
  selected = false,
  armed = false,
  swapTarget = false,
  onClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu
}) => {
  const isEmpty = !player;
  const hoverBgColor = teamType === 'champions' ? 'hover:bg-orange-50' : 'hover:bg-blue-50';

  let look: string;
  if (isEmpty) {
    look = manualMode
      ? dropSpotClass(isDragOver, armed)
      : 'border border-dashed border-[#C9D0D9] bg-[#F7F8FA]';
  } else {
    look = `border ${swapTarget ? 'border-dashed border-[#1E3A8A]/50' : 'border-[#D5DAE1]'} text-xl font-semibold ${selected ? selectedClass : `bg-white ${hoverBgColor}`} ${
      manualMode ? 'cursor-grab active:cursor-grabbing' : ''
    }`;
  }

  return (
    <div
      className={`px-3 rounded-md text-center select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-[#1E3A8A]/50 ${look}`}
      style={{
        height: '46px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%'
      }}
      data-player-id={player?.id}
      role={manualMode ? 'button' : undefined}
      tabIndex={manualMode ? 0 : undefined}
      onKeyDown={manualMode ? activateOnKey(onClick) : undefined}
      aria-pressed={manualMode && player ? selected : undefined}
      aria-label={player && swapTarget ? `Swap with ${player.name}` : undefined}
      title={player && swapTarget ? `Swap with ${player.name}` : undefined}
      onClick={manualMode ? onClick : undefined}
      draggable={!isEmpty && manualMode}
      onDragStart={player && onDragStart ? (e) => onDragStart(e, player) : undefined}
      onDragOver={isEmpty && manualMode && onDragOver ? onDragOver : undefined}
      onDragLeave={isEmpty && manualMode && onDragLeave ? onDragLeave : undefined}
      onDrop={isEmpty && manualMode && onDrop ? onDrop : undefined}
      onContextMenu={player && onContextMenu ? (e) => onContextMenu(e, player.id) : undefined}
    >
      {player ? player.name : (manualMode ? 'Open spot' : ' ')}
    </div>
  );
};

export default PlayerSlot;
