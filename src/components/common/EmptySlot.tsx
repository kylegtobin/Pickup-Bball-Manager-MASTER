import React from 'react';

interface EmptySlotProps {
  teamType?: 'champions' | 'challengers' | 'queue';
}

const EmptySlot: React.FC<EmptySlotProps> = ({ teamType = 'queue' }) => {
  let bgColor = 'bg-gray-300';
  
  if (teamType === 'champions') {
    bgColor = 'bg-orange-50';
  } else if (teamType === 'challengers') {
    bgColor = 'bg-blue-50';
  }
  
  return (
    <div 
      className={`p-3 rounded text-center border-2 border-black ${bgColor}`}
      style={{
        height: '42px', 
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%'
      }}
    >
      &nbsp;
    </div>
  );
};

export default EmptySlot;
