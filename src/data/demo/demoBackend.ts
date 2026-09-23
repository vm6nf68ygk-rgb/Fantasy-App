// Demo mode: the real database schema running inside the browser (PGlite),
// filled with a fictional eight-team league. Nothing leaves the device.

import { PGlite } from '@electric-sql/pglite';
import migration from '../../../supabase/migrations/0001_init.sql?raw';
import { addDays, todayEastern } from '../../../shared/dates';
import { roundRobinSchedule } from '../../../shared/schedule';
import { scoreTeam, type RosterStint, type Scoring } from '../../../shared/scoring';
import type { AuthUser, Backend } from '../backend';
import type { StatsSource } from '../stats';
import { AUTH_STUB_SQL } from './authStub';
import { createDemoStats, demoPlayersByTalent } from './demoStats';
import { pgliteRpc } from './pgliteRpc';

const SEED_VERSION = 3;
const META_KEY = 'fantasy-demo-meta';

const TEAM_NAMES = [
  'Five Hole Heroes',
  'Top Shelf Tenders',
  'Zamboni Drivers',
  'Biscuit Basket',
  'Sin Bin Squad',
  'Hat Trick Swayze',
  'Wraparound Gang',
  'Barn Burners',
];

export const DEMO_USERS = TEAM_NAMES.map((team, i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i + 1).padStart(2, '0')}`,
  team,
}));

interface DemoMeta {
  version: number;
  seasonStart: string;
  uid: string;
}

export interface DemoControls {
  users: { id: string; team: string }[];
  currentUid(): string;
  actAs(uid: string): void;
  reset(): Promise<void>;
  stats: StatsSource;
}

function readMeta(): DemoMeta | null {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as DemoMeta | null;
    return m && m.version === SEED_VERSION + migration.length ? m : null;
  } catch {
    return null;
  }
}

function writeMeta(m: DemoMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* private mode: demo still works for this visit */
  }
}

function mondayOnOrBefore(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

async function openDb(): Promise<PGlite> {
  try {
    const db = new PGlite('idb://fantasy-hockey-demo');
    await db.waitReady;
    return db;
  } catch {
    const db = new PGlite();
    await db.waitReady;
    return db;
  }
}

async function wipe(db: PGlite) {
  await db.exec(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
  `);
}

async function seed(db: PGlite, seasonStart: string, stats: StatsSource) {
  const rpc = <T = any>(uid: string, name: string, args: Record<string, unknown> = {}) =>
    pgliteRpc<T>(db, uid, name, args);
  await db.exec(AUTH_STUB_SQL);
  await db.exec(migration);
  await db.query(
    `insert into auth.users (id, email) select unnest($1::uuid[]), unnest($2::text[])`,
    [DEMO_USERS.map((u) => u.id), DEMO_USERS.map((_, i) => `owner${i + 1}@example.com`)],
  );
  const [me, ...others] = DEMO_USERS;
  const league = await rpc<string>(me.id, 'create_league', { p_name: 'The Beer League', p_team_name: me.team });
  const code = (await rpc<any>(me.id, 'get_league_state', { p_league: league })).league.invite_code;
  for (const u of others) await rpc(u.id, 'join_league', { p_code: code, p_team_name: u.team });
  const state = await rpc<any>(me.id, 'get_league_state', { p_league: league });
  const teamIds: string[] = state.teams.map((t: any) => t.id);
  const lineup = state.league.settings.lineup as Record<string, number>;

  // Snake draft by talent: 10 forwards, 6 defense, 2 goalies each.
  const need = { F: 10, D: 6, G: 2 };
  const counts = teamIds.map(() => ({ F: 0, D: 0, G: 0 }));
  const pool = demoPlayersByTalent();
  const rows: unknown[][] = [];
  for (let round = 0; round < 18; round++) {
    const order = round % 2 === 0 ? teamIds.map((_, i) => i) : teamIds.map((_, i) => teamIds.length - 1 - i);
    for (const t of order) {
      const idx = pool.findIndex((p) => {
        const group = p.pos === 'D' ? 'D' : p.pos === 'G' ? 'G' : 'F';
        return counts[t][group] < need[group];
      });
      const [p] = pool.splice(idx, 1);
      const group = p.pos === 'D' ? 'D' : p.pos === 'G' ? 'G' : 'F';
      const n = counts[t][group]++;
      const slot =
        group === 'F' ? (n < lineup.F ? 'F' : n < lineup.F + lineup.UTIL ? 'UTIL' : 'BN')
        : group === 'D' ? (n < lineup.D ? 'D' : 'BN')
        : n < lineup.G ? 'G' : 'BN';
      rows.push([league, teamIds[t], p.id, p.name, p.pos, p.team, slot, seasonStart]);
    }
  }
  const cols = ['league_id', 'team_id', 'player_id', 'player_name', 'pos', 'nhl_team', 'slot', 'start_date'];
  await db.query(
    `insert into roster_spots (${cols.join(', ')})
     select * from unnest($1::uuid[], $2::uuid[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::date[])`,
    cols.map((_, c) => rows.map((r) => r[c])),
  );

  const draftYear = Number(seasonStart.slice(0, 4)) + 1;
  await rpc(me.id, 'commish_create_picks', { p_league: league, p_season: draftYear, p_rounds: 3 });
  await rpc(me.id, 'commish_create_picks', { p_league: league, p_season: draftYear + 1, p_rounds: 3 });
  await rpc(me.id, 'commish_set_schedule', {
    p_league: league,
    p_weeks: roundRobinSchedule(teamIds, seasonStart, 20),
  });

  // A little league history.
  const fresh = await rpc<any>(me.id, 'get_league_state', { p_league: league });
  const benchOf = (team: string) =>
    fresh.roster.filter((r: any) => r.team_id === team && r.slot === 'BN' && r.pos !== 'G');
  const starterOf = (team: string, pos: string) =>
    fresh.roster.find((r: any) => r.team_id === team && r.slot !== 'BN' && r.pos === pos);
  await rpc(others[2].id, 'propose_trade', {
    p_league: league,
    p_to_team: teamIds[4],
    p_give_players: [benchOf(teamIds[3])[0].player_id],
    p_give_picks: [],
    p_get_players: [benchOf(teamIds[4])[0].player_id],
    p_get_picks: [],
  }).then((t) => rpc(others[3].id, 'respond_trade', { p_trade: t, p_accept: true }));
  const freeAgent = pool.find((p) => p.pos === 'R')!;
  await rpc(others[4].id, 'add_player', {
    p_league: league,
    p_player: freeAgent,
    p_drop_player_id: benchOf(teamIds[5])[0].player_id,
  });
  const theirPick = fresh.picks.find((p: any) => p.owner_team_id === teamIds[1] && p.round === 2);
  await rpc(others[0].id, 'propose_trade', {
    p_league: league,
    p_to_team: teamIds[0],
    p_give_players: [starterOf(teamIds[1], 'D').player_id],
    p_give_picks: [theirPick.id],
    p_get_players: [starterOf(teamIds[0], 'C').player_id],
    p_get_picks: [],
    p_message: 'Need a center before the deadline. Pick sweetens it.',
  });

  await finalizeDemoWeeks(db, stats);
}

