import { useDeferredValue, useMemo, useState } from 'react';
import { formatSeason, previousSeason } from '../../shared/dates';
import { PlayerAvatar } from '../components/avatars';
import { ErrorNote, Page, Row, Section, SearchField, Segmented, Spinner } from '../components/ui';
import { formatPoints, perGame, POS_NAMES, seasonPoints, teamName } from '../lib/league';
import { useLeague, usePlayers } from '../data/session';
import { PlayerSheet } from './PlayerSheet';

type PosFilter = 'all' | 'F' | 'D' | 'G';
type Status = 'available' | 'all';

const PAGE = 60;

export function PlayersScreen() {
  const { data: state } = useLeague();
  const players = usePlayers();
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<PosFilter>('all');
  const [status, setStatus] = useState<Status>('available');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<number | null>(null);
  const q = useDeferredValue(query.trim().toLowerCase());

  const owners = useMemo(() => new Map(state?.roster.map((r) => [r.player_id, r.team_id]) ?? []), [state]);

  const rows = useMemo(() => {
    if (!state || !players.data) return [];
    return players.data.players
      .filter((p) => {
        if (pos === 'F' && !['C', 'L', 'R'].includes(p.pos)) return false;
        if (pos === 'D' && p.pos !== 'D') return false;
        if (pos === 'G' && p.pos !== 'G') return false;
        if (status === 'available' && owners.has(p.id)) return false;
        if (q && !p.name.toLowerCase().includes(q) && !(p.team ?? '').toLowerCase().includes(q)) return false;
        return true;
      })
      .map((p) => ({ p, sp: seasonPoints(p, state) }))
      .sort((a, b) => b.sp.points - a.sp.points || a.p.name.localeCompare(b.p.name));
  }, [players.data, state, pos, status, q, owners]);

  const usingLastSeason = rows.length > 0 && rows.slice(0, 20).every((r) => r.sp.prev);
  const season = players.data?.season;

  return (
    <Page title="Players">
      <SearchField value={query} onChange={(v) => { setQuery(v); setLimit(PAGE); }} placeholder="Search players or NHL teams" />
      <Segmented<Status>
        options={[
          { value: 'available', label: 'Free Agents' },
          { value: 'all', label: 'All Players' },
        ]}
        value={status}
        onChange={(v) => { setStatus(v); setLimit(PAGE); }}
      />
      <Segmented<PosFilter>
        options={[
          { value: 'all', label: 'All' },
          { value: 'F', label: 'Forwards' },
          { value: 'D', label: 'Defense' },
          { value: 'G', label: 'Goalies' },
        ]}
        value={pos}
        onChange={(v) => { setPos(v); setLimit(PAGE); }}
      />
      {players.error ? (
        <ErrorNote error={players.error} retry={players.refetch} />
      ) : !state || players.isLoading ? (
        <Spinner />
      ) : (
        <Section
          header={`${rows.length} players`}
          action={
            season && (
              <span style={{ textTransform: 'none' }}>
                {usingLastSeason ? `${formatSeason(previousSeason(season))} FPts` : `${formatSeason(season)} FPts`}
              </span>
            )
          }
          footer={
            usingLastSeason
              ? 'The new season hasn’t started, so rankings use last season’s fantasy points.'
              : players.data && `Stats updated ${new Date(players.data.updated).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
          }
        >
          {rows.slice(0, limit).map(({ p, sp }) => {
            const owner = owners.get(p.id);
            return (
              <Row
                key={p.id}
                leadingKind="avatar"
                onClick={() => setSelected(p.id)}
                leading={<PlayerAvatar name={p.name} headshot={p.headshot} />}
                title={p.name}
                subtitle={
                  <>
                    {POS_NAMES[p.pos]} · {p.team ?? 'FA'}
                    {owner ? (
                      <> · <span style={{ color: owner === state.me.team_id ? 'var(--blue)' : undefined }}>{teamName(state, owner)}</span></>
                    ) : null}
                  </>
                }
                trailing={
                  <div style={{ textAlign: 'right' }}>
                    <div className="points">{formatPoints(sp.points)}</div>
                    <div className="small muted num">{perGame(sp.points, sp.gp)}/gp</div>
                  </div>
                }
              />
            );
          })}
          {rows.length === 0 && <Row title="No players match" variant="muted" />}
          {rows.length > limit && (
            <Row title="Show More" variant="action" className="center" onClick={() => setLimit((l) => l + PAGE)} />
          )}
        </Section>
      )}
      <PlayerSheet playerId={selected} onClose={() => setSelected(null)} />
    </Page>
  );
}
