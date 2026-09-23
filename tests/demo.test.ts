import { expect, test } from 'vitest';
import { createDemoBackend } from '../src/data/demo/demoBackend';

test('demo league seeds and finalizes past weeks', async () => {
  const backend = await createDemoBackend();
  const leagues = await backend.rpc<any[]>('my_leagues');
  expect(leagues).toHaveLength(1);
  const state = await backend.rpc<any>('get_league_state', { p_league: leagues[0].id });
  expect(state.teams).toHaveLength(8);
  expect(state.roster).toHaveLength(8 * 18);
  const final = state.matchups.filter((m: any) => m.final);
  expect(final.length).toBeGreaterThanOrEqual(8);
  expect(final.every((m: any) => Number(m.home_score) > 0)).toBe(true);
  expect(state.trades.some((t: any) => t.status === 'pending' && t.recipient_team_id === state.me.team_id)).toBe(true);
  const players = await backend.demo!.stats.players();
  expect(players.players.length).toBe(32 * 21);
  expect(players.players.some((p) => p.gp > 0)).toBe(true);
}, 120000);
