// Checks the app's calls against the real database while signed out: the right names come back
// "permission denied", a wrong one "not found". Creates nothing.
// Run from app/: npx esbuild supabase/tests/contract.ts --bundle --platform=node --outfile=/tmp/c.js && node /tmp/c.js
import { getClient, syncApi, cloud } from '../../src/cloud/live';
import { fetchRunView } from '../../src/cloud/runView';
const RUN = '00000000-0000-0000-0000-000000000000';
const msg = async (p: Promise<unknown>) => { try { await p; return 'no error'; } catch (e) { return (e as Error).message; } };
const checks: [string, () => Promise<boolean>][] = [
  ['claim_run name + refused', async () => /permission denied for function claim_run/.test(await msg(syncApi.claim(RUN, 'deviceXXXX', false)))],
  ['push_night name + refused', async () => /permission denied for function push_night/.test(await msg(syncApi.pushNight({ runId: RUN, device: 'deviceXXXX', nightId: 'n', version: 1, state: {} as never, startedAt: Date.now(), endedAt: null })))],
  ['push_games name + refused', async () => /permission denied for function push_games/.test(await msg(syncApi.pushGames(RUN, 'deviceXXXX', 'n', 1, [])))],
  ['reset_view_token name + refused', async () => /permission denied for function reset_view_token/.test(await msg(cloud.resetLink(RUN)))],
  ['runs columns readable, empty', async () => (await cloud.myRuns()).length === 0],
  ['nights state_version readable, empty', async () => (await syncApi.serverVersion('n')) === null],
  ['create run refused signed out', async () => /permission denied|row-level security/.test(await msg(cloud.createRun('Contract check', null)))],
  ['games update refused', async () => { const { error } = await getClient().from('games').update({ winner: 'challengers' }).eq('id', 'x'); return /permission denied/.test(error?.message ?? ''); }],
  ['phone view: wrong link is gone', async () => JSON.stringify(await fetchRunView('nottherighttoken0000000000000000')) === JSON.stringify({ ok: false, reason: 'gone' })],
];
(async () => {
  let bad = 0;
  for (const [name, fn] of checks) { let ok = false; try { ok = await fn(); } catch (e) { console.log('  threw', (e as Error).message); } if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', name); }
  console.log(bad ? `${bad} FAILED` : `ALL ${checks.length} PASSED`);
  process.exit(bad ? 1 : 0);
})();