/** Score finished weeks, like the nightly job does in production. */
async function finalizeDemoWeeks(db: PGlite, stats: StatsSource) {
  const today = todayEastern();
  const pending = await db.query<{
    id: string; league_id: string; home_team_id: string; away_team_id: string;
    start_date: string; end_date: string; settings: { scoring: Scoring };
  }>(`
    select m.id, m.league_id, m.home_team_id, m.away_team_id,
           w.start_date::text, w.end_date::text, l.settings
    from matchups m
    join weeks w on w.league_id = m.league_id and w.week = m.week
    join leagues l on l.id = m.league_id
    where not m.final and w.end_date < $1::date`, [today]);
  const linesByWeek = new Map<string, Awaited<ReturnType<StatsSource['games']>>>();
  for (const m of pending.rows) {
    const key = `${m.start_date}:${m.end_date}`;
    if (!linesByWeek.has(key)) linesByWeek.set(key, await stats.games(m.start_date, m.end_date));
    const stints = (await db.query<RosterStint>(`
      select team_id, player_id, player_name, pos, nhl_team, slot, start_date::text, end_date::text
      from roster_spots where league_id = $1 and start_date <= $2::date and (end_date is null or end_date > $3::date)`,
      [m.league_id, m.end_date, m.start_date])).rows;
    const lines = linesByWeek.get(key)!;
    const home = scoreTeam(m.home_team_id, stints, lines, m.settings.scoring).total;
    const away = scoreTeam(m.away_team_id, stints, lines, m.settings.scoring).total;
    await db.query('select public.finalize_matchup($1, $2, $3)', [m.id, home, away]);
  }
}

export async function createDemoBackend(): Promise<Backend & { demo: DemoControls }> {
  const db = await openDb();
  let meta = readMeta();
  const hasSchema = (await db.query(`select to_regclass('public.leagues') as t`)).rows[0] as { t: string | null };

  const freshMeta = (): DemoMeta => ({
    version: SEED_VERSION + migration.length,
    seasonStart: mondayOnOrBefore(addDays(todayEastern(), -14)),
    uid: DEMO_USERS[0].id,
  });

  if (!meta || !hasSchema.t) {
    meta = freshMeta();
    await wipe(db);
    await seed(db, meta.seasonStart, createDemoStats(meta.seasonStart));
    writeMeta(meta);
  }
  let stats = createDemoStats(meta.seasonStart);
  await finalizeDemoWeeks(db, stats);

  let uid = meta.uid;
  const listeners = new Set<(u: AuthUser | null) => void>();
  const user = (): AuthUser => ({ id: uid, email: 'demo@example.com' });

  const controls: DemoControls = {
    users: DEMO_USERS,
    currentUid: () => uid,
    actAs(next) {
      uid = next;
      meta = { ...meta!, uid };
      writeMeta(meta);
      listeners.forEach((l) => l(user()));
    },
    async reset() {
      meta = freshMeta();
      await wipe(db);
      stats = createDemoStats(meta.seasonStart);
      controls.stats = stats;
      await seed(db, meta.seasonStart, stats);
      writeMeta(meta);
      uid = meta.uid;
      listeners.forEach((l) => l(user()));
    },
    stats,
  };

  return {
    mode: 'demo',
    demo: controls,
    rpc: (name, args) => pgliteRpc(db, uid, name, args),
    currentUser: async () => user(),
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async sendCode() {},
    async verifyCode() {},
    async signOut() {},
  };
}
