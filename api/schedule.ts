import { fetchSchedule } from '../shared/nhl.js';
import { daysBetween, isValidDate } from '../shared/dates.js';

// GET /api/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD — NHL games and live scores.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!isValidDate(from) || !isValidDate(to) || to < from || daysBetween(from, to) > 20) {
    return Response.json({ error: 'Provide from and to dates no more than 20 days apart.' }, { status: 400 });
  }
  try {
    const games = await fetchSchedule(from, to);
    return Response.json(
      { from, to, games },
      { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
