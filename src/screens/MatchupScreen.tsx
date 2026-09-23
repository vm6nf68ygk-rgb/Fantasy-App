import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDays } from '../../shared/dates';
import type { PlayerWeekScore, TeamWeekScore } from '../../shared/scoring';
import { PlayerAvatar, TeamAvatar } from '../components/avatars';
import { IconChevronLeft, IconChevronRight, IconRink } from '../components/icons';
import { Empty, ErrorNote, Page, Row, Section, Segmented, Spinner } from '../components/ui';
import {
  currentWeek,
  formatPoints,
  matchupFor,
  POS_NAMES,
  recordLabel,
  standings,
  teamColor,
  teamName,
  weekRange,
} from '../lib/league';
import type { LeagueState, Matchup, Slot, Week } from '../lib/types';
import { useLeague, usePlayers, useSchedule, useSession, useWeekScores } from '../data/session';
import { PlayerSheet } from './PlayerSheet';

export function MatchupScreen() {
  const { data: state, error, refetch } = useLeague();
  const params = useParams();
  const navigate = useNavigate();
  const { backend } = useSession();

  if (error) return <Page title="Matchup"><ErrorNote error={error} retry={refetch} /></Page>;
  if (!state) return <Page title="Matchup"><Spinner /></Page>;

  const week = params.week
    ? state.weeks.find((w) => w.week === Number(params.week)) ?? currentWeek(state)
    : currentWeek(state);
  if (!week) {
    return (
      <Page title="Matchup">
        <Empty
          icon={<IconRink size={56} />}
          title="No schedule yet"
          message={
            state.me.is_commissioner
              ? 'Create the season schedule in League → Commissioner Tools.'
              : 'Your commissioner hasn’t created the schedule yet.'
          }
          action={
            state.me.is_commissioner && (
              <button className="btn small" style={{ margin: '0 auto' }} onClick={() => navigate('/league/commissioner')}>
                Commissioner Tools
              </button>
            )
          }
        />
      </Page>
    );
  }

  const teamParam = params.team;
  const focusTeam = teamParam && state.teams.some((t) => t.id === teamParam) ? teamParam : state.me.team_id;
  const matchup = matchupFor(state, week.week, focusTeam);
  const goWeek = (w: Week | undefined) => w && navigate(`/matchup/${w.week}${teamParam ? `/${teamParam}` : ''}`);
  const idx = state.weeks.findIndex((w) => w.week === week.week);

  return (
    <Page title="Matchup">
      {backend.mode === 'demo' && (
        <div className="banner small">
          <span><b>Demo mode.</b> Fictional players and stats, saved only on this device.</span>
        </div>
      )}
      <div className="week-switcher">
        <button className="nav-btn" aria-label="Previous week" disabled={idx <= 0} onClick={() => goWeek(state.weeks[idx - 1])}>
          <IconChevronLeft />
        </button>
        <div className="ws-label">
          <div>Week {week.week}</div>
          <div>{weekRange(week)}</div>
        </div>
        <button
          className="nav-btn"
          aria-label="Next week"
          disabled={idx >= state.weeks.length - 1}
          onClick={() => goWeek(state.weeks[idx + 1])}
        >
          <IconChevronRight size={22} />
        </button>
      </div>
      {matchup ? (
        <MatchupDetail state={state} week={week} matchup={matchup} focusTeam={focusTeam} />
      ) : (
        <Empty title="Bye week" message={`${teamName(state, focusTeam)} doesn’t play this week.`} />
      )}
      <OtherMatchups state={state} week={week} exclude={matchup?.id} />
    </Page>
  );
}

