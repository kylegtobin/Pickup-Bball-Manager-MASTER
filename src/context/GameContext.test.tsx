import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { GameProvider, useGame, isPreviousTeam } from './GameContext';
import { ToastProvider } from '../components/ui/Toast';
import { GameState, Player, Regular } from '../types';

const KEY = 'test-session';
const NAMES = ['Avery', 'Blake', 'Cody', 'Drew', 'Ezra', 'Finn', 'Gabe', 'Hank', 'Ivan', 'Jules', 'Kai', 'Leo', 'Max', 'Nico', 'Owen', 'Pat', 'Quin'];

const setup = (props: { initialState?: Partial<GameState>; persistKey?: string; initialRegulars?: Regular[] } = {}) =>
  renderHook(() => useGame(), {
    wrapper: ({ children }) => (
      <ToastProvider>
        <GameProvider {...props}>{children}</GameProvider>
      </ToastProvider>
    ),
  });

const names = (list: Player[]) => list.map(p => p.name);
const lineNames = (s: GameState) => s.waitingQueue.map(i => (isPreviousTeam(i) ? `[${names(i.players).join(',')}]` : i.name));

type Hook = ReturnType<typeof setup>['result'];
const signIn = (result: Hook, list: string[]) => list.forEach(n => act(() => { result.current.addPlayer(n); }));
const win = (result: Hook, side: 'champions' | 'challengers') => act(() => { result.current.handleGameEnd(side); });

beforeEach(() => window.localStorage.clear());

test('first 10 fill the teams, the rest wait in line, and the game starts', () => {
  const { result, unmount } = setup();
  signIn(result, NAMES.slice(0, 12));
  const s = result.current.gameState;
  expect(names(s.champions)).toEqual(NAMES.slice(0, 5));
  expect(names(s.challengers)).toEqual(NAMES.slice(5, 10));
  expect(lineNames(s)).toEqual(['Kai', 'Leo']);
  expect(s.status).toBe('READY');
  expect(s.gameStartTime).not.toBeNull();
  unmount();
});

test('after a game: winners stay, losers go to the back as one group, next five come up', () => {
  const { result, unmount } = setup();
  signIn(result, NAMES.slice(0, 15));
  win(result, 'champions');
  const s = result.current.gameState;
  expect(names(s.champions)).toEqual(NAMES.slice(0, 5));
  expect(names(s.challengers)).toEqual(['Kai', 'Leo', 'Max', 'Nico', 'Owen']);
  expect(lineNames(s)).toEqual(['[Finn,Gabe,Hank,Ivan,Jules]']);
  unmount();
});

test('with exactly 10 players the same two teams run it back', () => {
  const { result, unmount } = setup();
  signIn(result, NAMES.slice(0, 10));
  win(result, 'challengers');
  const s = result.current.gameState;
  expect(names(s.champions)).toEqual(NAMES.slice(5, 10));
  expect(names(s.challengers)).toEqual(NAMES.slice(0, 5));
  expect(s.waitingQueue).toEqual([]);
  unmount();
});

