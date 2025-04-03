import React from 'react';
import { GamesBehindCategory } from '../../types';
import { formatWaitTime } from '../../utils/waitTimeUtils';

interface WaitTimeProps {
  waitMinutes: number;
  color: string;
}

interface GamesBehindProps {
  gamesBehind: GamesBehindCategory;
  color: string;
}

export const WaitTimeIndicator: React.FC<WaitTimeProps> = ({ waitMinutes, color }) => {
  return (
    <div 
      className="absolute left-0 top-0 h-full flex items-center justify-center"
      style={{ transform: 'translateX(-280px)' }}
    >
      <div 
        className="border-[2px] border-black rounded bg-gray-300 flex items-center justify-center text-center font-bold"
        style={{ 
          backgroundColor: color,
          width: '220px',
          height: '32px',
          transition: 'all 0.15s ease'
        }}
      >
        {formatWaitTime(waitMinutes)}
      </div>
    </div>
  );
};

export const GamesBehindIndicator: React.FC<GamesBehindProps> = ({ gamesBehind, color }) => {
  return (
    <div 
      className="absolute right-0 top-0 h-full flex items-center justify-center"
      style={{ transform: 'translateX(280px)' }}
    >
      <div 
        className="border-[2px] border-black rounded bg-gray-300 flex items-center justify-center text-center font-bold"
        style={{ 
          backgroundColor: color,
          width: '220px',
          height: '32px',
          transition: 'all 0.15s ease'
        }}
      >
        {gamesBehind.toString()}
      </div>
    </div>
  );
};