function MatchupDetail({
  state,
  week,
  matchup,
  focusTeam,
}: {
  state: LeagueState;
  week: Week;
  matchup: Matchup;
  focusTeam: string;
}) {
  const { scores, isLoading, error } = useWeekScores(state, week);
  const { byId } = usePlayers();
  const schedule = useSchedule(state.today > week.end_date ? undefined : state.today, week.end_date);
  const [tab, setTab] = useState<string>(focusTeam);
  const [player, setPlayer] = useState<number | null>(null);
  const rec = new Map(standings(state).map((s) => [s.team.id, s]));

  const left = matchup.home_team_id === focusTeam ? matchup.home_team_id : matchup.away_team_id;
  const right = left === matchup.home_team_id ? matchup.away_team_id : matchup.home_team_id;
  const stored = (id: string) => Number(id === matchup.home_team_id ? matchup.home_score : matchup.away_score);
  const total = (id: string) => (matchup.final ? stored(id) : scores?.get(id)?.total ?? 0);
  const leftScore = total(left);
  const rightScore = total(right);
  const status =
    matchup.final ? 'Final'
    : state.today < week.start_date ? `Starts ${new Date(`${week.start_date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', timeZone: 'UTC' })}`
    : state.today > week.end_date ? 'Awaiting final stats'
    : 'In progress';

  // Games left this week for each NHL team (today counts if not started).
  const gamesLeft = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of schedule.data ?? []) {
      if (g.state !== 'FUT' && g.state !== 'PRE') continue;
      m.set(g.home, (m.get(g.home) ?? 0) + 1);
      m.set(g.away, (m.get(g.away) ?? 0) + 1);
    }
    return m;
  }, [schedule.data]);

  const leftPct = leftScore + rightScore > 0 ? (leftScore / (leftScore + rightScore)) * 100 : 50;

  return (
    <>
      <div className="scoreboard">
        <div className="scoreboard-teams">
          <div className="sb-team">
            <TeamAvatar state={state} teamId={left} size="lg" />
            <div className="sb-team-name">{teamName(state, left)}</div>
            <div className="sb-record">{recordLabel(rec.get(left))}</div>
          </div>
          <div className="sb-scores">
            <div className={`sb-score ${matchup.final && leftScore < rightScore ? 'loser' : ''}`}>{formatPoints(leftScore)}</div>
            <div className="sb-dash">–</div>
            <div className={`sb-score ${matchup.final && rightScore < leftScore ? 'loser' : ''}`}>{formatPoints(rightScore)}</div>
          </div>
          <div className="sb-team">
            <TeamAvatar state={state} teamId={right} size="lg" />
            <div className="sb-team-name">{teamName(state, right)}</div>
            <div className="sb-record">{recordLabel(rec.get(right))}</div>
          </div>
        </div>
        <div className="progress" aria-hidden>
          <div style={{ width: `${leftPct}%`, background: teamColor(state, left) }} />
          <div style={{ width: `${100 - leftPct}%`, background: teamColor(state, right) }} />
        </div>
        <div className={`sb-status ${status === 'In progress' ? 'live' : ''}`}>{status}</div>
      </div>

      <Segmented
        options={[left, right].map((id) => ({ value: id, label: teamName(state, id) }))}
        value={tab === right ? right : left}
        onChange={setTab}
      />
      {error ? (
        <ErrorNote error={error} />
      ) : isLoading || !scores ? (
        <Spinner />
      ) : (
        <TeamBreakdown
          score={scores.get(tab === right ? right : left)!}
          headshot={(id) => byId.get(id)?.headshot ?? null}
          gamesLeft={gamesLeft}
          onPlayer={setPlayer}
          showGamesLeft={!matchup.final && state.today <= week.end_date}
        />
      )}
      <PlayerSheet playerId={player} onClose={() => setPlayer(null)} />
    </>
  );
}

const SLOT_RANK: Record<Slot, number> = { F: 0, D: 1, UTIL: 2, G: 3, BN: 4 };

