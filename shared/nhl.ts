// Reads the NHL's public stats services (the same ones NHL.com uses) and
// turns them into the small shapes this app needs. Runs on the server,
// because the NHL services don't allow requests straight from a browser.
//
// Endpoint reference: https://github.com/Zmalski/NHL-API-Reference

import type { GameLine, StatLine } from './scoring.js';
import { addDays, previousSeason } from './dates.js';

const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
const WEB_BASE = 'https://api-web.nhle.com/v1';

export const NHL_TEAMS = [
  'ANA', 'BOS', 'BUF', 'CAR', 'CBJ', 'CGY', 'CHI', 'COL', 'DAL', 'DET', 'EDM',
  'FLA', 'LAK', 'MIN', 'MTL', 'NJD', 'NSH', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT',
  'SEA', 'SJS', 'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WPG', 'WSH',
] as const;

export interface Player {
  id: number;
  name: string;
  pos: 'C' | 'L' | 'R' | 'D' | 'G';
  team: string | null;
  number: number | null;
  headshot: string | null;
  gp: number;
  stats: StatLine;
  prevGp: number;
  prevStats: StatLine;
}

export interface NhlGame {
  id: number;
  date: string;
  start: string;
  state: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
}

type Row = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const localized = (v: unknown): string =>
  typeof v === 'object' && v !== null ? str((v as Row).default) : str(v);
const lastTeam = (v: unknown): string | null => {
  const parts = str(v).split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
};
const toPos = (v: unknown): Player['pos'] | null => {
  const p = str(v).toUpperCase();
  return p === 'C' || p === 'L' || p === 'R' || p === 'D' || p === 'G' ? p : null;
};

export function skaterStats(summary: Row, realtime?: Row): StatLine {
  return {
    G: num(summary.goals),
    A: num(summary.assists),
    PM: num(summary.plusMinus),
    PIM: num(summary.penaltyMinutes),
    PPP: num(summary.ppPoints),
    SHP: num(summary.shPoints),
    GWG: num(summary.gameWinningGoals),
    SOG: num(summary.shots),
    HIT: num(realtime?.hits),
    BLK: num(realtime?.blockedShots),
  };
}

export function goalieStats(row: Row): StatLine {
  return {
    W: num(row.wins),
    L: num(row.losses),
    OTL: num(row.otLosses),
    GA: num(row.goalsAgainst),
    SV: num(row.saves),
    SO: num(row.shutouts),
  };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'fantasy-hockey-league-app' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`NHL request failed (${res.status}): ${url}`);
  return res.json();
}

/** Fetch every row of a stats report, following pagination if the API caps the page size. */
async function statsReport(
  kind: 'skater' | 'goalie',
  report: 'summary' | 'realtime',
  cayenneExp: string,
  isGame: boolean,
): Promise<Row[]> {
  const sort = JSON.stringify(
    isGame
      ? [{ property: 'playerId', direction: 'ASC' }, { property: 'gameId', direction: 'ASC' }]
      : [{ property: 'playerId', direction: 'ASC' }],
  );
  const rows: Row[] = [];
  for (let page = 0; page < 60; page++) {
    const params = new URLSearchParams({
      isAggregate: 'false',
      isGame: String(isGame),
      start: String(rows.length),
      limit: '-1',
      sort,
      cayenneExp,
    });
    const body = (await getJson(`${STATS_BASE}/${kind}/${report}?${params}`)) as { data?: Row[]; total?: number };
    const data = Array.isArray(body.data) ? body.data : [];
    rows.push(...data);
    const total = num(body.total);
    if (data.length === 0 || rows.length >= total) break;
  }
  return rows;
}

async function seasonTotals(season: number) {
  const exp = `seasonId=${season} and gameTypeId=2`;
  const [summary, realtime, goalies] = await Promise.all([
    statsReport('skater', 'summary', exp, false),
    statsReport('skater', 'realtime', exp, false).catch(() => [] as Row[]),
    statsReport('goalie', 'summary', exp, false),
  ]);
  return { summary, realtime, goalies };
}

async function roster(team: string): Promise<Row[]> {
  try {
    const body = (await getJson(`${WEB_BASE}/roster/${team}/current`)) as Record<string, Row[] | undefined>;
    return [...(body.forwards ?? []), ...(body.defensemen ?? []), ...(body.goalies ?? [])].map((p) => ({
      ...p,
      team,
    }));
  } catch {
    return [];
  }
}

/**
 * Every NHL player on a current roster or with games this season or last,
 * with season totals for both seasons.
 */
