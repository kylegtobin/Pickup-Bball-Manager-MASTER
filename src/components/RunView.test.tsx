import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import RunView, { lineStatus } from './RunView';
import { RunView as View, FetchResult } from '../cloud/runView';
import { PublicState, PublicPlayer } from '../cloud/publicState';
import { newScore, newClock } from '../utils/score';

const p = (name: string): PublicPlayer => ({ id: `id-${name}`, name });
const five = (names: string[]) => names.map(p);
const state = (over: Partial<PublicState> = {}): PublicState => ({
  v: 1, sentAt: Date.now(), nightId: 'n1',
  champions: five(['Arlo', 'Bryn', 'Cale', 'Dove', 'Emry']),
  challengers: five(['Fenn', 'Gray', 'Hale', 'Isla', 'Jory']),
  waitingQueue: [], sittingOut: [], score: newScore(), clock: newClock(), gameStartTime: null,
  championStreak: 0, gamesPlayed: 0, bestStreak: null, playersTonight: [], sessionStartedAt: null, shootout: null,
  ...over,
});
const view = (s: PublicState, name = 'Test Run'): View => ({
  run: { name, gym: null, courtSeenAt: Date.now() },
  night: { id: 'n1', state: s, updatedAt: Date.now(), startedAt: Date.now() - 1000, endedAt: null },
  games: [], skewMs: 0, serverOffsetMs: 0, receivedAt: Date.now(),
});

// A fetcher whose answers the test releases by hand, in any order
const controlled = () => {
  const waiting: ((r: FetchResult) => void)[] = [];
  const fetcher = jest.fn(() => new Promise<FetchResult>(res => { waiting.push(res); }));
  return { fetcher, answer: (i: number, r: FetchResult) => act(async () => { waiting[i](r); await Promise.resolve(); }) };
};
const refresh = () => act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });

beforeEach(() => window.localStorage.clear());

test('Should 7: a slow, older answer never rolls the phone backward', async () => {
  const { fetcher, answer } = controlled();
  render(<RunView token={"t".repeat(32)} fetcher={fetcher} />);
  await refresh(); // the phone comes back to the foreground: a second request goes out
  expect(fetcher).toHaveBeenCalledTimes(2);
  await answer(1, { ok: true, view: view(state({ waitingQueue: [p('Newer')] }), 'Newer roster') });
  expect(screen.getByText('Newer roster')).toBeInTheDocument();
  await answer(0, { ok: true, view: view(state({ waitingQueue: [p('Older')] }), 'Older roster') });
  expect(screen.getByText('Newer roster')).toBeInTheDocument();
  expect(screen.queryByText('Older roster')).toBeNull();
});

test('Should 7: an older answer never replaces "this link doesn\'t work anymore"', async () => {
  const { fetcher, answer } = controlled();
  render(<RunView token={"t".repeat(32)} fetcher={fetcher} />);
  await refresh();
  await answer(1, { ok: false, reason: 'gone' });
  expect(screen.getByText("This link doesn't work anymore.")).toBeInTheDocument();
  await answer(0, { ok: true, view: view(state()) });
  expect(screen.getByText("This link doesn't work anymore.")).toBeInTheDocument();
});

test('Should 8: a group that has to shoot for spots is never promised the next game', () => {
  const s = state({ waitingQueue: [p('Kemp'), p('Lane'), { type: 'PreviousTeam', id: 'g', players: five(['Moss', 'Nash', 'Oaks', 'Pike', 'Quin']) }, p('Rook')] });
  const w = lineStatus(s);
  expect(w.get('id-Kemp')).toEqual({ kind: 'next' });
  expect(w.get('id-Lane')).toEqual({ kind: 'next' });
  ['Moss', 'Nash', 'Oaks', 'Pike', 'Quin'].forEach(n => expect(w.get(`id-${n}`)).toEqual({ kind: 'shootout', spots: 3 }));
  expect(w.get('id-Rook')).toEqual({ kind: 'later', games: 2 });
});

test('Should 8: the phone says "shooting for 3 spots" and heads the group that way', async () => {
  const s = state({ waitingQueue: [p('Kemp'), p('Lane'), { type: 'PreviousTeam', id: 'g', players: five(['Moss', 'Nash', 'Oaks', 'Pike', 'Quin']) }] });
  const { fetcher, answer } = controlled();
  render(<RunView token={"t".repeat(32)} fetcher={fetcher} />);
  await answer(0, { ok: true, view: view(s) });
  expect(screen.getByText('Next game: shootout for 3 spots')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Type your name'), { target: { value: 'Nash' } });
  expect(screen.getByText('Shooting for 3 spots next game')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Type your name'), { target: { value: 'Kemp' } });
  expect(screen.getByText('Up next game')).toBeInTheDocument();
});

test('Nice 11: nine on court with players waiting reads as an open spot, not "waiting for 10"', async () => {
  const s = state({ champions: five(['Arlo', 'Bryn', 'Cale', 'Dove']), waitingQueue: five(['Kemp', 'Lane', 'Moss', 'Nash', 'Oaks', 'Pike', 'Quin']) });
  const { fetcher, answer } = controlled();
  render(<RunView token={"t".repeat(32)} fetcher={fetcher} />);
  await answer(0, { ok: true, view: view(s) });
  expect(screen.getByText('A spot on court is open')).toBeInTheDocument();
  expect(screen.queryByText('Waiting for 10 players')).toBeNull();
  fireEvent.change(screen.getByLabelText('Type your name'), { target: { value: 'Kemp' } });
  expect(screen.getByText(/runner is filling it/)).toBeInTheDocument();
});

test('few players reads as waiting for 10', async () => {
  const s = state({ champions: five(['Arlo', 'Bryn', 'Cale']), challengers: [], waitingQueue: [] });
  const { fetcher, answer } = controlled();
  render(<RunView token={"t".repeat(32)} fetcher={fetcher} />);
  await answer(0, { ok: true, view: view(s) });
  expect(screen.getByText('Waiting for 10 players')).toBeInTheDocument();
});