describe('three-point shootout', () => {
  const twelve = () => {
    const hook = setup();
    signIn(hook.result, NAMES.slice(0, 12)); // Kai and Leo waiting
    win(hook.result, 'champions'); // losers (Finn..Jules) to the back; Kai, Leo + 3 of the losers needed
    return hook;
  };

  test('triggers when the next group is bigger than the open spots, and only that group shoots', () => {
    const { result, unmount } = twelve();
    const s = result.current.gameState;
    expect(s.status).toBe('SHOOTOUT');
    expect(s.requiredPlayers).toBe(3);
    expect(names(s.challengers)).toEqual(['Kai', 'Leo']);
    expect(names(s.shootoutTeam!.players)).toEqual(['Finn', 'Gabe', 'Hank', 'Ivan', 'Jules']);
    unmount();
  });

  test('winners join; 2+ losers go to the front of the line together', () => {
    const { result, unmount } = twelve();
    const team = result.current.gameState.shootoutTeam!.players;
    act(() => { result.current.confirmShootout([team[0], team[2], team[4]]); });
    const s = result.current.gameState;
    expect(names(s.challengers)).toEqual(['Kai', 'Leo', 'Finn', 'Hank', 'Jules']);
    expect(lineNames(s)).toEqual(['[Gabe,Ivan]']);
    expect(s.status).toBe('READY');
    unmount();
  });

  test('a single loser goes to the front as an individual', () => {
    const { result, unmount } = setup();
    signIn(result, NAMES.slice(0, 14)); // 4 waiting -> 1 spot for the losers
    win(result, 'champions');
    expect(result.current.gameState.requiredPlayers).toBe(1);
    const team = result.current.gameState.shootoutTeam!.players;
    act(() => { result.current.confirmShootout([team[3]]); });
    const s = result.current.gameState;
    expect(names(s.challengers)).toEqual(['Kai', 'Leo', 'Max', 'Nico', 'Ivan']);
    expect(lineNames(s)).toEqual(['[Finn,Gabe,Hank,Jules]']);
    unmount();
  });
});

test('Remove Player ignores capitals', () => {
  const { result, unmount } = setup();
  signIn(result, NAMES.slice(0, 12));
  act(() => { result.current.removePlayer('kai'); });
  expect(lineNames(result.current.gameState)).toEqual(['Leo']);
  unmount();
});

describe('undo', () => {
  test('undoes a result exactly, then the sign-in before it', () => {
    const { result, unmount } = setup();
    signIn(result, NAMES.slice(0, 15));
    const before = result.current.gameState;
    win(result, 'champions');
    expect(result.current.undoLabel).toBe('Champions won');
    act(() => { result.current.undo(); });
    const after = result.current.gameState;
    expect(names(after.champions)).toEqual(names(before.champions));
    expect(names(after.challengers)).toEqual(names(before.challengers));
    expect(lineNames(after)).toEqual(lineNames(before));
    expect(after.gamesPlayed).toBe(0);
    expect(result.current.undoLabel).toBe('Added Owen');
    act(() => { result.current.undo(); });
    expect(lineNames(result.current.gameState)).not.toContain('Owen');
    unmount();
  });

  test('undo during a shootout cancels the result that caused it', () => {
    const { result, unmount } = setup();
    signIn(result, NAMES.slice(0, 12));
    win(result, 'challengers');
    expect(result.current.gameState.status).toBe('SHOOTOUT');
    act(() => { result.current.undo(); });
    const s = result.current.gameState;
    expect(s.status).toBe('READY');
    expect(s.showShootoutModal).toBe(false);
    expect(names(s.champions)).toEqual(NAMES.slice(0, 5));
    unmount();
  });
});

describe('win streak and recap numbers', () => {
  test('counts straight wins for whoever holds Champions, resets when Challengers win', () => {
    const { result, unmount } = setup();
    signIn(result, NAMES.slice(0, 10));
    win(result, 'champions');
    win(result, 'champions');
    expect(result.current.gameState.championStreak).toBe(2);
    win(result, 'challengers');
    const s = result.current.gameState;
    expect(s.championStreak).toBe(1);
    expect(s.gamesPlayed).toBe(3);
    expect(s.bestStreak).toEqual({ count: 2, names: NAMES.slice(0, 5) });
    expect(s.playersTonight).toHaveLength(10);
    unmount();
  });
});

