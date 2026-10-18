import { screenId, resetScreenIdForTests, deviceId } from './config';

// A pretend BroadcastChannel shared by every "tab" in this test
class FakeChannel {
  static open: FakeChannel[] = [];
  private listeners: ((e: MessageEvent) => void)[] = [];
  constructor(public name: string) { FakeChannel.open.push(this); }
  addEventListener(_: string, fn: (e: MessageEvent) => void) { this.listeners.push(fn); }
  removeEventListener(_: string, fn: (e: MessageEvent) => void) { this.listeners = this.listeners.filter(x => x !== fn); }
  postMessage(data: unknown) {
    FakeChannel.open.filter(c => c !== this && c.name === this.name).forEach(c => setTimeout(() => c.listeners.forEach(l => l({ data } as MessageEvent)), 5));
  }
  close() { FakeChannel.open = FakeChannel.open.filter(c => c !== this); }
}

beforeEach(() => {
  (global as unknown as { BroadcastChannel: unknown }).BroadcastChannel = FakeChannel;
  FakeChannel.open = [];
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetScreenIdForTests();
});

test('Must 1: a duplicated tab (same tab id copied) takes its own id, so it has to take over on purpose', async () => {
  const first = await screenId(50);
  // A duplicate copies sessionStorage and starts fresh, while the first tab is still open
  resetScreenIdForTests();
  const second = await screenId(50);
  expect(second).not.toBe(first);
  expect(first.startsWith(deviceId())).toBe(true);
  expect(second.startsWith(deviceId())).toBe(true);
});

test('a reload of the same tab keeps its id (the old page is gone, so nobody answers)', async () => {
  const first = await screenId(50);
  FakeChannel.open = []; // the page went away
  resetScreenIdForTests();
  const again = await screenId(50);
  expect(again).toBe(first);
});

test('a new tab with nothing copied gets a new id', async () => {
  const first = await screenId(50);
  window.sessionStorage.clear();
  resetScreenIdForTests();
  const other = await screenId(50);
  expect(other).not.toBe(first);
});

test('ids fit the database (64 characters at most)', async () => {
  expect((await screenId(10)).length).toBeLessThanOrEqual(64);
});
