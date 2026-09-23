import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayerAvatar, GameChip, TeamAvatar } from '../components/avatars';
import { IconArrows } from '../components/icons';
import { useUI } from '../components/overlays';
import { ErrorNote, Page, Row, Section, Spinner } from '../components/ui';
import {
  eligibleSlots,
  formatPoints,
  lockDescription,
  pickLabel,
  POS_NAMES,
  recordLabel,
  rosterOf,
  seasonPoints,
  SLOT_NAMES,
  SLOT_ORDER,
  standings,
} from '../lib/league';
import type { RosterEntry, Slot } from '../lib/types';
import { useAction, useLeague, usePlayers, useSchedule } from '../data/session';
import { PlayerSheet } from './PlayerSheet';

export function TeamScreen() {
  const { data: state, error, refetch } = useLeague();
  const { byId } = usePlayers();
  const params = useParams();
  const navigate = useNavigate();
  const ui = useUI();
  const { run } = useAction();
  const [player, setPlayer] = useState<number | null>(null);
  const today = useSchedule(state?.today, state?.today);

  if (error) return <Page title="Team"><ErrorNote error={error} retry={refetch} /></Page>;
  if (!state) return <Page title="Team"><Spinner /></Page>;

  const teamId = params.teamId ?? state.me.team_id;
  const team = state.teams.find((t) => t.id === teamId);
  if (!team) return <Page title="Team" back><ErrorNote error={new Error('Team not found.')} /></Page>;
  const mine = teamId === state.me.team_id;
  const roster = rosterOf(state, teamId);
  const record = standings(state).find((s) => s.team.id === teamId);
  const picks = state.picks.filter((p) => p.owner_team_id === teamId);
  const { lineup, roster_max } = state.league.settings;

  // Tap a player on your own team: quick lineup moves, like the iOS context menu.
  const onPlayerTap = async (r: RosterEntry) => {
    if (!mine) return setPlayer(r.player_id);
    const slots = eligibleSlots(r.pos).filter((s) => s !== r.slot);
    const choice = await ui.actionSheet<Slot | 'info' | 'swap'>({
      title: r.player_name,
      message: `${POS_NAMES[r.pos]} · ${r.nhl_team ?? ''} · ${SLOT_NAMES[r.slot]}`,
      actions: [
        ...slots.map((s) => ({ label: s === 'BN' ? 'Move to Bench' : `Move to ${SLOT_NAMES[s]}`, value: s })),
        ...(r.slot !== 'BN' ? [] : [{ label: 'Swap with a Starter…', value: 'swap' as const }]),
        { label: 'Player Card', value: 'info' as const },
      ],
    });
    if (!choice) return;
    if (choice === 'info') return setPlayer(r.player_id);
    if (choice === 'swap') return swapIn(r);
    const used = roster.filter((x) => x.slot === choice).length;
    if (choice !== 'BN' && used >= lineup[choice]) {
      // Slot full: offer to bench someone in it.
      const out = await ui.actionSheet({
        title: `${SLOT_NAMES[choice]} is full`,
        message: `Who should go to the bench for ${r.player_name}?`,
        actions: roster.filter((x) => x.slot === choice).map((x) => ({ label: x.player_name, value: x })),
      });
      if (!out) return;
      if ((await run('set_lineup_slot', { p_league: state.league.id, p_player_id: out.player_id, p_slot: 'BN' })) === undefined) return;
    }
    await run('set_lineup_slot', { p_league: state.league.id, p_player_id: r.player_id, p_slot: choice }, 'Lineup updated');
  };

  const swapIn = async (r: RosterEntry) => {
    const targets = roster.filter((x) => x.slot !== 'BN' && eligibleSlots(r.pos).includes(x.slot));
    const out = await ui.actionSheet({
      title: `Start ${r.player_name} instead of…`,
      actions: targets.map((x) => ({ label: `${x.player_name} (${x.slot})`, value: x })),
    });
    if (!out) return;
    const moved = await run('set_lineup_slot', { p_league: state.league.id, p_player_id: out.player_id, p_slot: 'BN' });
    if (moved === undefined) return;
    await run('set_lineup_slot', { p_league: state.league.id, p_player_id: r.player_id, p_slot: out.slot }, 'Lineup updated');
  };

  const rename = async () => {
    const name = window.prompt('Team name', team.name);
    if (name && name.trim() && name.trim() !== team.name) {
      await run('rename_team', { p_league: state.league.id, p_name: name.trim() }, 'Team renamed');
    }
  };

  return (
    <Page
      title={mine ? 'My Team' : team.name}
      back={mine ? undefined : true}
      right={
        !mine ? (
          <button className="nav-btn" aria-label="Propose trade" onClick={() => navigate(`/trades/new?team=${teamId}`)}>
            <IconArrows size={22} />
          </button>
        ) : (
          <button className="nav-btn" onClick={rename}>Rename</button>
        )
      }
    >
      <div className="pad" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <TeamAvatar state={state} teamId={teamId} size="lg" />
        <div style={{ minWidth: 0 }}>
          {mine && <div style={{ fontSize: 20, fontWeight: 600 }}>{team.name}</div>}
          <div className="muted">
            {recordLabel(record)} · {formatPoints(record?.pf ?? 0)} PF · {roster.length}/{roster_max} players
          </div>
        </div>
      </div>
      {mine && <div className="banner blue small" style={{ fontSize: 13 }}>{lockDescription(state)}</div>}

      {SLOT_ORDER.map((slot) => {
        const inSlot = roster
          .filter((r) => r.slot === slot)
          .sort((a, b) => seasonPoints(byId.get(b.player_id), state).points - seasonPoints(byId.get(a.player_id), state).points);
        const capacity = slot === 'BN' ? 0 : lineup[slot];
        if (slot === 'BN' && inSlot.length === 0) return null;
        const empties = Math.max(0, capacity - inSlot.length);
        return (
          <Section key={slot} header={SLOT_NAMES[slot]} action={slot !== 'BN' ? <span>{inSlot.length}/{capacity}</span> : undefined}>
            {inSlot.map((r) => {
              const p = byId.get(r.player_id);
              const sp = seasonPoints(p, state);
              return (
                <Row
                  key={r.player_id}
                  leadingKind="slot"
                  onClick={() => onPlayerTap(r)}
                  leading={
                    <>
                      <span className="slot-tag">{slot === 'BN' ? POS_NAMES[r.pos] : slot}</span>
                      <PlayerAvatar name={r.player_name} headshot={p?.headshot} size="sm" />
                    </>
                  }
                  title={r.player_name}
                  subtitle={
                    <>
                      {POS_NAMES[r.pos]} · {p?.team ?? r.nhl_team} · <GameChip team={p?.team ?? r.nhl_team} games={today.data} />
                    </>
                  }
                  trailing={
                    <span className="points" title={sp.prev ? 'Last season' : 'This season'}>
                      {formatPoints(sp.points)}
                    </span>
                  }
                />
              );
            })}
            {Array.from({ length: empties }, (_, i) => (
              <Row
                key={`empty-${i}`}
                leadingKind="slot"
                leading={<><span className="slot-tag">{slot}</span><span className="avatar sm" /></>}
                title="Empty"
                variant="muted"
                onClick={mine ? () => navigate('/players') : undefined}
              />
            ))}
          </Section>
        );
      })}
      <div className="section-footer" style={{ margin: '-24px 16px 28px' }}>
        Points shown are fantasy points this season (last season until games are played).
      </div>

      <Section header="Draft Picks">
        {picks.length ? (
          picks.map((p) => <Row key={p.id} title={pickLabel(state, p)} />)
        ) : (
          <Row title="No draft picks" variant="muted" />
        )}
      </Section>
      <PlayerSheet playerId={player} onClose={() => setPlayer(null)} />
    </Page>
  );
}
