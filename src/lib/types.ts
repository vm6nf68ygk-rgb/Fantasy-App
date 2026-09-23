import type { Scoring } from '../../shared/scoring';

export type Slot = 'F' | 'D' | 'G' | 'UTIL' | 'BN';
export type Pos = 'C' | 'L' | 'R' | 'D' | 'G';

export interface LeagueSettings {
  scoring: Scoring;
  lineup: Record<'F' | 'D' | 'UTIL' | 'G', number>;
  roster_max: number;
  lock_hour: number;
}

export interface Team {
  id: string;
  name: string;
  owner_id: string;
}

export interface RosterEntry {
  team_id: string;
  player_id: number;
  player_name: string;
  pos: Pos;
  nhl_team: string | null;
  slot: Slot;
  start_date: string;
}

export interface DraftPick {
  id: string;
  season: number;
  round: number;
  original_team_id: string;
  owner_team_id: string;
}

export interface TradeItem {
  from_team_id: string;
  player_id: number | null;
  player_name: string | null;
  player_pos: Pos | null;
  pick_id: string | null;
}

export interface Trade {
  id: string;
  proposer_team_id: string;
  recipient_team_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'failed';
  message: string | null;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  items: TradeItem[];
}

export interface Week {
  week: number;
  start_date: string;
  end_date: string;
}

export interface Matchup {
  id: string;
  week: number;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  final: boolean;
}

export interface Activity {
  id: string;
  team_id: string | null;
  kind: string;
  summary: string;
  created_at: string;
}

export interface LeagueState {
  league: { id: string; name: string; invite_code: string; settings: LeagueSettings; commissioner_id: string };
  me: { user_id: string; team_id: string; is_commissioner: boolean };
  effective_date: string;
  today: string;
  teams: Team[];
  roster: RosterEntry[];
  picks: DraftPick[];
  trades: Trade[];
  weeks: Week[];
  matchups: Matchup[];
  activity: Activity[];
}

export interface LeagueSummary {
  id: string;
  name: string;
  team_id: string;
  team_name: string;
}
