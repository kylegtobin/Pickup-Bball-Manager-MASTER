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

// Pills sit in their own columns beside the line (see WaitingQueue), so they
// shrink with the screen instead of being pushed off the edge.
const pillClass =
  'w-full max-w-[200px] h-9 rounded-full flex items-center justify-center text-center text-lg font-bold text-[#1B2430]';

export const WaitTimeIndicator: React.FC<WaitTimeProps> = ({ waitMinutes, color }) => (
  <div className={pillClass} style={{ backgroundColor: color, transition: 'all 0.15s ease' }}>
    {formatWaitTime(waitMinutes)}
  </div>
);

export const GamesBehindIndicator: React.FC<GamesBehindProps> = ({ gamesBehind, color }) => (
  <div className={pillClass} style={{ backgroundColor: color, transition: 'all 0.15s ease' }}>
    {gamesBehind.toString()}
  </div>
);
