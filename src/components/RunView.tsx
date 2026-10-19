import React from 'react';
import { fetchRunView, RunView as View, ViewGame, FetchResult } from '../cloud/runView';
import { playerLines, nightAwards, gamesFor, PlayerLine } from '../cloud/playerStats';
import { saveLastRunToken, lastRunToken } from '../cloud/config';
import CodeEntry from './CodeEntry';
import { PublicState, PublicPlayer, PublicQueueItem } from '../cloud/publicState';
import { previewNextUp } from '../utils/formChallengers';
import { calculateGamesBehindIndividual } from '../utils/waitTimeUtils';
import { decide, timeLeft, clockState, formatClock, endedByText, Clock } from '../utils/score';
import { joinNames, awardNames } from '../utils/nightStats';
import { WaitingQueueItem } from '../types';

// The phone page for a run link (?run=…): what's on the courtside screen, live, plus the run's stats.
// Read-only. Anyone with the link can see it; the runner can reset the link from the courtside screen.

const POLL_MS = 5000;
const LIVE_WITHIN_MS = 90000; // The courtside screen checks in every 45 seconds
const NIGHT_IS_OLD_MS = 12 * 60 * 60 * 1000;

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} days ago`;
};
const dayName = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
const elapsed = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const asQueue = (q: PublicQueueItem[]) => q as unknown as WaitingQueueItem[];

const Card: React.FC<{ title?: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }> = ({ title, children, className = '', aside }) => (
  <section className={`rounded-2xl bg-white border border-[#D5DAE1] p-4 ${className}`}>
    {title && (
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-lg font-extrabold text-[#1B2430]">{title}</h2>
        {aside}
      </div>
    )}
    {children}
  </section>
);

const Names: React.FC<{ players: PublicPlayer[]; color: string; label: string; score?: number | null; streak?: number }> = ({ players, color, label, score, streak }) => (
  <div className="flex-1 min-w-0">
    <div className="flex items-end justify-between gap-2 border-b-4 pb-1 mb-2" style={{ borderColor: color }}>
      <h3 className="font-extrabold text-base" style={{ color }}>{label}</h3>
      {score !== undefined && score !== null && <span className="text-3xl font-black tabular-nums leading-none" aria-label={`${label} score`}>{score}</span>}
    </div>
    {streak !== undefined && streak >= 2 && (
      <p className="mb-1.5 inline-block rounded-full bg-[#E85A00] text-white px-2.5 py-0.5 text-xs font-bold">{streak} straight wins</p>
    )}
    <ol className="space-y-1">
      {players.map(p => <li key={p.id} className="text-base font-semibold truncate">{p.name}</li>)}
      {Array.from({ length: Math.max(0, 5 - players.length) }).map((_, i) => <li key={i} className="text-base text-gray-400">Open spot</li>)}
    </ol>
  </div>
);

const StatsTable: React.FC<{ rows: PlayerLine[]; empty: string; onPick: (name: string) => void }> = ({ rows, empty, onPick }) => {
  const [all, setAll] = React.useState(false);
  if (rows.length === 0) return <p className="text-gray-600">{empty}</p>;
  const shown = all ? rows : rows.slice(0, 10);
  return (
    <>
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500">
            <th className="py-1 font-semibold">Player</th>
            <th className="py-1 pl-4 font-semibold text-right">Record</th>
            <th className="py-1 pl-4 font-semibold text-right">Win %</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(r => (
            <tr key={r.key} className="border-t border-gray-100">
              <td className="py-1.5 max-w-0 w-full">
                <button onClick={() => onPick(r.name)} className="font-semibold text-[#1E3A8A] truncate max-w-full text-left underline decoration-[#1E3A8A]/30 underline-offset-2">{r.name}</button>
              </td>
              <td className="py-1.5 pl-4 text-right tabular-nums whitespace-nowrap">{r.wins}–{r.losses}</td>
              <td className="py-1.5 pl-4 text-right tabular-nums text-gray-600">{r.winPct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex justify-between items-center">
        <span className="text-xs text-gray-500">Tap a name for their stats.</span>
        {rows.length > 10 && (
          <button onClick={() => setAll(a => !a)} className="text-sm font-bold text-[#1E3A8A]">{all ? 'Show top 10' : `Show all ${rows.length}`}</button>
        )}
      </div>
    </>
  );
};

const Tile: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="rounded-xl bg-[#EDEFF2] px-3 py-2 min-w-0">
    <p className="text-xs font-semibold text-gray-500">{label}</p>
    <p className="text-2xl font-black tabular-nums leading-tight truncate">{value}</p>
  </div>
);
const Row: React.FC<{ label: string; value: React.ReactNode; note?: string }> = ({ label, value, note }) => (
  <div className="flex items-baseline justify-between gap-3 border-t border-gray-100 py-2">
    <span className="text-gray-700">{label}{note && <span className="block text-xs text-gray-500">{note}</span>}</span>
    <span className="font-bold tabular-nums text-right">{value}</span>
  </div>
);

const PlayerPage: React.FC<{ name: string; all: ViewGame[]; tonight: ViewGame[]; tonightLabel: string; onBack: () => void }> = ({ name, all, tonight, tonightLabel, onBack }) => {
  const key = name.trim().toLowerCase();
  const life = playerLines(all).find(l => l.key === key);
  const night = playerLines(tonight).find(l => l.key === key);
  const mine = gamesFor(all, name).slice(0, 10);
  React.useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <>
      <button onClick={onBack} className="text-[#1E3A8A] font-bold">‹ Back to the run</button>
      <h2 className="text-3xl font-black leading-tight">{life?.name ?? name}</h2>
      {night && (
        <Card title={tonightLabel}>
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Record" value={`${night.wins}–${night.losses}`} />
            <Tile label="Win %" value={`${night.winPct}%`} />
            <Tile label="Games" value={night.games} />
            <Tile label="Best streak" value={night.bestStreak >= 2 ? `${night.bestStreak} straight` : night.bestStreak === 1 ? '1 win' : '—'} />
          </div>
        </Card>
      )}
      {life ? (
        <Card title="All runs">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Tile label="Record" value={`${life.wins}–${life.losses}`} />
            <Tile label="Win %" value={`${life.winPct}%`} />
            <Tile label="Games" value={life.games} />
            <Tile label="Days played" value={life.days} />
          </div>
          <Row label="Best streak" note="Wins in a row in one night" value={life.bestStreak >= 2 ? `${life.bestStreak} straight` : life.bestStreak} />
          <Row label="Most wins in a night" value={life.mostWinsInNight} />
          <Row label="Wins as Challengers" note="Beating the team on the court" value={life.winsAsChallengers} />
          {life.together && <Row label="Most wins together" value={`${life.together.name} (${life.together.wins})`} />}
          {life.shootouts > 0 && <Row label="Shootouts" value={`Made it ${life.shootoutsPicked} of ${life.shootouts}`} />}
          {life.scoredGames > 0 && (
            <>
              <Row label="Team points while playing" note={`Per game, from ${life.scoredGames} ${life.scoredGames === 1 ? 'game' : 'games'} with a score`}
                value={`${(life.pointsFor / life.scoredGames).toFixed(1)} – ${(life.pointsAgainst / life.scoredGames).toFixed(1)}`} />
              {life.closeWins + life.closeLosses > 0 && <Row label="Close games" note="Decided by 2 or fewer" value={`${life.closeWins}–${life.closeLosses}`} />}
            </>
          )}
        </Card>
      ) : (
        <Card><p className="text-gray-600">No games for {name} yet.</p></Card>
      )}
      {mine.length > 0 && (
        <Card title="Recent games">
          <ol>{mine.map(g => <GameRow key={g.id} g={g} />)}</ol>
        </Card>
      )}
    </>
  );
};

const Awards: React.FC<{ games: ViewGame[] }> = ({ games }) => {
  const awards = nightAwards(games);
  if (!awards.length) return null;
  return (
    <div className="grid grid-cols-3 gap-2 mb-3">
      {awards.map(a => (
        <div key={a.title} className="rounded-xl bg-[#FFF3EA] border border-[#FFD2B5] px-2.5 py-2 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#C94E00]">{a.title}</p>
          <p className="text-sm font-bold leading-tight line-clamp-2">{awardNames(a.names)}</p>
          <p className="text-xs text-gray-600">{a.value}</p>
        </div>
      ))}
    </div>
  );
};

const GameRow: React.FC<{ g: ViewGame }> = ({ g }) => {
  const champs = g.winner === 'champions';
  const score = g.final ? `${Math.max(g.final.champions, g.final.challengers)}–${Math.min(g.final.champions, g.final.challengers)}` : null;
  const how = endedByText(g.endedBy);
  return (
    <li className="border-t border-gray-100 py-2">
      <p className="font-bold">
        <span className="text-gray-500 font-semibold">Game {g.n}</span>{' · '}
        <span style={{ color: champs ? '#C94E00' : '#1E3A8A' }}>{champs ? 'Champions' : 'Challengers'} won</span>
        {score && <span className="tabular-nums"> {score}</span>}
        {how && <span className="text-gray-500 font-normal text-sm"> · {how}</span>}
      </p>
      <p className="text-sm text-gray-600 truncate">{g.winners.map(p => p.name).join(', ')}</p>
      {g.shootout && g.shootout.picked.length > 0 && (
        <p className="text-sm text-gray-500">Shootout: {joinNames(g.shootout.picked.map(p => p.name), 4)} made it</p>
      )}
    </li>
  );
};

type Where =
  | { kind: 'next' }
  | { kind: 'shootout'; spots: number }
  | { kind: 'later'; games: number | string }
  | { kind: 'filling' }
  | { kind: 'waiting' };

// Where everyone in line stands, worked out the same way the courtside screen fills the next game
// (so a group that has to shoot for spots is never promised the next game)
export const lineStatus = (s: PublicState): Map<string, Where> => {
  const out = new Map<string, Where>();
  const all = s.waitingQueue.flatMap(i => ('players' in i ? i.players : [i]));
  const teamsFull = s.champions.length === 5 && s.challengers.length === 5;
  if (!teamsFull) {
    const filling = s.champions.length + s.challengers.length + all.length >= 10;
    all.forEach(p => out.set(p.id, filling ? { kind: 'filling' } : { kind: 'waiting' }));
    return out;
  }
  const next = previewNextUp(asQueue(s.waitingQueue));
  const picked = new Set(next.picked.map(p => p.id));
  const shooters = new Set((next.shootout?.players ?? []).map(p => p.id));
  let ahead = 0;
  s.waitingQueue.forEach(item => {
    const players = 'players' in item ? item.players : [item];
    players.forEach(p => {
      if (picked.has(p.id)) out.set(p.id, { kind: 'next' });
      else if (shooters.has(p.id)) out.set(p.id, { kind: 'shootout', spots: next.shootout!.spots });
      else {
        const g = calculateGamesBehindIndividual(ahead);
        out.set(p.id, { kind: 'later', games: g === 1 ? 2 : g });
      }
    });
    ahead += players.length;
  });
  return out;
};

const spots = (n: number) => `${n} ${n === 1 ? 'spot' : 'spots'}`;

// Where someone is right now, from what the courtside screen shows
const spotFor = (s: PublicState, name: string): string => {
  const k = name.trim().toLowerCase();
  const is = (p: PublicPlayer) => p.name.trim().toLowerCase() === k;
  if (s.champions.some(is)) return 'On the Champions now';
  if (s.challengers.some(is)) return 'On the Challengers now';
  const me = s.waitingQueue.flatMap(i => ('players' in i ? i.players : [i])).find(is);
  if (me) {
    const w = lineStatus(s).get(me.id);
    switch (w?.kind) {
      case 'next': return 'Up next game';
      case 'shootout': return `Shooting for ${spots(w.spots)} next game`;
      case 'later': return `${w.games} games away`;
      case 'filling': return 'In line. A spot on court is open and the runner is filling it.';
      default: return 'In line. Teams fill as players sign in.';
    }
  }
  return s.playersTonight.some(n => n.trim().toLowerCase() === k) ? 'Signed in earlier, not in line now' : 'Not signed in';
};

const FindMe: React.FC<{ state: PublicState; token: string }> = ({ state, token }) => {
  // Remembered per run, so a phone that follows two runs keeps the right name for each
  const key = `pbm-run-me-${token}`;
  const [q, setQ] = React.useState(() => { try { return window.localStorage.getItem(key) ?? window.localStorage.getItem('pbm-run-me') ?? ''; } catch { return ''; } });
  React.useEffect(() => { try { window.localStorage.setItem(key, q); } catch { /* fine */ } }, [q, key]);
  const everyone = Array.from(new Set([
    ...state.champions, ...state.challengers,
    ...state.waitingQueue.flatMap(i => ('players' in i ? i.players : [i])),
  ].map(p => p.name)));
  const typed = q.trim().toLowerCase();
  const matches = typed ? everyone.filter(n => n.toLowerCase().includes(typed)).slice(0, 4) : [];
  return (
    <Card title="Where am I?">
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Type your name"
        aria-label="Type your name"
        autoComplete="off"
        className="w-full px-3 py-2.5 text-lg bg-white border border-[#D5DAE1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]"
      />
      {typed && (
        <ul className="mt-3 space-y-1.5" aria-live="polite">
          {matches.length === 0 && <li className="text-gray-600">{spotFor(state, q)}</li>}
          {matches.map(n => (
            <li key={n} className="flex justify-between gap-3">
              <span className="font-bold truncate">{n}</span>
              <span className="text-gray-700 text-right">{spotFor(state, n)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const Line: React.FC<{ state: PublicState }> = ({ state }) => {
  const status = lineStatus(state);
  let n = 0;
  let lastLabel = '';
  const rows: React.ReactNode[] = [];
  state.waitingQueue.forEach(item => {
    const players = 'players' in item ? item.players : [item];
    const group = 'players' in item;
    // How far away, said once wherever it changes
    const w = players.map(p => status.get(p.id)).find(Boolean);
    const label = !w ? '' : w.kind === 'next' ? 'Next game' : w.kind === 'shootout' ? `Next game: shootout for ${spots(w.spots)}` : w.kind === 'later' ? `${w.games} games away` : '';
    if (label && label !== lastLabel) {
      rows.push(<li key={`h-${item.id}`} className="pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</li>);
      lastLabel = label;
    }
    rows.push(
      <li key={item.id} className={`py-1.5 border-t border-gray-100 ${group ? 'pl-3 border-l-4 border-l-[#1E3A8A]/30' : ''}`}>
        {group && <p className="text-xs font-semibold text-gray-500">A team that just played</p>}
        {players.map(p => {
          n += 1;
          return (
            <div key={p.id} className="flex items-center gap-3 py-0.5">
              <span className="w-6 text-right tabular-nums text-gray-400 text-sm">{n}</span>
              <span className="flex-1 truncate font-semibold">{p.name}</span>
            </div>
          );
        })}
      </li>
    );
  });
  return (
    <Card title="The line" aside={<span className="text-sm text-gray-500">{n} waiting</span>}>
      {rows.length === 0 ? <p className="text-gray-600">Nobody's waiting.</p> : <ol className="-mt-2">{rows}</ol>}
    </Card>
  );
};

const NowPlaying: React.FC<{ state: PublicState; skewMs: number; now: number }> = ({ state, skewMs, now }) => {
  // Line the courtside clock up with this phone's
  const clock: Clock = { ...state.clock, runningSince: state.clock.runningSince === null ? null : state.clock.runningSince + skewMs };
  const startedAt = state.gameStartTime === null ? null : state.gameStartTime + skewMs;
  const gameOn = state.champions.length === 5 && state.challengers.length === 5;
  const cState = clockState(clock, now);
  const scoring = gameOn && (cState !== 'not-started' || state.score.champions + state.score.challengers > 0);
  const outcome = decide(state.score, clock, now);
  const available = state.waitingQueue.flatMap(i => ('players' in i ? i.players : [i])).length;
  const filling = !gameOn && state.champions.length + state.challengers.length + available >= 10;
  const note = !scoring ? null
    : outcome.nextBucket ? 'Time. Next bucket wins'
    : outcome.winner ? `${outcome.winner === 'champions' ? 'Champions' : 'Challengers'} win`
    : cState === 'time' ? 'Time' : cState === 'paused' ? 'Paused' : 'Time left';
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-extrabold">{gameOn ? 'Now playing' : filling ? 'A spot on court is open' : 'Waiting for 10 players'}</h2>
        {gameOn && (scoring ? (
          <div className="text-right">
            <div className={`text-xs font-semibold ${outcome.nextBucket ? 'text-[#C98A00]' : 'text-gray-500'}`}>{note}</div>
            <div className={`text-3xl font-black tabular-nums leading-none ${cState === 'time' ? 'text-red-600' : ''}`}>{formatClock(timeLeft(clock, now))}</div>
          </div>
        ) : startedAt ? (
          <div className="text-right">
            {/* The scoreboard clock isn't running, so this counts up from tip-off */}
            <div className="text-xs font-semibold text-gray-500">Playing for</div>
            <div className="text-3xl font-black tabular-nums leading-none">{elapsed(now - startedAt)}</div>
          </div>
        ) : null)}
      </div>
      <div className="flex gap-4">
        <Names players={state.champions} color="#E85A00" label="Champions" score={scoring ? state.score.champions : null} streak={state.championStreak} />
        <Names players={state.challengers} color="#1E3A8A" label="Challengers" score={scoring ? state.score.challengers : null} />
      </div>
    </Card>
  );
};

const NextUp: React.FC<{ state: PublicState }> = ({ state }) => {
  const gameOn = state.champions.length === 5 && state.challengers.length === 5;
  if (!gameOn) return null;
  const next = previewNextUp(asQueue(state.waitingQueue));
  return (
    <Card title="Next up" aside={<span className="text-sm text-gray-500">Plays the winner</span>}>
      {next.losersFill === 5 ? (
        <p className="font-semibold">Same teams run it back. Nobody's waiting.</p>
      ) : (
        <>
          <ol className="space-y-1">{next.picked.map(p => <li key={p.id} className="font-semibold">{p.name}</li>)}</ol>
          {next.shootout && (
            <p className="mt-2 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2 text-sm">
              <strong>Shootout for {next.shootout.spots} {next.shootout.spots === 1 ? 'spot' : 'spots'}:</strong>{' '}
              {next.shootout.players ? joinNames(next.shootout.players.map(p => p.name), 6) : "this game's losing team shoots"}
            </p>
          )}
          {next.losersFill > 0 && next.losersFill < 5 && (
            <p className="mt-2 text-sm text-gray-600">Plus {next.losersFill} from this game's losing team.</p>
          )}
        </>
      )}
    </Card>
  );
};

const RunView: React.FC<{ token: string; fetcher?: (t: string) => Promise<FetchResult>; onRunGone?: () => void }> = ({ token, fetcher = fetchRunView, onRunGone }) => {
  const [view, setView] = React.useState<View | null>(null);
  const [problem, setProblem] = React.useState<'gone' | 'offline' | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [tab, setTab] = React.useState<'tonight' | 'all'>('tonight');
  const [player, setPlayer] = React.useState<string | null>(null);
  const [switching, setSwitching] = React.useState(false);

  React.useEffect(() => {
    document.title = 'Live run · Pickup Basketball Manager';
    // Keep run pages out of search results
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  React.useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let asked = 0; // requests sent
    let shown = 0; // newest request whose answer is on screen
    const load = async () => {
      if (timer) { clearTimeout(timer); timer = null; }
      const mine = ++asked;
      const r = await fetcher(token);
      // A slow answer to an older request never replaces a newer one
      if (stop || mine < shown) return;
      shown = mine;
      if (r.ok) { setView(r.view); setProblem(null); saveLastRunToken(token); }
      else {
        setProblem(r.reason);
        // This phone won't keep opening a link that stopped working
        if (r.reason === 'gone' && lastRunToken() === token) saveLastRunToken(null);
      }
      if (mine === asked && !(r.ok === false && r.reason === 'gone') && document.visibilityState !== 'hidden') timer = setTimeout(load, POLL_MS);
    };
    // Paused while the phone is locked or in another app; catches up straight away when it's back
    const onShow = () => { if (document.visibilityState === 'visible') void load(); };
    void load();
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', onShow);
    return () => { stop = true; if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('online', onShow); };
  }, [token, fetcher]);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const shell = (children: React.ReactNode, sub?: React.ReactNode) => (
    <div className="min-h-screen bg-[#EDEFF2] text-[#1B2430]">
      <header className="bg-[#0E1A33] text-white px-4 pt-4 pb-3">
        <div className="max-w-xl mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#F5B301]">Pickup Basketball Manager</p>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-black leading-tight mt-0.5 min-w-0">{view?.run.name ?? 'Live run'}</h1>
            <button onClick={() => setSwitching(v => !v)} aria-expanded={switching} className="shrink-0 mt-1 rounded-lg border border-white/30 px-2.5 py-1 text-sm font-semibold text-white/90">Switch run</button>
          </div>
          {sub}
          {switching && (
            <div className="mt-3 rounded-xl bg-white text-[#1B2430] p-3">
              <CodeEntry autoFocus onFound={t => { saveLastRunToken(t); window.location.assign(`${window.location.pathname}?run=${t}`); }} />
            </div>
          )}
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-4 space-y-4">{children}</main>
    </div>
  );

  if (problem === 'gone') {
    if (onRunGone) { onRunGone(); return null; }
    return shell(
      <Card>
        <p className="text-lg font-bold">This link doesn't work anymore.</p>
        <p className="text-gray-600 mt-1">The runner may have made a new one. Type the code from the court screen, or scan its QR code.</p>
        <div className="mt-3"><CodeEntry onFound={t => window.location.assign(`${window.location.pathname}?run=${t}`)} /></div>
      </Card>
    );
  }
  if (!view) {
    return shell(
      <Card>
        <p className="text-gray-600" role="status">{problem === 'offline' ? "Can't reach the court right now. Trying again…" : 'Loading the run…'}</p>
      </Card>
    );
  }

  const night = view.night;
  const state = night?.state ?? null;
  const lastHeardServer = Math.max(night?.updatedAt ?? 0, view.run.courtSeenAt ?? 0);
  const courtAge = now - (lastHeardServer + view.serverOffsetMs);
  const ended = !!night?.endedAt;
  const old = !night || (now - (night.updatedAt + view.serverOffsetMs) > NIGHT_IS_OLD_MS);
  const live = !!state && !ended && !old && courtAge < LIVE_WITHIN_MS;

  const sub = (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {view.run.gym && <span className="text-white/70">{view.run.gym}</span>}
      {view.run.code && <span className="text-white/70">Code <span className="font-black tracking-wider text-white">{view.run.code}</span></span>}
      {problem === 'offline' ? (
        <span className="inline-flex items-center gap-1.5 text-white/80"><span className="h-2 w-2 rounded-full bg-gray-400" />Reconnecting…</span>
      ) : live ? (
        <span className="inline-flex items-center gap-1.5 font-bold text-[#22C55E]"><span className="h-2 w-2 rounded-full bg-[#22C55E] pbm-live-dot" />Live</span>
      ) : state && !ended && !old ? (
        <span className="text-[#F5B301] font-semibold">Court screen last seen {ago(courtAge)}</span>
      ) : null}
    </div>
  );

  const tonightGames = night ? view.games.filter(g => g.nightId === night.id) : [];
  const nights = new Set(view.games.map(g => g.nightId)).size;
  const tonightLabel = (old || ended) && night?.startedAt ? dayName(night.startedAt + view.serverOffsetMs) : 'Tonight';

  if (player) {
    return shell(<PlayerPage name={player} all={view.games} tonight={tonightGames} tonightLabel={tonightLabel} onBack={() => setPlayer(null)} />, sub);
  }

  return shell(
    <>
      {state && !ended && !old ? (
        <>
          <FindMe state={state} token={token} />
          {state.shootout && (
            <section className="rounded-2xl bg-[#0E1A33] text-white p-4" role="status">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#F5B301]">3-point shootout</p>
              <p className="text-xl font-black mt-1">{state.shootout.spots} {state.shootout.spots === 1 ? 'spot' : 'spots'} up for grabs</p>
              <p className="mt-1 text-white/85">{joinNames(state.shootout.players.map(p => p.name), 8)}</p>
            </section>
          )}
          <NowPlaying state={state} skewMs={view.skewMs} now={now} />
          <NextUp state={state} />
          <Line state={state} />
        </>
      ) : (
        <Card>
          <p className="text-lg font-bold">{ended ? 'Tonight has ended.' : 'No run going right now.'}</p>
          <p className="text-gray-600 mt-1">
            {night?.startedAt ? `Last run: ${dayName(night.startedAt + view.serverOffsetMs)}. ` : ''}
            This page updates on its own when the next one starts.
          </p>
        </Card>
      )}

      <Card
        title="Stats"
        aside={
          <div className="inline-flex rounded-lg border border-[#D5DAE1] overflow-hidden text-sm font-bold" role="tablist">
            <button role="tab" aria-selected={tab === 'tonight'} onClick={() => setTab('tonight')} className={`px-3 py-1 ${tab === 'tonight' ? 'bg-[#1B2430] text-white' : 'bg-white'}`}>{tonightLabel === 'Tonight' ? 'Tonight' : 'Last run'}</button>
            <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')} className={`px-3 py-1 ${tab === 'all' ? 'bg-[#1B2430] text-white' : 'bg-white'}`}>All runs</button>
          </div>
        }
      >
        {tab === 'tonight' ? (
          <>
            {state && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Tile label="Games" value={tonightGames.length} />
                <Tile label="Players" value={state.playersTonight.length} />
              </div>
            )}
            <Awards games={tonightGames} />
            <StatsTable rows={playerLines(tonightGames)} empty="No games finished yet." onPick={setPlayer} />
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-2">{nights === 1 ? 'From 1 run' : `From ${nights} runs`}{view.games.length >= 500 ? ', most recent 500 games' : ''}. Players are matched by name.</p>
            <StatsTable rows={playerLines(view.games)} empty="No games yet." onPick={setPlayer} />
          </>
        )}
      </Card>

      {tonightGames.length > 0 && (
        <Card title={tonightLabel === 'Tonight' ? "Tonight's games" : 'Games from the last run'}>
          <ol>{tonightGames.slice(0, 12).map(g => <GameRow key={g.id} g={g} />)}</ol>
        </Card>
      )}

      <p className="text-center text-xs text-gray-500 pb-4">Updates by itself every few seconds. Run by the courtside screen.</p>
    </>,
    sub
  );
};

export default RunView;
