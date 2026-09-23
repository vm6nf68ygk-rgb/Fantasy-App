import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { addDays, formatSeason, previousSeason } from '../../shared/dates';
import { fantasyPoints, GOALIE_STATS, type StatKey, type StatLine } from '../../shared/scoring';
import { PlayerAvatar, TeamLogo } from '../components/avatars';
import { IconPersonPlus, IconTrash } from '../components/icons';
import { Sheet, useUI } from '../components/overlays';
import { Row, Section, Spinner } from '../components/ui';
import { eligibleSlots, formatPoints, ownerOf, perGame, POS_NAMES, rosterOf, shortDate, SLOT_NAMES, teamName } from '../lib/league';
import type { Pos, Slot } from '../lib/types';
import { useAction, useLeague, usePlayers, useSession } from '../data/session';

export function PlayerSheet({ playerId, onClose }: { playerId: number | null; onClose: () => void }) {
  return (
    <Sheet open={playerId != null} onClose={onClose} title="Player">
      {playerId != null && <PlayerDetail playerId={playerId} onClose={onClose} />}
    </Sheet>
  );
}

function StatGrid({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="stat-grid">
      {items.map((i) => (
        <div className="stat-cell" key={i.label}>
          <div className="stat-value">{i.value}</div>
          <div className="stat-label">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

function statItems(pos: Pos, stats: StatLine, keys?: readonly StatKey[]) {
  const list = keys ?? (pos === 'G' ? GOALIE_STATS : (['G', 'A', 'PM', 'PPP', 'SOG', 'HIT', 'BLK', 'PIM'] as const));
  return list.map((k) => ({ label: k === 'PM' ? '+/-' : k, value: stats[k] ?? 0 }));
}

function PlayerDetail({ playerId, onClose }: { playerId: number; onClose: () => void }) {
  const { data: state } = useLeague();
  const { byId, data: playersData, isLoading } = usePlayers();
  const { stats, statsKey } = useSession();
  const { run } = useAction();
  const ui = useUI();
  const navigate = useNavigate();

  const today = state?.today;
  const recent = useQuery({
    queryKey: ['games', statsKey, today && addDays(today, -13), today],
    queryFn: () => stats.games(addDays(today!, -13), today!),
    enabled: !!today,
    staleTime: 5 * 60_000,
  });

  const player = byId.get(playerId);
  const rosterEntry = state?.roster.find((r) => r.player_id === playerId);
  const log = useMemo(
    () => (recent.data ?? []).filter((l) => l.playerId === playerId).sort((a, b) => b.date.localeCompare(a.date)),
    [recent.data, playerId],
  );

  if (!state || (isLoading && !rosterEntry)) return <Spinner />;
  const name = player?.name ?? rosterEntry?.player_name ?? 'Unknown player';
  const pos = (player?.pos ?? rosterEntry?.pos ?? 'C') as Pos;
  const nhlTeam = player?.team ?? rosterEntry?.nhl_team ?? null;
  const owner = ownerOf(state, playerId);
  const mine = owner === state.me.team_id;
  const scoring = state.league.settings.scoring;
  const info = { id: playerId, name, pos, team: nhlTeam };

  const addPlayer = async (anchor: Element) => {
    const myRoster = rosterOf(state, state.me.team_id);
    if (myRoster.length >= state.league.settings.roster_max) {
      const drop = await ui.actionSheet({
        title: 'Your roster is full',
        message: `Choose a player to drop for ${name}.`,
        anchor,
        actions: [...myRoster]
          .sort((a, b) => a.player_name.localeCompare(b.player_name))
          .map((r) => ({
            label: `${r.player_name} (${POS_NAMES[r.pos]})`,
            value: r.player_id,
            destructive: true,
            icon: <IconTrash />,
          })),
      });
      if (drop == null) return;
      const ok = await run('add_player', { p_league: state.league.id, p_player: info, p_drop_player_id: drop }, `Added ${name}`);
      if (ok !== undefined) onClose();
      return;
    }
    const ok = await ui.confirm({ title: `Add ${name}?`, message: 'They’ll start on your bench.', confirm: 'Add' });
    if (ok) await run('add_player', { p_league: state.league.id, p_player: info }, `Added ${name}`);
  };

  const dropPlayer = async () => {
    const ok = await ui.confirm({
      title: `Drop ${name}?`,
      message: 'Anyone in the league will be able to add them.',
      confirm: 'Drop',
      destructive: true,
    });
    if (ok && (await run('drop_player', { p_league: state.league.id, p_player_id: playerId }, `Dropped ${name}`)) !== undefined) {
      onClose();
    }
  };

  const moveSlot = (slot: Slot) =>
    run('set_lineup_slot', { p_league: state.league.id, p_player_id: playerId, p_slot: slot }, `Moved to ${SLOT_NAMES[slot]}`);

  const assign = async (anchor: Element) => {
    const team = await ui.actionSheet({
      title: `Assign ${name} to…`,
      anchor,
      actions: state.teams.map((t) => ({
        label: t.name,
        value: t.id,
        checked: t.id === owner,
        disabled: t.id === owner,
        icon: <IconPersonPlus />,
      })),
    });
    if (team) await run('commish_assign_player', { p_league: state.league.id, p_team: team, p_player: info }, 'Player assigned');
  };

  const release = async () => {
    const ok = await ui.confirm({ title: `Release ${name}?`, message: `Removes them from ${teamName(state, owner)}.`, confirm: 'Release', destructive: true });
    if (ok) await run('commish_release_player', { p_league: state.league.id, p_player_id: playerId }, 'Player released');
  };

  const current = player && player.gp > 0;
  const seasonStats = current ? player!.stats : player?.prevStats ?? {};
  const gp = current ? player!.gp : player?.prevGp ?? 0;
  const pts = fantasyPoints(seasonStats, scoring);
  const seasonLabel = playersData
    ? formatSeason(current ? playersData.season : previousSeason(playersData.season))
    : '';

  return (
    <>
      <div className="hero" style={{ paddingBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <PlayerAvatar name={name} headshot={player?.headshot} size="xl" />
        </div>
        <h1 style={{ fontSize: 24, marginTop: 12 }}>{name}</h1>
        <p style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
          <TeamLogo abbrev={nhlTeam} size={20} />
          {[player?.number != null ? `#${player.number}` : null, POS_NAMES[pos], nhlTeam].filter(Boolean).join(' · ')}
        </p>
        <div style={{ marginTop: 10 }}>
          {owner ? (
            <span className={`badge ${mine ? 'blue' : ''}`}>{mine ? 'On your team' : teamName(state, owner)}</span>
          ) : (
            <span className="badge green">Free agent</span>
          )}
        </div>
      </div>

      <div className="pad" style={{ marginBottom: 28 }}>
        {!owner && (
          <button className="btn" onClick={(e) => addPlayer(e.currentTarget)}>
            Add Player
          </button>
        )}
        {owner && !mine && (
          <button className="btn" onClick={() => { onClose(); navigate(`/trades/new?team=${owner}&get=${playerId}`); }}>
            Propose Trade
          </button>
        )}
      </div>

      {mine && rosterEntry && (
        <Section header="Lineup Slot" footer="Changes follow your league’s daily lineup lock.">
          {eligibleSlots(pos).map((slot) => (
            <Row
              key={slot}
              title={SLOT_NAMES[slot]}
              onClick={() => moveSlot(slot)}
              trailing={rosterEntry.slot === slot ? <span className="check">✓</span> : undefined}
            />
          ))}
        </Section>
      )}

      <Section header={`${seasonLabel} Season${current ? '' : ' (last season)'}`}>
        <StatGrid
          items={[
            { label: 'Fantasy Pts', value: formatPoints(pts) },
            { label: 'GP', value: gp },
            { label: 'Pts / GP', value: perGame(pts, gp) },
            ...(pos === 'G'
              ? [{ label: 'SV', value: seasonStats.SV ?? 0 }]
              : [{ label: 'Points', value: (seasonStats.G ?? 0) + (seasonStats.A ?? 0) }]),
            ...statItems(pos, seasonStats, pos === 'G' ? (['W', 'L', 'OTL', 'GA', 'SO'] as const) : undefined).slice(0, pos === 'G' ? 4 : 8),
          ]}
        />
      </Section>

      <Section header="Last 14 Days">
        {recent.isLoading ? (
          <Spinner />
        ) : log.length === 0 ? (
          <Row title="No games" variant="muted" />
        ) : (
          log.map((g) => (
            <Row
              key={g.gameId}
              title={`${shortDate(g.date)} · vs ${g.opp}`}
              subtitle={statSummary(pos, g.stats)}
              trailing={<span className="points">{formatPoints(fantasyPoints(g.stats, scoring))}</span>}
            />
          ))
        )}
      </Section>

      {(mine || state.me.is_commissioner) && (
        <Section header={mine ? undefined : 'Commissioner'}>
          {state.me.is_commissioner && <Row title="Assign to Team…" variant="action" onClick={(e) => assign(e.currentTarget)} />}
          {state.me.is_commissioner && owner && !mine && <Row title="Release from Team" variant="destructive" onClick={release} />}
          {mine && <Row title="Drop Player" variant="destructive" onClick={dropPlayer} />}
        </Section>
      )}
    </>
  );
}

function statSummary(pos: Pos, s: StatLine): string {
  if (pos === 'G') {
    const result = s.W ? 'W' : s.OTL ? 'OTL' : s.L ? 'L' : 'ND';
    return `${result} · ${s.SV ?? 0} SV · ${s.GA ?? 0} GA${s.SO ? ' · SO' : ''}`;
  }
  const parts = [`${s.G ?? 0} G`, `${s.A ?? 0} A`, `${(s.PM ?? 0) > 0 ? '+' : ''}${s.PM ?? 0}`, `${s.SOG ?? 0} SOG`];
  if (s.HIT) parts.push(`${s.HIT} HIT`);
  if (s.BLK) parts.push(`${s.BLK} BLK`);
  return parts.join(' · ');
}
