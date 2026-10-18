import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';
import { SyncApi } from './syncEngine';

export { SyncEngine, localPendingStore } from './syncEngine';

// Loaded only when phone sharing is switched on for this browser, so the everyday app stays small.

let client: SupabaseClient | null = null;
export const getClient = (): SupabaseClient => {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'pbm-cloud-auth' },
    });
  }
  return client;
};

// Turned off on this browser: stop all background sign-in work (token refresh, tab wake-ups)
export const shutdown = async () => {
  const c = client;
  client = null;
  if (!c) return;
  try { await c.auth.stopAutoRefresh(); } catch { /* fine */ }
  try { await (c.auth as unknown as { dispose?: () => Promise<void> }).dispose?.(); } catch { /* fine */ }
};

const fail = (error: { message?: string } | null) => {
  if (error) throw new Error(error.message || 'Something went wrong');
};

export interface RunInfo { id: string; name: string; gym: string | null; viewToken: string; code: string | null; writerDevice: string | null }

const RUN_COLUMNS = 'id, name, gym, view_token, code, writer_device';
const toRun = (r: { id: string; name: string; gym: string | null; view_token: string; code?: string | null; writer_device: string | null }): RunInfo =>
  ({ id: r.id, name: r.name, gym: r.gym, viewToken: r.view_token, code: r.code ?? null, writerDevice: r.writer_device });

export const cloud = {
  async session(): Promise<Session | null> {
    const { data } = await getClient().auth.getSession();
    return data.session;
  },
  onAuth(fn: (s: Session | null) => void) {
    const { data } = getClient().auth.onAuthStateChange((_e, s) => fn(s));
    return () => data.subscription.unsubscribe();
  },
  // Emails a sign-in link that also carries a code, so it can be read on a phone and typed here
  async sendCode(email: string) {
    const redirect = `${window.location.origin}${window.location.pathname}?cloud=1`;
    const { error } = await getClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: true } });
    fail(error);
  },
  async verifyCode(email: string, code: string) {
    const { error } = await getClient().auth.verifyOtp({ email, token: code, type: 'email' });
    fail(error);
  },
  async signOut() {
    const { error } = await getClient().auth.signOut();
    fail(error);
  },
  async myRuns(): Promise<RunInfo[]> {
    const { data, error } = await getClient().from('runs').select(RUN_COLUMNS).order('created_at');
    fail(error);
    return (data ?? []).map(toRun);
  },
  async createRun(name: string, gym: string | null): Promise<RunInfo> {
    const { data, error } = await getClient().from('runs').insert({ name, gym }).select(RUN_COLUMNS).single();
    fail(error);
    return toRun(data!);
  },
  // A new link also gets a new code (the database does that), so read both back
  async resetLink(runId: string): Promise<RunInfo> {
    const { error } = await getClient().rpc('reset_view_token', { p_run: runId });
    fail(error);
    const { data, error: e2 } = await getClient().from('runs').select(RUN_COLUMNS).eq('id', runId).single();
    fail(e2);
    return toRun(data!);
  },
};

export const syncApi: SyncApi = {
  async claim(runId, device, force) {
    const { data, error } = await getClient().rpc('claim_run', { p_run: runId, p_device: device, p_force: force });
    fail(error);
    const row = Array.isArray(data) ? data[0] : data;
    return { claimed: !!row?.claimed, writer: row?.writer_device ?? null };
  },
  async pushNight(a) {
    const { data, error } = await getClient().rpc('push_night', {
      p_run: a.runId, p_device: a.device, p_night: a.nightId, p_version: a.version, p_state: a.state,
      p_started_at: a.startedAt ? new Date(a.startedAt).toISOString() : null,
      p_ended_at: a.endedAt ? new Date(a.endedAt).toISOString() : null,
    });
    fail(error);
    return data as 'ok' | 'stale' | 'taken';
  },
  async pushGames(runId, device, nightId, version, games) {
    const { data, error } = await getClient().rpc('push_games', { p_run: runId, p_device: device, p_night: nightId, p_version: version, p_games: games });
    fail(error);
    return data as 'ok' | 'stale' | 'taken';
  },
  async serverVersion(nightId) {
    const { data, error } = await getClient().from('nights').select('state_version').eq('id', nightId).maybeSingle();
    fail(error);
    return data ? Number(data.state_version) : null;
  },
};
