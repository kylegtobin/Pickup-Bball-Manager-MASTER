import React from 'react';
import { useGame } from '../../context/GameContext';

const minutesAgo = (at: number, now: number) => {
  const m = Math.floor((now - at) / 60000);
  return m < 1 ? 'just now' : `${m} min`;
};

// People who stepped off for a bit. Back puts them where they belong; Left means they went home.
const SittingOut: React.FC = () => {
  const { gameState, bringBack, sitterLeft } = useGame();
  const list = gameState.sittingOut ?? [];
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    if (list.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [list.length]);

  if (list.length === 0) return null;
  const busy = gameState.status === 'SHOOTOUT';

  return (
    <section aria-label="Sitting out" className="mt-4 rounded-lg bg-white border-t-[10px] border-[#F5B301] px-4 pb-4 pt-3">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg font-extrabold text-[#1B2430]">Sitting out</h2>
        <p className="text-sm text-gray-500">Back keeps their place in line, or their open spot on court. Otherwise they go to the end of the line.</p>
      </div>
      <ul className="flex flex-col gap-2 max-w-[32rem] mx-auto">
        {list.map(e => (
          <li key={e.player.id} data-player-id={e.player.id} className="flex items-center gap-3 rounded-md border border-[#D5DAE1] bg-[#FFFBEB] px-3 h-[46px]">
            <span className="flex-1 min-w-0 truncate text-xl font-semibold text-[#1B2430]">{e.player.name}</span>
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {e.from === 'line' ? 'from the line' : `from ${e.from === 'champions' ? 'Champions' : 'Challengers'}`} · {minutesAgo(e.at, now)}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => bringBack(e.player.id)}
              className="h-9 px-3 rounded-md bg-[#1B2430] text-white font-bold hover:bg-black disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => sitterLeft(e.player.id)}
              aria-label={`${e.player.name} left`}
              className="h-9 px-3 rounded-md border border-[#D5DAE1] text-gray-700 font-semibold hover:bg-gray-50"
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