describe('save the night', () => {
  test('saves as it goes and offers to resume after a reload', () => {
    const first = setup({ persistKey: KEY });
    signIn(first.result, NAMES.slice(0, 12));
    win(first.result, 'champions');
    const team = first.result.current.gameState.shootoutTeam!.players;
    act(() => { first.result.current.confirmShootout([team[0], team[1], team[2]]); });
    const saved = first.result.current.gameState;
    first.unmount();

    const second = setup({ persistKey: KEY });
    expect(second.result.current.pendingResume?.players).toBe(12);
    expect(second.result.current.gameState.champions).toEqual([]); // nothing loads until you choose
    act(() => { second.result.current.resumeSession(); });
    const back = second.result.current.gameState;
    expect(names(back.champions)).toEqual(names(saved.champions));
    expect(lineNames(back)).toEqual(lineNames(saved));
    expect(back.gamesPlayed).toBe(1);
    second.unmount();
  });

  test('a saved night is never overwritten while it waits for Resume or Start fresh', () => {
    const first = setup({ persistKey: KEY });
    signIn(first.result, NAMES.slice(0, 11));
    first.unmount();
    const raw = window.localStorage.getItem(KEY);
    const second = setup({ persistKey: KEY });
    act(() => { second.result.current.addPlayer('Zed'); });
    expect(window.localStorage.getItem(KEY)).toBe(raw);
    second.unmount();
  });

  test('Start fresh clears it', () => {
    const first = setup({ persistKey: KEY });
    signIn(first.result, NAMES.slice(0, 3));
    first.unmount();
    const second = setup({ persistKey: KEY });
    act(() => { second.result.current.discardSavedSession(); });
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(second.result.current.pendingResume).toBeNull();
    second.unmount();
  });

  test('the sample (no save key) never writes anything', () => {
    const { result, unmount } = setup({ initialState: { champions: [], challengers: [] } });
    signIn(result, NAMES.slice(0, 12));
    win(result, 'champions');
    expect(window.localStorage.length).toBe(0);
    unmount();
  });
});

test('moving a player into a waiting group', () => {
  const { result, unmount } = setup();
  signIn(result, NAMES.slice(0, 17)); // 7 waiting
  win(result, 'champions'); // 5 come up, Pat and Quin wait, losers group behind them
  const groupId = result.current.gameState.waitingQueue.find(isPreviousTeam)!.id;
  act(() => { result.current.removePlayer('Finn'); }); // make room in the group
  const pat = result.current.gameState.waitingQueue.find(i => !isPreviousTeam(i) && i.name === 'Pat')!;
  act(() => { result.current.movePlayerIntoGroup(pat.id, groupId); });
  expect(lineNames(result.current.gameState)).toEqual(['Quin', '[Gabe,Hank,Ivan,Jules,Pat]']);
  unmount();
});

describe('reliable results', () => {
  test('undo catches a result even when nobody moves (10 players, Champions win)', () => {
    const { result, unmount } = setup();
    signIn(result, NAMES.slice(0, 10));
    win(result, 'champions');
    expect(result.current.gameState.gamesPlayed).toBe(1);
    expect(result.current.undoLabel).toBe('Champions won');
    act(() => { result.current.undo(); });
    expect(result.current.gameState.gamesPlayed).toBe(0);
    expect(result.current.gameState.games).toEqual([]);
    expect(result.current.undoLabel).toBe('Added Jules');
    unmount();
  });

  test('every game is logged with both rosters, and a shootout is noted on its game', () => {
    const { result, unmount } = setup();
    signIn(result, NAMES.slice(0, 12)); // Kai and Leo wait
    win(result, 'champions'); // Kai and Leo come up; the losing group shoots for the last 3 spots
    const s1 = result.current.gameState;
    expect(s1.status).toBe('SHOOTOUT');
    expect(s1.games).toHaveLength(1);
    expect(s1.games[0].winner).toBe('champions');
    expect(s1.games[0].winners.map(p => p.name)).toEqual(NAMES.slice(0, 5));
    expect(s1.games[0].losers.map(p => p.name)).toEqual(NAMES.slice(5, 10));
    const team = s1.shootoutTeam!;
    const picks = team.players.slice(0, s1.requiredPlayers);
    act(() => { result.current.confirmShootout(picks); });
    const g1 = result.current.gameState.games[0];
    expect(g1.shootout?.spots).toBe(3);
    expect(g1.shootout?.picked.map(p => p.name)).toEqual(picks.map(p => p.name));
    expect(g1.shootout?.shooters.map(p => p.name)).toEqual(NAMES.slice(5, 10));
    win(result, 'challengers');
    const s2 = result.current.gameState;
    expect(s2.games.map(g => g.winner)).toEqual(['champions', 'challengers']);
    expect(s2.games[1].winners.map(p => p.name)).toEqual(['Kai', 'Leo', ...picks.map(p => p.name)]);
    unmount();
  });

  test('undo still works after a refresh', () => {
    const first = setup({ persistKey: KEY });
    signIn(first.result, NAMES.slice(0, 12));
    win(first.result, 'challengers');
    first.unmount();
    const second = setup({ persistKey: KEY });
    act(() => { second.result.current.resumeSession(); });
    expect(second.result.current.gameState.gamesPlayed).toBe(1);
    expect(second.result.current.undoLabel).toBe('Challengers won');
    act(() => { second.result.current.undo(); });
    expect(second.result.current.gameState.gamesPlayed).toBe(0);
    expect(names(second.result.current.gameState.champions)).toEqual(NAMES.slice(0, 5));
    second.unmount();
  });

  test('save status shows saved for the real session and off for the sample', () => {
    const real = setup({ persistKey: KEY });
    signIn(real.result, NAMES.slice(0, 2));
    expect(real.result.current.saveStatus).toBe('saved');
    real.unmount();
    const sample = setup();
    expect(sample.result.current.saveStatus).toBe('off');
    sample.unmount();
  });
});

