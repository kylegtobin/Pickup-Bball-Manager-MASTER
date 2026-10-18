import React from 'react';
import { GameRecord } from '../types';
import { endedByText } from '../utils/score';

const timeOf = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';

// Game by game: who won, the score when it was kept, who played, and any shootout that followed
const GameLedger: React.FC<{ games: GameRecord[] }> = ({ games }) => {
  if (games.length === 0) return <p className="text-gray-600">No games recorded.</p>;
  return (
    <ol className="space-y-3">
      {[...games].reverse().map(g => {
        const side = g.winner === 'champions' ? 'Champions' : 'Challengers';
        const score = g.final
          ? (() => {
              const w = g.final[g.winner];
              const l = g.final[g.winner === 'champions' ? 'challengers' : 'champions'];
              return `${w}–${l}`;
            })()
          : null;
        const how = g.endedBy && g.endedBy !== 'manual' ? endedByText(g.endedBy) : null;
        return (
          <li key={g.id ?? g.n} className="rounded-lg border border-[#E3E7EC] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-bold text-[#1B2430]">
                Game {g.n} · {side} won{score ? ` ${score}` : ''}
                {how && <span className="font-normal text-gray-500"> ({how})</span>}
              </span>
              <span className="text-sm text-gray-500">{timeOf(g.endedAt)}</span>
            </div>
            <p className="text-sm text-gray-700 mt-1"><span className="font-semibold">Won:</span> {g.winners.map(p => p.name).join(', ')}</p>
            <p className="text-sm text-gray-700"><span className="font-semibold">Lost:</span> {g.losers.map(p => p.name).join(', ')}</p>
            {g.shootout && (
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Shootout for {g.shootout.spots}:</span> {g.shootout.picked.map(p => p.name).join(', ')} won spots
                {g.shootout.shooters.length > g.shootout.picked.length && (
                  <> ({g.shootout.shooters.filter(s => !g.shootout!.picked.some(p => p.id === s.id)).map(p => p.name).join(', ')} went to the front)</>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export default GameLedger;
