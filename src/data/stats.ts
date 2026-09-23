import type { NhlGame, Player } from '../../shared/nhl';
import type { GameLine } from '../../shared/scoring';

export type { NhlGame, Player };

export interface PlayersResponse {
  season: number;
  updated: string;
  players: Player[];
}

/** Where NHL data comes from: the app's server functions, or generated demo data. */
export interface StatsSource {
  demo: boolean;
  players(): Promise<PlayersResponse>;
  games(from: string, to: string): Promise<GameLine[]>;
  schedule(from: string, to: string): Promise<NhlGame[]>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Could not load NHL data (${res.status}).`);
  return body as T;
}

export const liveStats: StatsSource = {
  demo: false,
  players: () => getJson<PlayersResponse>('/api/players'),
  games: (from, to) =>
    getJson<{ lines: GameLine[] }>(`/api/games?from=${from}&to=${to}`).then((r) => r.lines),
  schedule: (from, to) =>
    getJson<{ games: NhlGame[] }>(`/api/schedule?from=${from}&to=${to}`).then((r) => r.games),
};