describe('regulars and finishing a night', () => {
  test('a regular keeps the same id and name across nights', () => {
    const { result, unmount } = setup({ persistKey: KEY });
    signIn(result, ['Avery']);
    const rid = result.current.gameState.champions[0].rid;
    expect(rid).toBeTruthy();
    expect(result.current.regulars).toEqual([expect.objectContaining({ id: rid, name: 'Avery', nights: 1 })]);
    act(() => { result.current.finishNight(); });
    signIn(result, ['avery']);
    const again = result.current.gameState.champions[0];
    expect(again.rid).toBe(rid);
    expect(again.name).toBe('Avery');
    expect(result.current.regulars[0].nights).toBe(2);
    unmount();
  });

  test('regulars survive a refresh; forgetting one removes it', () => {
    const first = setup({ persistKey: KEY });
    signIn(first.result, ['Avery', 'Blake']);
    first.unmount();
    const second = setup({ persistKey: KEY });
    expect(second.result.current.regulars.map(r => r.name)).toEqual(['Avery', 'Blake']);
    act(() => { second.result.current.forgetRegular(second.result.current.regulars[0].id); });
    expect(second.result.current.regulars.map(r => r.name)).toEqual(['Blake']);
    second.unmount();
  });

  test('finish night archives tonight, clears the courts and the saved night', () => {
    const { result, unmount } = setup({ persistKey: KEY });
    signIn(result, NAMES.slice(0, 12));
    win(result, 'champions');
    let summary: ReturnType<typeof result.current.finishNight> = null;
    act(() => { summary = result.current.finishNight(); });
    expect(summary!.gamesPlayed).toBe(1);
    expect(summary!.games).toHaveLength(1);
    expect(result.current.archive).toHaveLength(1);
    expect(result.current.gameState.champions).toEqual([]);
    expect(result.current.gameState.games).toEqual([]);
    expect(result.current.canUndo).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(`${KEY}-archive`)!)).toHaveLength(1);
    unmount();
  });

  test('the sample never saves regulars or an archive', () => {
    const { result, unmount } = setup({ initialRegulars: [{ id: 'r1', name: 'Zed', nights: 3, lastNight: null }] });
    expect(result.current.regulars.map(r => r.name)).toEqual(['Zed']);
    signIn(result, ['Zed', ...NAMES.slice(0, 11)]);
    expect(result.current.gameState.champions[0].rid).toBe('r1');
    win(result, 'champions');
    act(() => { result.current.finishNight(); });
    expect(window.localStorage.length).toBe(0);
    unmount();
  });
});