export async function fetchPlayers(season: number): Promise<Player[]> {
  const prev = previousSeason(season);
  const [rosters, current, last] = await Promise.all([
    Promise.all(NHL_TEAMS.map(roster)).then((r) => r.flat()),
    seasonTotals(season),
    seasonTotals(prev),
  ]);

  const players = new Map<number, Player>();
  const ensure = (id: number, name: string, pos: Player['pos'] | null, team: string | null): Player | null => {
    const existing = players.get(id);
    if (existing) return existing;
    if (!id || !name || !pos) return null;
    const p: Player = { id, name, pos, team, number: null, headshot: null, gp: 0, stats: {}, prevGp: 0, prevStats: {} };
    players.set(id, p);
    return p;
  };

  for (const r of rosters) {
    const name = `${localized(r.firstName)} ${localized(r.lastName)}`.trim();
    const p = ensure(num(r.id), name, toPos(r.positionCode), str(r.team));
    if (!p) continue;
    p.number = r.sweaterNumber == null ? null : num(r.sweaterNumber);
    p.headshot = str(r.headshot) || null;
  }

  const apply = (totals: Awaited<ReturnType<typeof seasonTotals>>, isCurrent: boolean) => {
    const realtime = new Map(totals.realtime.map((r) => [num(r.playerId), r]));
    for (const r of totals.summary) {
      const id = num(r.playerId);
      const p = ensure(id, str(r.skaterFullName), toPos(r.positionCode), lastTeam(r.teamAbbrevs));
      if (!p) continue;
      const stats = skaterStats(r, realtime.get(id));
      if (isCurrent) {
        p.gp = num(r.gamesPlayed);
        p.stats = stats;
      } else {
        p.prevGp = num(r.gamesPlayed);
        p.prevStats = stats;
      }
    }
    for (const r of totals.goalies) {
      const p = ensure(num(r.playerId), str(r.goalieFullName), 'G', lastTeam(r.teamAbbrevs));
      if (!p) continue;
      if (isCurrent) {
        p.gp = num(r.gamesPlayed);
        p.stats = goalieStats(r);
      } else {
        p.prevGp = num(r.gamesPlayed);
        p.prevStats = goalieStats(r);
      }
    }
  };
  apply(last, false);
  apply(current, true);

  return [...players.values()];
}

/** Per-game stat lines for every player between two dates (inclusive). */
export async function fetchGameLines(from: string, to: string): Promise<GameLine[]> {
  const exp = `gameDate>="${from}" and gameDate<="${to} 23:59:59" and gameTypeId=2`;
  const [summary, realtime, goalies] = await Promise.all([
    statsReport('skater', 'summary', exp, true),
    statsReport('skater', 'realtime', exp, true).catch(() => [] as Row[]),
    statsReport('goalie', 'summary', exp, true),
  ]);
  const key = (r: Row) => `${num(r.playerId)}:${num(r.gameId)}`;
  const rt = new Map(realtime.map((r) => [key(r), r]));
  const line = (r: Row, stats: StatLine): GameLine => ({
    playerId: num(r.playerId),
    date: str(r.gameDate).slice(0, 10),
    gameId: num(r.gameId),
    team: str(r.teamAbbrev) || lastTeam(r.teamAbbrevs) || '',
    opp: str(r.opponentTeamAbbrev),
    stats,
  });
  return [
    ...summary.map((r) => line(r, skaterStats(r, rt.get(key(r))))),
    ...goalies.map((r) => line(r, goalieStats(r))),
  ];
}

/** NHL games between two dates (inclusive), regular season and playoffs. */
export async function fetchSchedule(from: string, to: string): Promise<NhlGame[]> {
  const games = new Map<number, NhlGame>();
  // Each schedule call returns the week starting on the given date.
  for (let d = from; d <= to; d = addDays(d, 7)) {
    const body = (await getJson(`${WEB_BASE}/schedule/${d}`)) as { gameWeek?: Row[] };
    for (const day of body.gameWeek ?? []) {
      const date = str(day.date);
      if (date < from || date > to) continue;
      for (const g of (day.games as Row[] | undefined) ?? []) {
        const home = (g.homeTeam ?? {}) as Row;
        const away = (g.awayTeam ?? {}) as Row;
        games.set(num(g.id), {
          id: num(g.id),
          date,
          start: str(g.startTimeUTC),
          state: str(g.gameState),
          home: str(home.abbrev),
          away: str(away.abbrev),
          homeScore: home.score == null ? null : num(home.score),
          awayScore: away.score == null ? null : num(away.score),
        });
      }
    }
  }
  return [...games.values()].sort((a, b) => a.start.localeCompare(b.start));
}
