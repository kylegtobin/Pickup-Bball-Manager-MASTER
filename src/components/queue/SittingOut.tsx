import React from 'react';
import { useGame, placeReturning } from '../../context/GameContext';
import { isPreviousTeam, Player } from '../../types';

const minutesAgo = (at: number, now: number) => {
  const m = Math.floor((now - at) / 60000);
  return m < 1 ? 'just now' : `${m} min`;
};

interface Row { player: Player; at: number; from: string; where: string }

// Everyone sitting out: people who stepped off the court, and people holding their place in line.
// Back puts them where they belong; Left means they went home.
const SittingOut: React.FC = () => {
  const { gameState, bringBack, sitterLeft } = useGame();
  const [now, setNow] = React.useState(Date.now());

  const filling = (gameState.status === 'INITIAL' || gameState.status === 'WAITING_FOR_PLAYERS')
    && (gameState.champions.length < 5 || gameState.challengers.length < 5);
  const rows: Row[] = [
    ...(gameState.sittingOut ?? []).map(e => {
      const goes = placeReturning(gameState, e);
      const where = goes.where === 'court' ? 'back to their spot on court'
        : filling ? 'onto the open team'
        : goes.where === 'group' ? 'back into their group'
        : goes.where === 'before' ? 'back to their place in line'
        : 'to the end of the line';
      const from = e.from === 'line' ? 'from the line' : `from ${e.from === 'champions' ? 'Champions' : 'Challengers'}`;
      return { player: e.player, at: e.at, from, where };
    }),
    ...gameState.waitingQueue.flatMap(item => {
      const inGroup = isPreviousTeam(item);
      return (inGroup ? item.players : [item]).filter(p => p.away).map(p => ({
        player: p,
        at: p.away as number,
        from: inGroup ? 'holding their spot in a group' : 'holding their spot in line',
        where: filling ? 'onto the open team' : 'right where they are',
      }));
    }),
  ];

  React.useEffect(() => {
    if (rows.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [rows.length]);

  if (rows.length === 0) return null;
  const busy = gameState.status === 'SHOOTOUT';

  return (
    <section aria-label="Sitting out" className="mt-4 rounded-lg bg-white border-t-[10px] border-[#F5B301] px-4 pb-4 pt-3">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg font-extrabold text-[#1B2430]">Sitting out</h2>
        <p className="text-sm text-gray-500">People waiting in line keep their place. If their turn comes while they're out, they move to the end of the line.</p>
      </div>
      <ul className="flex flex-col gap-2 max-w-[34rem] mx-auto">
        {rows.map(r => (
          <li key={r.player.id} className="flex items-center gap-3 rounded-md border border-[#D5DAE1] bg-[#FFFBEB] px-3 min-h-[46px] py-1">
            <span className="flex-1 min-w-0 truncate text-xl font-semibold text-[#1B2430]">{r.player.name}</span>
            <span className="text-sm text-gray-500 text-right leading-tight">
              {r.from} · {minutesAgo(r.at, now)}
              <br /><span className="text-gray-700">Back goes {r.where}</span>
            </span>
            <button
              type="button"
              disabled={busy}
              aria-label={`Bring ${r.player.name} back, ${r.where}`}
              onClick={() => bringBack(r.player.id)}
              className="h-9 px-3 rounded-md bg-[#1B2430] text-white font-bold hover:bg-black disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => sitterLeft(r.player.id)}
              aria-label={`${r.player.name} left`}
              className="h-9 px-3 rounded-md border border-[#D5DAE1] text-gray-700 font-semibold hover:bg-gray-50 disabled:opacity-40"
            >
              Left
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SittingOut;
