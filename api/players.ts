import { fetchPlayers } from '../shared/nhl.js';
import { seasonForDate, todayEastern } from '../shared/dates.js';

// GET /api/players — every NHL player with season stats. Cached at the edge.
export async function GET(): Promise<Response> {
  const season = seasonForDate(todayEastern());
  try {
    const players = await fetchPlayers(season);
    return Response.json(
      { season, updated: new Date().toISOString(), players },
      { headers: { 'cache-control': 'public, s-maxage=900, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
