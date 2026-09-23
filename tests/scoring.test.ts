import { describe, expect, test } from 'vitest';
import { fantasyPoints, scoreTeam, type GameLine, type RosterStint } from '../shared/scoring';
import { roundRobinSchedule } from '../shared/schedule';
import { seasonForDate, previousSeason, formatSeason } from '../shared/dates';
import { goalieStats, skaterStats } from '../shared/nhl';

const scoring = { G: 2, A: 1, SOG: 0.1, W: 4, GA: -2, SV: 0.2 };

const stint = (over: Partial<RosterStint>): RosterStint => ({
  team_id: 'A', player_id: 1, player_name: 'P1', pos: 'C', nhl_team: 'EDM', slot: 'F',
  start_date: '2026-10-01', end_date: null, ...over,
});
const line = (playerId: number, date: string, stats: GameLine['stats']): GameLine => ({
  playerId, date, gameId: 1, team: 'EDM', opp: 'CGY', stats,
});

describe('scoring', () => {
  test('fantasy points', () => {
    expect(fantasyPoints({ G: 1, A: 2, SOG: 5 }, scoring)).toBe(4.5);
    expect(fantasyPoints({ W: 1, GA: 2, SV: 30 }, scoring)).toBe(6);
  });

  test('only games in active slots on this team count', () => {
    const stints = [
      stint({ slot: 'F', end_date: '2026-10-05' }),
      stint({ slot: 'BN', start_date: '2026-10-05', end_date: '2026-10-07' }),
      // traded away on the 7th
      stint({ team_id: 'B', slot: 'F', start_date: '2026-10-07' }),
    ];
    const lines = [
      line(1, '2026-10-04', { G: 1 }),
      line(1, '2026-10-05', { G: 2 }),
      line(1, '2026-10-07', { G: 3 }),
      line(2, '2026-10-04', { G: 5 }),
    ];
    const a = scoreTeam('A', stints, lines, scoring);
    expect(a.total).toBe(2);
    expect(a.benchTotal).toBe(4);
    expect(a.players[0].games.map((g) => g.date)).toEqual(['2026-10-04', '2026-10-05']);
    const b = scoreTeam('B', stints, lines, scoring);
    expect(b.total).toBe(6);
  });
});

describe('schedule', () => {
  test('round robin: everyone plays once per week and meets everyone', () => {
    const teams = ['a', 'b', 'c', 'd', 'e', 'f'];
    const weeks = roundRobinSchedule(teams, '2026-10-12', 5);
    expect(weeks[1]).toMatchObject({ week: 2, start_date: '2026-10-19', end_date: '2026-10-25' });
    const pairs = new Set<string>();
    for (const w of weeks) {
      const seen = w.matchups.flat();
      expect(new Set(seen).size).toBe(6);
      w.matchups.forEach(([h, a]) => pairs.add([h, a].sort().join()));
    }
    expect(pairs.size).toBe(15);
  });

  test('odd team count gives byes', () => {
    const weeks = roundRobinSchedule(['a', 'b', 'c'], '2026-10-12', 3);
    weeks.forEach((w) => expect(w.matchups).toHaveLength(1));
  });
});

describe('dates and NHL parsing', () => {
  test('season ids', () => {
    expect(seasonForDate('2026-09-23')).toBe(20262027);
    expect(seasonForDate('2027-04-10')).toBe(20262027);
    expect(previousSeason(20262027)).toBe(20252026);
    expect(formatSeason(20262027)).toBe('2026-27');
  });

  test('stat rows map to stat keys and tolerate missing fields', () => {
    expect(skaterStats({ goals: 1, assists: '2', ppPoints: 1, shots: 4 }, { hits: 3 })).toMatchObject({
      G: 1, A: 2, PPP: 1, SOG: 4, HIT: 3, BLK: 0, PM: 0,
    });
    expect(goalieStats({ wins: 1, saves: 28, goalsAgainst: 1, shutouts: null })).toMatchObject({
      W: 1, SV: 28, GA: 1, SO: 0,
    });
  });
});
