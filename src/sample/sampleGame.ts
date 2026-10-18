import { v4 as uuidv4 } from 'uuid';
import { GameState, Player, Regular } from '../types';

// First name and last initial, the way we ask players to sign in. Made-up names, except the
// nicknames Speedy and J-Dog, which Kyle OK'd (Oct 18). Never add other real players.
const SAMPLE_CHAMPIONS = ['Marcus T.', 'Dev P.', 'Speedy', 'Andre W.', 'Luis G.'];
const SAMPLE_CHALLENGERS = ['Sam K.', 'Jordan B.', 'Nate R.', 'J-Dog', 'Omar H.'];
const SAMPLE_WAITING = ['Ben A.', 'Rico M.', 'Tyler J.', 'Kofi O.', 'Matt D.', 'Eli S.', 'Jay L.'];
// Saved regulars who haven't signed in yet, so the sample's Sign in list has names to tap
const SAMPLE_NOT_HERE_YET = ['Victor C.', 'Malik F.', 'Hector V.', 'Isaiah N.', 'Pete Y.', 'Quinn E.'];

const toPlayers = (names: string[], rids: Map<string, string>): Player[] =>
  names.map(name => ({ id: uuidv4(), name, rid: rids.get(name) }));

export const isSampleLink = (): boolean =>
  new URLSearchParams(window.location.search).get('sample') === '1';

// Fresh each call, so Reset gets new IDs and a clean game. Kept in memory only.
export const createSample = (): { state: Partial<GameState>; regulars: Regular[] } => {
  const all = [...SAMPLE_CHAMPIONS, ...SAMPLE_CHALLENGERS, ...SAMPLE_WAITING, ...SAMPLE_NOT_HERE_YET];
  const rids = new Map(all.map(name => [name, uuidv4()]));
  const now = Date.now();
  return {
    state: {
      champions: toPlayers(SAMPLE_CHAMPIONS, rids),
      challengers: toPlayers(SAMPLE_CHALLENGERS, rids),
      waitingQueue: toPlayers(SAMPLE_WAITING, rids),
      status: 'READY',
      sessionStartedAt: now,
      playersTonight: [...SAMPLE_CHAMPIONS, ...SAMPLE_CHALLENGERS, ...SAMPLE_WAITING],
    },
    regulars: all.map((name, i) => ({ id: rids.get(name)!, name, nights: 3 + (i % 5), lastNight: null })),
  };
};
