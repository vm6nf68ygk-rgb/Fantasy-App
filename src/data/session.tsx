import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scoreTeam, type RosterStint, type TeamWeekScore } from '../../shared/scoring';
import { useUI } from '../components/overlays';
import type { LeagueState, LeagueSummary, Week } from '../lib/types';
import { createBackend, type AuthUser, type Backend } from './backend';
import { liveStats, type Player, type StatsSource } from './stats';

// ---------------------------------------------------------------------------
// Session: which backend, which user.
// ---------------------------------------------------------------------------

interface Session {
  backend: Backend;
  stats: StatsSource;
  /** Changes whenever the stats source changes, for cache keys. */
  statsKey: string;
  user: AuthUser | null;
  refreshStats(): void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}

export function SessionProvider({
  children,
  loading,
  failed,
}: {
  children: ReactNode;
  loading: ReactNode;
  failed: (error: Error) => ReactNode;
}) {
  const [backend, setBackend] = useState<Backend | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    let unsubscribe = () => {};
    createBackend()
      .then(async (b) => {
        setUser(await b.currentUser());
        unsubscribe = b.onAuthChange((u) => {
          setUser(u);
          queryClient.invalidateQueries();
        });
        setBackend(b);
      })
      .catch((e: Error) => setError(e));
    return () => unsubscribe();
  }, [queryClient]);

  const value = useMemo<Session | null>(
    () =>
      backend && {
        backend,
        user,
        stats: backend.demo ? backend.demo.stats : liveStats,
        statsKey: backend.demo ? `demo-${statsVersion}` : 'live',
        refreshStats: () => setStatsVersion((v) => v + 1),
      },
    // statsVersion picks up the new stats object after a demo reset.
    [backend, user, statsVersion],
  );

  if (error) return <>{failed(error)}</>;
  if (!value) return <>{loading}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

// ---------------------------------------------------------------------------
// League selection and state.
// ---------------------------------------------------------------------------

const LEAGUE_KEY = 'fantasy-league-id';

interface LeagueCtx {
  leagues: LeagueSummary[];
  leagueId: string | null;
  setLeagueId(id: string | null): void;
  refetchLeagues(): Promise<unknown>;
}

const LeagueContext = createContext<LeagueCtx | null>(null);

export function useLeagueSelection(): LeagueCtx {
  const c = useContext(LeagueContext);
  if (!c) throw new Error('useLeagueSelection must be used inside LeagueProvider');
  return c;
}

function readStoredLeague(): string | null {
  try {
    return localStorage.getItem(LEAGUE_KEY);
  } catch {
    return null;
  }
}

export function useLeaguesQuery() {
  const { backend, user } = useSession();
  return useQuery({
    queryKey: ['leagues', user?.id],
    queryFn: () => backend.rpc<LeagueSummary[]>('my_leagues'),
    enabled: !!user,
  });
}

export function LeagueProvider({
  children,
  loading,
  none,
}: {
  children: ReactNode;
  loading: ReactNode;
  none: ReactNode;
}) {
  const leaguesQuery = useLeaguesQuery();
  const [stored, setStored] = useState<string | null>(readStoredLeague);
  const leagues = leaguesQuery.data ?? [];
  const leagueId = leagues.find((l) => l.id === stored)?.id ?? leagues[0]?.id ?? null;

  const setLeagueId = useCallback((id: string | null) => {
    setStored(id);
    try {
      if (id) localStorage.setItem(LEAGUE_KEY, id);
      else localStorage.removeItem(LEAGUE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ leagues, leagueId, setLeagueId, refetchLeagues: leaguesQuery.refetch }),
    [leagues, leagueId, setLeagueId, leaguesQuery.refetch],
  );

  if (leaguesQuery.isLoading) return <>{loading}</>;
  return (
    <LeagueContext.Provider value={value}>{leagueId ? children : none}</LeagueContext.Provider>
  );
}

export function useLeague() {
  const { backend, user } = useSession();
  const { leagueId } = useLeagueSelection();
  return useQuery({
    queryKey: ['league', leagueId, user?.id],
    queryFn: () => backend.rpc<LeagueState>('get_league_state', { p_league: leagueId }),
    enabled: !!leagueId,
    refetchInterval: 60_000,
  });
}

/** Run a database action, refresh league data, and show any error as an alert. */
export function useAction() {
  const { backend } = useSession();
  const queryClient = useQueryClient();
  const ui = useUI();
  const mutation = useMutation({
    mutationFn: ({ name, args }: { name: string; args: Record<string, unknown> }) => backend.rpc(name, args),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['league'] });
      queryClient.invalidateQueries({ queryKey: ['roster-history'] });
      queryClient.invalidateQueries({ queryKey: ['leagues'] });
    },
  });
  const run = useCallback(
    async <T = unknown,>(name: string, args: Record<string, unknown>, success?: string): Promise<T | undefined> => {
      try {
        const result = (await mutation.mutateAsync({ name, args })) as T;
        if (success) ui.toast(success);
        return result;
      } catch (e) {
        await ui.alert('Something went wrong', (e as Error).message);
        return undefined;
      }
    },
    [mutation, ui],
  );
  return { run, busy: mutation.isPending };
}

// ---------------------------------------------------------------------------
// NHL data.
// ---------------------------------------------------------------------------

export function usePlayers() {
  const { stats, statsKey } = useSession();
  const query = useQuery({
    queryKey: ['players', statsKey],
    queryFn: () => stats.players(),
    staleTime: 10 * 60_000,
  });
  const byId = useMemo(() => new Map<number, Player>((query.data?.players ?? []).map((p) => [p.id, p])), [query.data]);
  return { ...query, byId };
}

export function useSchedule(from: string | undefined, to: string | undefined) {
  const { stats, statsKey } = useSession();
  return useQuery({
    queryKey: ['schedule', statsKey, from, to],
    queryFn: () => stats.schedule(from!, to!),
    enabled: !!from && !!to,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/** Live fantasy scores for every team in a week. */
export function useWeekScores(state: LeagueState | undefined, week: Week | null | undefined) {
  const { backend, stats, statsKey } = useSession();
  const from = week?.start_date;
  const to = week && state ? (week.end_date < state.today ? week.end_date : state.today) : undefined;
  const started = !!from && !!to && from <= to;

  const history = useQuery({
    queryKey: ['roster-history', state?.league.id, from, week?.end_date],
    queryFn: () =>
      backend.rpc<RosterStint[]>('get_roster_history', {
        p_league: state!.league.id,
        p_from: from,
        p_to: week!.end_date,
      }),
    enabled: !!state && !!week,
  });
  const lines = useQuery({
    queryKey: ['games', statsKey, from, to],
    queryFn: () => stats.games(from!, to!),
    enabled: started,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const scores = useMemo(() => {
    if (!state || !history.data) return null;
    const map = new Map<string, TeamWeekScore>();
    for (const team of state.teams) {
      map.set(team.id, scoreTeam(team.id, history.data, started ? lines.data ?? [] : [], state.league.settings.scoring));
    }
    return map;
  }, [state, history.data, lines.data, started]);

  return {
    scores,
    stints: history.data,
    isLoading: history.isLoading || (started && lines.isLoading),
    error: history.error ?? lines.error,
  };
}
