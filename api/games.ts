import { fetchGameLines } from '../shared/nhl.js';
import { daysBetween, isValidDate, todayEastern } from '../shared/dates.js';

// GET /api/games?from=YYYY-MM-DD&to=YYYY-MM-DD — per-game stat lines.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!isValidDate(from) || !isValidDate(to) || to < from || daysBetween(from, to) > 20) {
    return Response.json({ error: 'Provide from and to dates no more than 20 days apart.' }, { status: 400 });
  }
  try {
    const lines = await fetchGameLines(from, to);
    // Finished ranges never change; ranges that include recent days refresh often.
    const settled = daysBetween(to, todayEastern()) > 2;
    const cache = settled
      ? 'public, s-maxage=86400, stale-while-revalidate=604800'
      : 'public, s-maxage=120, stale-while-revalidate=600';
    return Response.json({ from, to, lines }, { headers: { 'cache-control': cache } });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
