// Fantasy scoring shared by the app and the nightly server job.

export const SKATER_STATS = ['G', 'A', 'PM', 'PIM', 'PPP', 'SHP', 'GWG', 'SOG', 'HIT', 'BLK'] as const;
export const GOALIE_STATS = ['W', 'L', 'OTL', 'GA', 'SV', 'SO'] as const;
export type StatKey = (typeof SKATER_STATS)[number] | (typeof GOALIE_STATS)[number];
export type StatLine = Partial<Record<StatKey, number>>;
export type Scoring = Partial<Record<StatKey, number>>;

export const STAT_LABELS: Record<StatKey, string> = {
  G: 'Goals',
  A: 'Assists',
  PM: 'Plus/Minus',
  PIM: 'Penalty Minutes',
  PPP: 'Power Play Points',
  SHP: 'Shorthanded Points',
  GWG: 'Game-Winning Goals',
  SOG: 'Shots on Goal',
  HIT: 'Hits',
  BLK: 'Blocked Shots',
  W: 'Wins',
  L: 'Losses',
  OTL: 'Overtime Losses',
  GA: 'Goals Against',
  SV: 'Saves',
  SO: 'Shutouts',
};

/** One player's stats from one NHL game. Dates are YYYY-MM-DD (Eastern). */
export interface GameLine {
  playerId: number;
  date: string;
  gameId: number;
  team: string;
  opp: string;
  stats: StatLine;
}

/** A stint of a player on a fantasy team in one lineup slot. end_date is exclusive. */
export interface RosterStint {
  team_id: string;
  player_id: number;
  player_name: string;
  pos: string;
  nhl_team: string | null;
  slot: string;
  start_date: string;
  end_date: string | null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fantasyPoints(stats: StatLine, scoring: Scoring): number {
  let total = 0;
  for (const key of Object.keys(stats) as StatKey[]) {
    total += (stats[key] ?? 0) * (scoring[key] ?? 0);
  }
  return round2(total);
}

export function coversDate(stint: RosterStint, date: string): boolean {
  return stint.start_date <= date && (stint.end_date === null || date < stint.end_date);
}

export function isScoringSlot(slot: string): boolean {
  return slot !== 'BN';
}

export interface PlayerGameScore {
  date: string;
  opp: string;
  points: number;
  counted: boolean;
  stats: StatLine;
}

export interface PlayerWeekScore {
  player_id: number;
  player_name: string;
  pos: string;
  nhl_team: string | null;
  /** Slot on the last day of the range the player was on this team. */
  slot: string;
  points: number;
  benchPoints: number;
  games: PlayerGameScore[];
}

export interface TeamWeekScore {
  team_id: string;
  total: number;
  benchTotal: number;
  players: PlayerWeekScore[];
}

/**
 * Score one fantasy team over a range of days. A game counts when the player
 * was on this team, in a non-bench slot, on the game's date.
 */
export function scoreTeam(
  teamId: string,
  stints: RosterStint[],
  lines: GameLine[],
  scoring: Scoring,
): TeamWeekScore {
  const mine = stints.filter((s) => s.team_id === teamId);
  const byPlayer = new Map<number, RosterStint[]>();
  for (const s of mine) {
    const list = byPlayer.get(s.player_id) ?? [];
    list.push(s);
    byPlayer.set(s.player_id, list);
  }
  const linesByPlayer = new Map<number, GameLine[]>();
  for (const l of lines) {
    if (!byPlayer.has(l.playerId)) continue;
    const list = linesByPlayer.get(l.playerId) ?? [];
    list.push(l);
    linesByPlayer.set(l.playerId, list);
  }

  const players: PlayerWeekScore[] = [];
  for (const [playerId, playerStints] of byPlayer) {
    playerStints.sort((a, b) => a.start_date.localeCompare(b.start_date));
    const latest = playerStints[playerStints.length - 1];
    const games: PlayerGameScore[] = [];
    for (const line of (linesByPlayer.get(playerId) ?? []).sort((a, b) => a.date.localeCompare(b.date))) {
      const stint = playerStints.find((s) => coversDate(s, line.date));
      if (!stint) continue; // played this game while on another team
      games.push({
        date: line.date,
        opp: line.opp,
        points: fantasyPoints(line.stats, scoring),
        counted: isScoringSlot(stint.slot),
        stats: line.stats,
      });
    }
    players.push({
      player_id: playerId,
      player_name: latest.player_name,
      pos: latest.pos,
      nhl_team: latest.nhl_team,
      slot: latest.slot,
      points: round2(games.filter((g) => g.counted).reduce((t, g) => t + g.points, 0)),
      benchPoints: round2(games.filter((g) => !g.counted).reduce((t, g) => t + g.points, 0)),
      games,
    });
  }
  players.sort((a, b) => b.points - a.points || b.benchPoints - a.benchPoints);
  return {
    team_id: teamId,
    total: round2(players.reduce((t, p) => t + p.points, 0)),
    benchTotal: round2(players.reduce((t, p) => t + p.benchPoints, 0)),
    players,
  };
}

export function sumStats(lines: StatLine[]): StatLine {
  const out: StatLine = {};
  for (const line of lines) {
    for (const key of Object.keys(line) as StatKey[]) {
      out[key] = (out[key] ?? 0) + (line[key] ?? 0);
    }
  }
  return out;
}
