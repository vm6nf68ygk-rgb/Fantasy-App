import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, test } from 'vitest';
import migration from '../supabase/migrations/0001_init.sql?raw';
import { AUTH_STUB_SQL } from '../src/data/demo/authStub';
import { pgliteRpc } from '../src/data/demo/pgliteRpc';

const ALICE = '00000000-0000-0000-0000-00000000000a';
const BOB = '00000000-0000-0000-0000-00000000000b';
const CARL = '00000000-0000-0000-0000-00000000000c';

const mcdavid = { id: 1, name: 'Connor McDavid', pos: 'C', team: 'EDM' };
const makar = { id: 2, name: 'Cale Makar', pos: 'D', team: 'COL' };
const shesterkin = { id: 3, name: 'Igor Shesterkin', pos: 'G', team: 'NYR' };
const matthews = { id: 4, name: 'Auston Matthews', pos: 'C', team: 'TOR' };

let db: PGlite;
let league: string;
let aliceTeam: string;
let bobTeam: string;

const rpc = <T = any>(uid: string | null, name: string, args: Record<string, unknown> = {}) =>
  pgliteRpc<T>(db, uid, name, args);
const setNow = (iso: string) => db.exec(`set app.now = '${iso}'`);
const spots = async () =>
  (await db.query<any>(`select team_id, player_id, slot, start_date::text, end_date::text
                        from roster_spots order by player_id, start_date`)).rows;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(AUTH_STUB_SQL);
  await db.exec(migration);
  await db.exec(`insert into auth.users (id) values ('${ALICE}'), ('${BOB}'), ('${CARL}')`);
  // 9:00 AM Eastern on Oct 20 2026, before the default noon lock.
  await setNow('2026-10-20T13:00:00Z');
  league = await rpc(ALICE, 'create_league', { p_name: 'Beer League', p_team_name: 'Alice Aces' });
  const state = await rpc(ALICE, 'get_league_state', { p_league: league });
  const code = state.league.invite_code;
  await rpc(BOB, 'join_league', { p_code: code.toLowerCase(), p_team_name: 'Bob Bruisers' });
  const full = await rpc(BOB, 'get_league_state', { p_league: league });
  aliceTeam = full.teams[0].id;
  bobTeam = full.teams[1].id;
});

describe('membership', () => {
  test('outsiders cannot read the league', async () => {
    await expect(rpc(CARL, 'get_league_state', { p_league: league })).rejects.toThrow('not in this league');
    await expect(rpc(null, 'get_league_state', { p_league: league })).rejects.toThrow('sign in');
  });

  test('my_leagues lists joined leagues', async () => {
    const mine = await rpc(BOB, 'my_leagues');
    expect(mine).toEqual([{ id: league, name: 'Beer League', team_id: bobTeam, team_name: 'Bob Bruisers' }]);
  });

  test('only the commissioner can use commissioner tools', async () => {
    await expect(
      rpc(BOB, 'commish_assign_player', { p_league: league, p_team: bobTeam, p_player: mcdavid }),
    ).rejects.toThrow('commissioner');
  });
});

