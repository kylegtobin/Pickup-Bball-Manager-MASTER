import React from 'react';

interface EmptySlotProps {
  teamType?: 'champions' | 'challengers' | 'queue';
}

const EmptySlot: React.FC<EmptySlotProps> = ({ teamType = 'queue' }) => {
  let bgColor = 'bg-[#F7F8FA]';
  
  if (teamType === 'champions') {
    bgColor = 'bg-[#F7F8FA]';
  } else if (teamType === 'challengers') {
    bgColor = 'bg-[#F7F8FA]';
  }
  
  return (
    <div 
      className={`px-3 rounded-md text-center border border-dashed border-[#C9D0D9] ${bgColor}`}
      style={{
        height: '46px', 
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
