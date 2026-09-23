import { fantasyPoints, round2 } from '../../shared/scoring';
import type { Player } from '../data/stats';
import type { DraftPick, LeagueState, Matchup, Pos, RosterEntry, Slot, Team, Week } from './types';

export const SLOT_ORDER: Slot[] = ['F', 'D', 'UTIL', 'G', 'BN'];
export const SLOT_NAMES: Record<Slot, string> = {
  F: 'Forwards',
  D: 'Defense',
  UTIL: 'Utility',
  G: 'Goalies',
  BN: 'Bench',
};
export const POS_NAMES: Record<Pos, string> = { C: 'C', L: 'LW', R: 'RW', D: 'D', G: 'G' };

export function eligibleSlots(pos: Pos): Slot[] {
  if (pos === 'G') return ['G', 'BN'];
  if (pos === 'D') return ['D', 'UTIL', 'BN'];
  return ['F', 'UTIL', 'BN'];
}

export function teamMap(state: LeagueState): Map<string, Team> {
  return new Map(state.teams.map((t) => [t.id, t]));
}

export function teamName(state: LeagueState, id: string | null | undefined): string {
  return state.teams.find((t) => t.id === id)?.name ?? 'Unknown team';
}

export function rosterOf(state: LeagueState, teamId: string): RosterEntry[] {
  return state.roster.filter((r) => r.team_id === teamId);
}

export function ownerOf(state: LeagueState, playerId: number): string | null {
  return state.roster.find((r) => r.player_id === playerId)?.team_id ?? null;
}

const TEAM_COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#5ac8fa', '#5856d6', '#ff3b30', '#00c7be', '#a2845e', '#30b0c7', '#ffcc00'];

export function teamColor(state: LeagueState, id: string): string {
  const i = state.teams.findIndex((t) => t.id === id);
  return TEAM_COLORS[(i < 0 ? 0 : i) % TEAM_COLORS.length];
}

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The week containing today, otherwise the next one, otherwise the last one. */
export function currentWeek(state: LeagueState): Week | null {
  const { weeks, today } = state;
  if (weeks.length === 0) return null;
  return (
    weeks.find((w) => w.start_date <= today && today <= w.end_date) ??
    weeks.find((w) => w.start_date > today) ??
    weeks[weeks.length - 1]
  );
}

export function matchupFor(state: LeagueState, week: number, teamId: string): Matchup | null {
  return (
    state.matchups.find((m) => m.week === week && (m.home_team_id === teamId || m.away_team_id === teamId)) ?? null
  );
}

export interface StandingRow {
  team: Team;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
  streak: string;
}

export function standings(state: LeagueState): StandingRow[] {
  const rows = new Map<string, StandingRow & { results: string[] }>();
  for (const team of state.teams) rows.set(team.id, { team, w: 0, l: 0, t: 0, pf: 0, pa: 0, streak: '', results: [] });
  for (const m of [...state.matchups].sort((a, b) => a.week - b.week)) {
    if (!m.final) continue;
    const home = rows.get(m.home_team_id);
    const away = rows.get(m.away_team_id);
    if (!home || !away) continue;
    const hs = Number(m.home_score ?? 0);
    const as = Number(m.away_score ?? 0);
    home.pf += hs; home.pa += as; away.pf += as; away.pa += hs;
    if (hs > as) { home.w++; away.l++; home.results.push('W'); away.results.push('L'); }
    else if (as > hs) { away.w++; home.l++; home.results.push('L'); away.results.push('W'); }
    else { home.t++; away.t++; home.results.push('T'); away.results.push('T'); }
  }
  return [...rows.values()]
    .map(({ results, ...r }) => {
      let n = 0;
      const last = results[results.length - 1];
      for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
      return { ...r, pf: round2(r.pf), pa: round2(r.pa), streak: last ? `${last}${n}` : '–' };
    })
    .sort((a, b) => b.w + b.t / 2 - (a.w + a.t / 2) || b.pf - a.pf);
}

export function recordLabel(row: StandingRow | undefined): string {
  if (!row) return '0-0';
  return row.t ? `${row.w}-${row.l}-${row.t}` : `${row.w}-${row.l}`;
}

export function pickLabel(state: LeagueState, pick: DraftPick): string {
  const via = pick.original_team_id !== pick.owner_team_id ? ` (${teamName(state, pick.original_team_id)})` : '';
  return `${pick.season} Round ${pick.round}${via}`;
}

/** Season fantasy points, falling back to last season before games are played. */
export function seasonPoints(player: Player | undefined, state: LeagueState): { points: number; gp: number; prev: boolean } {
  if (!player) return { points: 0, gp: 0, prev: false };
  const scoring = state.league.settings.scoring;
  if (player.gp > 0) return { points: fantasyPoints(player.stats, scoring), gp: player.gp, prev: false };
  return { points: fantasyPoints(player.prevStats, scoring), gp: player.prevGp, prev: true };
}

export function perGame(points: number, gp: number): string {
  return gp ? (points / gp).toFixed(2) : '0.00';
}

export function formatPoints(n: number | null | undefined): string {
  if (n == null) return '–';
  return Number(n).toFixed(1);
}

export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function weekRange(w: Week): string {
  return `${shortDate(w.start_date)} – ${shortDate(w.end_date)}`;
}

export function relativeTime(iso: string): string {
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function lockDescription(state: LeagueState): string {
  const hour = state.league.settings.lock_hour;
  const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
  const today = state.effective_date === state.today;
  return today
    ? `Moves now count for today's games. Lineups lock at ${label} ET.`
    : `Today's lineup locked at ${label} ET. Moves now take effect tomorrow.`;
}