describe('roster moves', () => {
  test('add before lock counts today, after lock counts tomorrow', async () => {
    await rpc(ALICE, 'add_player', { p_league: league, p_player: mcdavid });
    await setNow('2026-10-20T20:00:00Z'); // 4 PM Eastern
    await rpc(BOB, 'add_player', { p_league: league, p_player: makar });
    expect(await spots()).toEqual([
      { team_id: aliceTeam, player_id: 1, slot: 'BN', start_date: '2026-10-20', end_date: null },
      { team_id: bobTeam, player_id: 2, slot: 'BN', start_date: '2026-10-21', end_date: null },
    ]);
  });

  test('cannot add a rostered player', async () => {
    await rpc(ALICE, 'add_player', { p_league: league, p_player: mcdavid });
    await expect(rpc(BOB, 'add_player', { p_league: league, p_player: mcdavid })).rejects.toThrow(
      'already on a team',
    );
  });

  test('roster max is enforced, and add+drop works at the limit', async () => {
    const s = await rpc(ALICE, 'get_league_state', { p_league: league });
    await rpc(ALICE, 'commish_update_settings', {
      p_league: league,
      p_settings: { ...s.league.settings, roster_max: 1 },
    });
    await rpc(ALICE, 'add_player', { p_league: league, p_player: mcdavid });
    await expect(rpc(ALICE, 'add_player', { p_league: league, p_player: makar })).rejects.toThrow(
      'more than 1 players',
    );
    await rpc(ALICE, 'add_player', { p_league: league, p_player: makar, p_drop_player_id: 1 });
    const state = await rpc(ALICE, 'get_league_state', { p_league: league });
    expect(state.roster.map((r: any) => r.player_id)).toEqual([2]);
  });

  test('lineup slots respect position and capacity', async () => {
    await rpc(ALICE, 'add_player', { p_league: league, p_player: mcdavid });
    await rpc(ALICE, 'add_player', { p_league: league, p_player: shesterkin });
    await expect(rpc(ALICE, 'set_lineup_slot', { p_league: league, p_player_id: 1, p_slot: 'D' })).rejects.toThrow(
      'not a defenseman',
    );
    await expect(rpc(ALICE, 'set_lineup_slot', { p_league: league, p_player_id: 3, p_slot: 'UTIL' })).rejects.toThrow(
      'Goalies',
    );
    await rpc(ALICE, 'set_lineup_slot', { p_league: league, p_player_id: 1, p_slot: 'UTIL' });
    await rpc(ALICE, 'add_player', { p_league: league, p_player: matthews });
    await expect(rpc(ALICE, 'set_lineup_slot', { p_league: league, p_player_id: 4, p_slot: 'UTIL' })).rejects.toThrow(
      'UTIL slots are full',
    );
  });

  test('lineup change after lock keeps history for today', async () => {
    await rpc(ALICE, 'add_player', { p_league: league, p_player: mcdavid });
    await setNow('2026-10-21T14:00:00Z'); // next day, 10 AM: move applies today
    await rpc(ALICE, 'set_lineup_slot', { p_league: league, p_player_id: 1, p_slot: 'F' });
    await setNow('2026-10-21T23:00:00Z'); // 7 PM: move applies tomorrow
    await rpc(ALICE, 'set_lineup_slot', { p_league: league, p_player_id: 1, p_slot: 'BN' });
    expect(await spots()).toEqual([
      { team_id: aliceTeam, player_id: 1, slot: 'BN', start_date: '2026-10-20', end_date: '2026-10-21' },
      { team_id: aliceTeam, player_id: 1, slot: 'F', start_date: '2026-10-21', end_date: '2026-10-22' },
      { team_id: aliceTeam, player_id: 1, slot: 'BN', start_date: '2026-10-22', end_date: null },
    ]);
    const hist = await rpc(ALICE, 'get_roster_history', {
      p_league: league, p_from: '2026-10-21', p_to: '2026-10-21',
    });
    expect(hist).toHaveLength(1);
    expect(hist[0].slot).toBe('F');
  });

  test('same-day changes before lock collapse instead of leaving empty stints', async () => {
    await rpc(ALICE, 'add_player', { p_league: league, p_player: mcdavid });
    await rpc(ALICE, 'set_lineup_slot', { p_league: league, p_player_id: 1, p_slot: 'F' });
    await rpc(ALICE, 'drop_player', { p_league: league, p_player_id: 1 });
    expect(await spots()).toEqual([]);
    await rpc(BOB, 'add_player', { p_league: league, p_player: mcdavid });
    expect((await spots())[0].team_id).toBe(bobTeam);
  });
});