function TeamBreakdown({
  score,
  headshot,
  gamesLeft,
  onPlayer,
  showGamesLeft,
}: {
  score: TeamWeekScore;
  headshot: (id: number) => string | null;
  gamesLeft: Map<string, number>;
  onPlayer: (id: number) => void;
  showGamesLeft: boolean;
}) {
  const starters = score.players.filter((p) => p.slot !== 'BN' || p.points > 0);
  const bench = score.players.filter((p) => p.slot === 'BN' && p.points === 0);
  const sorted = (list: PlayerWeekScore[]) =>
    [...list].sort((a, b) => SLOT_RANK[a.slot as Slot] - SLOT_RANK[b.slot as Slot] || b.points - a.points);

  const row = (p: PlayerWeekScore, dim: boolean) => {
    const left = p.nhl_team ? gamesLeft.get(p.nhl_team) ?? 0 : 0;
    return (
      <Row
        key={p.player_id}
        leadingKind="slot"
        onClick={() => onPlayer(p.player_id)}
        leading={
          <>
            <span className="slot-tag">{p.slot}</span>
            <PlayerAvatar name={p.player_name} headshot={headshot(p.player_id)} size="sm" />
          </>
        }
        title={p.player_name}
        subtitle={
          <>
            {POS_NAMES[p.pos as keyof typeof POS_NAMES]} · {p.nhl_team} · {p.games.length} GP
            {showGamesLeft && ` · ${left} left`}
          </>
        }
        trailing={
          <span className={`points ${dim ? 'dim' : ''}`}>{formatPoints(dim ? p.benchPoints : p.points)}</span>
        }
      />
    );
  };

  return (
    <>
      <Section header="Lineup" action={<span className="num" style={{ textTransform: 'none' }}>{formatPoints(score.total)} pts</span>}>
        {starters.length ? sorted(starters).map((p) => row(p, false)) : <Row title="No players" variant="muted" />}
      </Section>
      {bench.length > 0 && (
        <Section header="Bench" footer={score.benchTotal ? `${formatPoints(score.benchTotal)} points scored on the bench this week.` : undefined}>
          {sorted(bench).map((p) => row(p, true))}
        </Section>
      )}
    </>
  );
}

function OtherMatchups({ state, week, exclude }: { state: LeagueState; week: Week; exclude?: string }) {
  const navigate = useNavigate();
  const { scores } = useWeekScores(state, week);
  const others = state.matchups.filter((m) => m.week === week.week && m.id !== exclude);
  if (!others.length) return null;
  const score = (m: Matchup, id: string) =>
    m.final ? Number(id === m.home_team_id ? m.home_score : m.away_score) : scores?.get(id)?.total;
  return (
    <Section header="Around the League">
      {others.map((m) => (
        <button key={m.id} className="row" onClick={() => navigate(`/matchup/${week.week}/${m.home_team_id}`)}>
          <div className="row-body" style={{ display: 'grid', gap: 6 }}>
            {[m.home_team_id, m.away_team_id].map((id) => {
              const mine = score(m, id) ?? 0;
              const theirs = score(m, id === m.home_team_id ? m.away_team_id : m.home_team_id) ?? 0;
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TeamAvatar state={state} teamId={id} size="sm" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: m.final && mine > theirs ? 600 : 400 }}>
                    {teamName(state, id)}
                  </span>
                  <span className="num" style={{ fontWeight: 600, color: m.final && mine < theirs ? 'var(--label-2)' : undefined }}>
                    {formatPoints(score(m, id))}
                  </span>
                </div>
              );
            })}
          </div>
          <IconChevronRight className="row-chevron" />
        </button>
      ))}
      <div className="row muted center" style={{ minHeight: 36 }}>
        <span className="small muted">{weekStatusLabel(state, week)}</span>
      </div>
    </Section>
  );
}

function weekStatusLabel(state: LeagueState, week: Week) {
  if (state.today > addDays(week.end_date, 1)) return 'Final scores';
  if (state.today < week.start_date) return 'Upcoming';
  return 'Live scores update every couple of minutes';
}
