import { createClient } from '@supabase/supabase-js';
import { fetchGameLines } from '../../shared/nhl.js';
import { addDays, todayEastern } from '../../shared/dates.js';
import { scoreTeam, type RosterStint, type Scoring } from '../../shared/scoring.js';

// Runs every morning (see vercel.json). Scores every finished week that
// hasn't been finalized yet and saves the results, which drive standings.
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response('Supabase is not configured', { status: 500 });
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Wait until two days after a week ends so late NHL stat corrections are in.
  const cutoff = addDays(todayEastern(), -1);
  const { data: pending, error } = await db
    .from('matchups')
    .select('id, league_id, week, home_team_id, away_team_id, weeks!inner(start_date, end_date)')
    .eq('final', false)
    .lt('weeks.end_date', cutoff);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const results: string[] = [];
  const linesCache = new Map<string, Awaited<ReturnType<typeof fetchGameLines>>>();
  const settingsCache = new Map<string, Scoring>();

  for (const m of pending ?? []) {
    const week = (Array.isArray(m.weeks) ? m.weeks[0] : m.weeks) as { start_date: string; end_date: string };
    const rangeKey = `${week.start_date}:${week.end_date}`;
    if (!linesCache.has(rangeKey)) linesCache.set(rangeKey, await fetchGameLines(week.start_date, week.end_date));
    if (!settingsCache.has(m.league_id)) {
      const { data } = await db.from('leagues').select('settings').eq('id', m.league_id).single();
      settingsCache.set(m.league_id, (data?.settings?.scoring ?? {}) as Scoring);
    }
    const { data: stints, error: stintError } = await db
      .from('roster_spots')
      .select('team_id, player_id, player_name, pos, nhl_team, slot, start_date, end_date')
      .eq('league_id', m.league_id)
      .lte('start_date', week.end_date)
      .or(`end_date.is.null,end_date.gt.${week.start_date}`);
    if (stintError) return Response.json({ error: stintError.message }, { status: 500 });

    const lines = linesCache.get(rangeKey)!;
    const scoring = settingsCache.get(m.league_id)!;
    const home = scoreTeam(m.home_team_id, stints as RosterStint[], lines, scoring).total;
    const away = scoreTeam(m.away_team_id, stints as RosterStint[], lines, scoring).total;
    const { error: saveError } = await db.rpc('finalize_matchup', { p_matchup: m.id, p_home: home, p_away: away });
    if (saveError) return Response.json({ error: saveError.message }, { status: 500 });
    results.push(`week ${m.week}: ${home}-${away}`);
  }
  return Response.json({ finalized: results.length, results });
}