describe('trades', () => {
  let pickA: string;
  let pickB: string;

  beforeEach(async () => {
    await rpc(ALICE, 'add_player', { p_league: league, p_player: mcdavid });
    await rpc(BOB, 'add_player', { p_league: league, p_player: makar });
    await rpc(BOB, 'add_player', { p_league: league, p_player: matthews });
    await rpc(ALICE, 'commish_create_picks', { p_league: league, p_season: 2027, p_rounds: 2 });
    const s = await rpc(ALICE, 'get_league_state', { p_league: league });
    pickA = s.picks.find((p: any) => p.owner_team_id === aliceTeam && p.round === 1).id;
    pickB = s.picks.find((p: any) => p.owner_team_id === bobTeam && p.round === 2).id;
  });

  const propose = (extra: Record<string, unknown> = {}) =>
    rpc<string>(ALICE, 'propose_trade', {
      p_league: league,
      p_to_team: bobTeam,
      p_give_players: [1],
      p_give_picks: [pickA],
      p_get_players: [2, 4],
      p_get_picks: [pickB],
      p_message: 'Take it or leave it',
      ...extra,
    });

  test('accepted trade swaps players and picks', async () => {
    const trade = await propose();
    await expect(rpc(ALICE, 'respond_trade', { p_trade: trade, p_accept: true })).rejects.toThrow(
      'receiving this offer',
    );
    expect(await rpc(BOB, 'respond_trade', { p_trade: trade, p_accept: true })).toBe('accepted');
    const s = await rpc(BOB, 'get_league_state', { p_league: league });
    const owner = (pid: number) => s.roster.find((r: any) => r.player_id === pid).team_id;
    expect(owner(1)).toBe(bobTeam);
    expect(owner(2)).toBe(aliceTeam);
    expect(owner(4)).toBe(aliceTeam);
    expect(s.picks.find((p: any) => p.id === pickA).owner_team_id).toBe(bobTeam);
    expect(s.picks.find((p: any) => p.id === pickB).owner_team_id).toBe(aliceTeam);
    expect(s.trades[0].status).toBe('accepted');
    expect(s.trades[0].items).toHaveLength(5);
    expect(s.activity[0].kind).toBe('trade');
  });

  test('trade fails cleanly if an asset moved, with no partial changes', async () => {
    const trade = await propose();
    await rpc(BOB, 'drop_player', { p_league: league, p_player_id: 4 });
    const result = await rpc<string>(BOB, 'respond_trade', { p_trade: trade, p_accept: true });
    expect(result).toMatch(/^failed: Auston Matthews is no longer/);
    const s = await rpc(BOB, 'get_league_state', { p_league: league });
    expect(s.roster.find((r: any) => r.player_id === 1).team_id).toBe(aliceTeam);
    expect(s.picks.find((p: any) => p.id === pickA).owner_team_id).toBe(aliceTeam);
    expect(s.trades[0].status).toBe('failed');
  });

  test('trade that overfills a roster fails and rolls back', async () => {
    const s0 = await rpc(ALICE, 'get_league_state', { p_league: league });
    await rpc(ALICE, 'commish_update_settings', {
      p_league: league,
      p_settings: { ...s0.league.settings, roster_max: 2 },
    });
    const trade = await propose({ p_give_picks: [], p_get_picks: [] });
    await rpc(ALICE, 'add_player', { p_league: league, p_player: shesterkin });
    expect(await rpc(BOB, 'respond_trade', { p_trade: trade, p_accept: true })).toMatch(/more than 2 players/);
    const s = await rpc(ALICE, 'get_league_state', { p_league: league });
    expect(s.roster.filter((r: any) => r.team_id === aliceTeam)).toHaveLength(2);
  });

  test('cannot offer what you do not own', async () => {
    await expect(propose({ p_give_players: [2] })).rejects.toThrow('not on your team');
    await expect(propose({ p_give_picks: [pickB] })).rejects.toThrow('not yours');
    await expect(propose({ p_get_players: [], p_get_picks: [] })).rejects.toThrow('Both sides');
  });

  test('decline and cancel', async () => {
    const t1 = await propose();
    await expect(rpc(BOB, 'cancel_trade', { p_trade: t1 })).rejects.toThrow('made this offer');
    await rpc(ALICE, 'cancel_trade', { p_trade: t1 });
    await expect(rpc(BOB, 'respond_trade', { p_trade: t1, p_accept: true })).rejects.toThrow('no longer pending');
    const t2 = await propose();
    expect(await rpc(BOB, 'respond_trade', { p_trade: t2, p_accept: false })).toBe('declined');
  });
});

describe('schedule', () => {
  test('set schedule keeps finalized weeks', async () => {
    const weeks = [
      { week: 1, start_date: '2026-10-12', end_date: '2026-10-18', matchups: [[aliceTeam, bobTeam]] },
      { week: 2, start_date: '2026-10-19', end_date: '2026-10-25', matchups: [[bobTeam, aliceTeam]] },
    ];
    await rpc(ALICE, 'commish_set_schedule', { p_league: league, p_weeks: weeks });
    await db.exec(`update matchups set final = true, home_score = 10, away_score = 5 where week = 1`);
    await rpc(ALICE, 'commish_set_schedule', { p_league: league, p_weeks: weeks });
    const s = await rpc(ALICE, 'get_league_state', { p_league: league });
    expect(s.matchups).toHaveLength(2);
    expect(s.matchups[0]).toMatchObject({ week: 1, final: true, home_score: 10 });
    await expect(
      rpc(ALICE, 'commish_set_schedule', {
        p_league: league,
        p_weeks: [{ week: 3, start_date: '2026-10-26', end_date: '2026-11-01', matchups: [[aliceTeam, aliceTeam]] }],
      }),
    ).rejects.toThrow('not in this league');
  });
});
