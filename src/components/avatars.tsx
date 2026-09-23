import { useState } from 'react';
import { initials, teamColor } from '../lib/league';
import type { LeagueState } from '../lib/types';
import type { NhlGame } from '../data/stats';

export function TeamAvatar({
  state,
  teamId,
  size,
}: {
  state: LeagueState;
  teamId: string;
  size?: 'sm' | 'lg' | 'xl';
}) {
  const name = state.teams.find((t) => t.id === teamId)?.name ?? '?';
  return (
    <span className={`avatar team ${size ?? ''}`} style={{ background: teamColor(state, teamId) }} aria-hidden>
      {initials(name)}
    </span>
  );
}

export function PlayerAvatar({
  name,
  headshot,
  size,
}: {
  name: string;
  headshot?: string | null;
  size?: 'sm' | 'lg' | 'xl';
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`avatar ${size ?? ''}`} aria-hidden>
      {headshot && !failed ? (
        <img src={headshot} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function TeamLogo({ abbrev, size = 22 }: { abbrev: string | null | undefined; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!abbrev || failed) return null;
  return (
    <img
      className="team-logo"
      src={`https://assets.nhle.com/logos/nhl/svg/${abbrev}_light.svg`}
      alt={abbrev}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** "vs BOS 7:00 PM", "Final 3–2", "Live" for a player's NHL team on a given day. */
export function GameChip({ team, games }: { team: string | null; games: NhlGame[] | undefined }) {
  if (!team || !games) return null;
  const g = games.find((x) => x.home === team || x.away === team);
  if (!g) return <span className="game-chip">No game</span>;
  const home = g.home === team;
  const opp = home ? `vs ${g.away}` : `@ ${g.home}`;
  if (g.state === 'LIVE' || g.state === 'CRIT') {
    return <span className="game-chip live">{opp} · Live {g.awayScore}–{g.homeScore}</span>;
  }
  if (g.state === 'OFF' || g.state === 'FINAL') {
    const us = home ? g.homeScore : g.awayScore;
    const them = home ? g.awayScore : g.homeScore;
    return (
      <span className="game-chip">
        {opp} · {us != null && them != null ? `${us > them ? 'W' : 'L'} ${us}–${them}` : 'Final'}
      </span>
    );
  }
  const time = new Date(g.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return <span className="game-chip today">{opp} · {time}</span>;
}
