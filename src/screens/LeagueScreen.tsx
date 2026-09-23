import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays } from '../../shared/dates';
import { roundRobinSchedule } from '../../shared/schedule';
import { GOALIE_STATS, SKATER_STATS, STAT_LABELS, type StatKey } from '../../shared/scoring';
import { TeamAvatar } from '../components/avatars';
import {
  IconArrowCircle, IconCalendar, IconList, IconPerson, IconShare, IconSliders, IconStar, IconTicket,
} from '../components/icons';
import { useUI } from '../components/overlays';
import { ErrorNote, Page, Row, RowIcon, Section, Spinner } from '../components/ui';
import {
  currentWeek, formatPoints, pickLabel, recordLabel, relativeTime, standings, teamName, weekRange,
} from '../lib/league';
import type { LeagueSettings, LeagueState } from '../lib/types';
import { useAction, useLeague, useLeagueSelection, useSession, useWeekScores } from '../data/session';
import { useQueryClient } from '@tanstack/react-query';

function useLeagueOrStatus(title: string) {
  const q = useLeague();
  const fallback = q.error ? (
    <Page title={title} back><ErrorNote error={q.error} retry={q.refetch} /></Page>
  ) : !q.data ? (
    <Page title={title} back><Spinner /></Page>
  ) : null;
  return { state: q.data, fallback };
}

export function LeagueScreen() {
  const { state, fallback } = useLeagueOrStatus('League');
  const { leagues, setLeagueId } = useLeagueSelection();
  const { backend, user } = useSession();
  const navigate = useNavigate();
  const ui = useUI();
  if (!state) return fallback;

  const table = standings(state);
  const share = async () => {
    const text = `Join ${state.league.name} on our fantasy hockey app. Invite code: ${state.league.invite_code}\n${window.location.origin}`;
    try {
      if (navigator.share) await navigator.share({ title: state.league.name, text });
      else {
        await navigator.clipboard.writeText(text);
        ui.toast('Invite copied');
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  const switchLeague = async () => {
    const choice = await ui.actionSheet({
      title: 'Your Leagues',
      actions: [
        ...leagues.map((l) => ({ label: l.name, value: l.id, disabled: l.id === state.league.id })),
        { label: 'Create or Join a League…', value: '__new' },
      ],
    });
    if (choice === '__new') navigate('/welcome');
    else if (choice) setLeagueId(choice);
  };

  return (
    <Page title={state.league.name}>
      <Section header="Standings" flush>
        <div className="list">
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>W-L</th>
                <th>PF</th>
                <th>Strk</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => (
                <tr
                  key={row.team.id}
                  className={row.team.id === state.me.team_id ? 'me' : ''}
                  onClick={() => navigate(row.team.id === state.me.team_id ? '/team' : `/teams/${row.team.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="team-cell">
                    <div className="team-cell-inner">
                      <span className="muted num" style={{ width: 14, flexShrink: 0 }}>{i + 1}</span>
                      <TeamAvatar state={state} teamId={row.team.id} size="sm" />
                      <span>{row.team.name}</span>
                    </div>
                  </td>
                  <td>{recordLabel(row)}</td>
                  <td>{formatPoints(row.pf)}</td>
                  <td className="muted">{row.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section>
        <Row leadingKind="icon" leading={<RowIcon color="var(--red)"><IconCalendar /></RowIcon>} title="Schedule" href="/league/schedule" />
        <Row leadingKind="icon" leading={<RowIcon color="var(--green)"><IconTicket /></RowIcon>} title="Draft Picks" href="/league/picks" />
        <Row leadingKind="icon" leading={<RowIcon color="var(--orange)"><IconList /></RowIcon>} title="Activity" href="/league/activity" />
        <Row leadingKind="icon" leading={<RowIcon color="#8e8e93"><IconSliders /></RowIcon>} title="Scoring & Rules" href="/league/settings" />
        {state.me.is_commissioner && (
          <Row leadingKind="icon" leading={<RowIcon color="var(--indigo)"><IconStar /></RowIcon>} title="Commissioner Tools" href="/league/commissioner" />
        )}
      </Section>

      <Section header="Invite Friends" footer="Share the code. New members enter it after signing in.">
        <div className="invite-code">{state.league.invite_code}</div>
        <Row title="Share Invite" variant="action" className="center" onClick={share} leading={<IconShare size={20} style={{ color: 'var(--blue)' }} />} />
      </Section>

      <Section header="Account" footer={backend.mode === 'demo' ? 'Demo mode: data is fictional and stays on this device.' : user?.email ?? undefined}>
        <Row leadingKind="icon" leading={<RowIcon color="var(--blue)"><IconArrowCircle /></RowIcon>} title="Switch League" detail={leagues.length > 1 ? leagues.length : undefined} onClick={switchLeague} />
        {backend.demo && <DemoRows />}
        {backend.mode === 'supabase' && (
          <Row
            title="Sign Out"
            variant="destructive"
            onClick={async () => {
              if (await ui.confirm({ title: 'Sign out?', confirm: 'Sign Out', destructive: true })) await backend.signOut();
            }}
          />
        )}
      </Section>
    </Page>
  );
}

function DemoRows() {
  const { backend, refreshStats } = useSession();
  const { setLeagueId } = useLeagueSelection();
  const queryClient = useQueryClient();
  const ui = useUI();
  const demo = backend.demo!;
  const current = demo.users.find((u) => u.id === demo.currentUid());
  return (
    <>
      <Row
        leadingKind="icon"
        leading={<RowIcon color="var(--green)"><IconPerson /></RowIcon>}
        title="Play as Team"
        detail={current?.team}
        onClick={async () => {
          const uid = await ui.actionSheet({
            title: 'Play as another team',
            message: 'Try both sides of a trade in the demo.',
            actions: demo.users.map((u) => ({ label: u.team, value: u.id, disabled: u.id === demo.currentUid() })),
          });
          if (uid) {
            demo.actAs(uid);
            setLeagueId(null);
          }
        }}
      />
      <Row
        title="Reset Demo Data"
        variant="destructive"
        onClick={async () => {
          if (!(await ui.confirm({ title: 'Reset the demo?', message: 'Starts over with a fresh league.', confirm: 'Reset', destructive: true }))) return;
          await demo.reset();
          refreshStats();
          setLeagueId(null);
          await queryClient.invalidateQueries();
          ui.toast('Demo reset');
        }}
      />
    </>
  );
}

export function SchedulePage() {
  const { state, fallback } = useLeagueOrStatus('Schedule');
  const navigate = useNavigate();
  const now = state ? currentWeek(state) : null;
  const live = useWeekScores(state, now);
  if (!state) return fallback;
  return (
    <Page title="Schedule" back="/league">
      {state.weeks.length === 0 && <Section><Row title="No schedule yet" variant="muted" /></Section>}
      {state.weeks.map((w) => {
        const games = state.matchups.filter((m) => m.week === w.week);
        const isNow = now?.week === w.week && state.today >= w.start_date;
        return (
          <Section key={w.week} header={`Week ${w.week} · ${weekRange(w)}`} action={isNow ? <span className="badge red">Live</span> : undefined}>
            {games.map((m) => {
              const score = (id: string) =>
                m.final ? Number(id === m.home_team_id ? m.home_score : m.away_score)
                : isNow ? live.scores?.get(id)?.total
                : undefined;
              const hs = score(m.home_team_id);
              const as = score(m.away_team_id);
              const mine = [m.home_team_id, m.away_team_id].includes(state.me.team_id);
              return (
                <Row
                  key={m.id}
                  onClick={() => navigate(`/matchup/${w.week}/${m.home_team_id}`)}
                  title={
                    <span style={{ fontWeight: mine ? 600 : 400 }}>
                      {teamName(state, m.home_team_id)} <span className="muted">vs</span> {teamName(state, m.away_team_id)}
                    </span>
                  }
                  detail={hs != null && as != null ? <span className="num">{formatPoints(hs)}–{formatPoints(as)}</span> : undefined}
                  chevron
                />
              );
            })}
          </Section>
        );
      })}
    </Page>
  );
}

export function PicksPage() {
  const { state, fallback } = useLeagueOrStatus('Draft Picks');
  const { run } = useAction();
  const ui = useUI();
  if (!state) return fallback;
  const seasons = [...new Set(state.picks.map((p) => p.season))].sort();
  const reassign = async (pickId: string) => {
    if (!state.me.is_commissioner) return;
    const team = await ui.actionSheet({
      title: 'Give this pick to…',
      message: 'Commissioner override',
      actions: state.teams.map((t) => ({ label: t.name, value: t.id })),
    });
    if (team) await run('commish_reassign_pick', { p_league: state.league.id, p_pick: pickId, p_team: team }, 'Pick updated');
  };
  return (
    <Page title="Draft Picks" back="/league">
      {seasons.length === 0 && (
        <Section footer={state.me.is_commissioner ? 'Create picks in Commissioner Tools.' : 'Your commissioner hasn’t created draft picks yet.'}>
          <Row title="No draft picks yet" variant="muted" />
        </Section>
      )}
      {seasons.map((season) => (
        <Section key={season} header={`${season} Draft`} footer={state.me.is_commissioner ? 'Tap a pick to reassign it.' : undefined}>
          {state.picks
            .filter((p) => p.season === season)
            .sort((a, b) => a.round - b.round || teamName(state, a.original_team_id).localeCompare(teamName(state, b.original_team_id)))
            .map((p) => (
              <Row
                key={p.id}
                leadingKind="avatar"
                leading={<TeamAvatar state={state} teamId={p.owner_team_id} size="sm" />}
                title={teamName(state, p.owner_team_id)}
                subtitle={pickLabel(state, p).replace(`${season} `, '')}
                onClick={state.me.is_commissioner ? () => reassign(p.id) : undefined}
              />
            ))}
        </Section>
      ))}
    </Page>
  );
}

export function ActivityPage() {
  const { state, fallback } = useLeagueOrStatus('Activity');
  if (!state) return fallback;
  return (
    <Page title="Activity" back="/league">
      <Section>
        {state.activity.length === 0 && <Row title="Nothing yet" variant="muted" />}
        {state.activity.map((a) => (
          <Row
            key={a.id}
            leadingKind={a.team_id ? 'avatar' : undefined}
            leading={a.team_id ? <TeamAvatar state={state} teamId={a.team_id} size="sm" /> : undefined}
            title={<span style={{ whiteSpace: 'normal' }}>{a.summary}</span>}
            subtitle={relativeTime(a.created_at)}
          />
        ))}
      </Section>
    </Page>
  );
}

export function SettingsPage() {
  const { state, fallback } = useLeagueOrStatus('Scoring & Rules');
  if (!state) return fallback;
  return <SettingsForm key={JSON.stringify(state.league.settings)} state={state} />;
}

function SettingsForm({ state }: { state: LeagueState }) {
  const editable = state.me.is_commissioner;
  const [draft, setDraft] = useState<LeagueSettings>(state.league.settings);
  const { run, busy } = useAction();
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.league.settings);

  const numberRow = (label: string, value: number, onChange: (n: number) => void, step = 1) => (
    <div className="row" key={label}>
      <span className="label">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
  const scoringRow = (k: StatKey) =>
    numberRow(STAT_LABELS[k], draft.scoring[k] ?? 0, (n) => setDraft({ ...draft, scoring: { ...draft.scoring, [k]: n } }), 0.1);

  return (
    <Page
      title="Scoring & Rules"
      back="/league"
      right={
        editable && (
          <button
            className="nav-btn bold"
            disabled={!dirty || busy}
            onClick={() => run('commish_update_settings', { p_league: state.league.id, p_settings: draft }, 'Settings saved')}
          >
            Save
          </button>
        )
      }
    >
      {!editable && <div className="banner blue small">Only the commissioner can change these.</div>}
      <Section header="Skater Points">{SKATER_STATS.map(scoringRow)}</Section>
      <Section header="Goalie Points" footer="Use negative numbers for stats that should cost points, like goals against.">
        {GOALIE_STATS.map(scoringRow)}
      </Section>
      <Section header="Starting Lineup">
        {(['F', 'D', 'UTIL', 'G'] as const).map((k) =>
          numberRow({ F: 'Forwards', D: 'Defense', UTIL: 'Utility (F or D)', G: 'Goalies' }[k], draft.lineup[k], (n) =>
            setDraft({ ...draft, lineup: { ...draft.lineup, [k]: Math.max(0, Math.round(n)) } }),
          ),
        )}
      </Section>
      <Section
        header="Roster"
        footer="Lineup lock: moves made before this hour (Eastern) count for that day’s games; later moves count from the next day."
      >
        {numberRow('Max Players', draft.roster_max, (n) => setDraft({ ...draft, roster_max: Math.max(1, Math.round(n)) }))}
        {numberRow('Daily Lock Hour (0–23)', draft.lock_hour, (n) => setDraft({ ...draft, lock_hour: Math.min(23, Math.max(0, Math.round(n))) }))}
      </Section>
    </Page>
  );
}

export function CommissionerPage() {
  const { state, fallback } = useLeagueOrStatus('Commissioner');
  const { run, busy } = useAction();
  const ui = useUI();
  const navigate = useNavigate();
  const nextMonday = () => {
    const today = new Date();
    const d = today.toISOString().slice(0, 10);
    const dow = today.getUTCDay();
    return addDays(d, ((8 - dow) % 7) || 7);
  };
  const [start, setStart] = useState(nextMonday);
  const [weeks, setWeeks] = useState(22);
  const [pickSeason, setPickSeason] = useState(new Date().getFullYear() + 1);
  const [rounds, setRounds] = useState(3);
  const [leagueName, setLeagueName] = useState<string | null>(null);
  if (!state) return fallback;
  if (!state.me.is_commissioner) return <Page title="Commissioner" back="/league"><ErrorNote error={new Error('Only the commissioner can see this page.')} /></Page>;

  const finalized = state.matchups.some((m) => m.final);
  const makeSchedule = async () => {
    if (state.teams.length < 2) return ui.alert('Need more teams', 'Invite at least one more team first.');
    const ok = await ui.confirm({
      title: 'Create schedule?',
      message: finalized
        ? 'Replaces all weeks that aren’t final yet. Finished weeks are kept.'
        : `${weeks} weeks of head-to-head matchups starting ${start}.`,
      confirm: 'Create',
    });
    if (!ok) return;
    let plan = roundRobinSchedule(state.teams.map((t) => t.id), start, weeks);
    const done = new Set(state.matchups.filter((m) => m.final).map((m) => m.week));
    plan = plan.map((w) => ({ ...w, week: w.week + (done.size ? Math.max(...done) : 0) }));
    await run('commish_set_schedule', { p_league: state.league.id, p_weeks: plan }, 'Schedule created');
  };

  return (
    <Page title="Commissioner" back="/league">
      <Section header="League Name">
        <div className="row">
          <input
            type="text"
            className="left"
            value={leagueName ?? state.league.name}
            maxLength={60}
            onChange={(e) => setLeagueName(e.target.value)}
            aria-label="League name"
          />
          {leagueName != null && leagueName.trim() && leagueName !== state.league.name && (
            <button
              className="pill"
              onClick={async () => {
                await run('commish_rename_league', { p_league: state.league.id, p_name: leagueName }, 'League renamed');
                setLeagueName(null);
              }}
            >
              Save
            </button>
          )}
        </div>
      </Section>

      <Section
        header="Season Schedule"
        footer={`Round-robin head-to-head, one matchup per team each week (Monday–Sunday). ${state.teams.length} teams in the league${state.weeks.length ? `; ${state.weeks.length} weeks scheduled now` : ''}.`}
      >
        <div className="row">
          <span className="label">First Monday</span>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="First Monday" />
        </div>
        <div className="row">
          <span className="label">Weeks</span>
          <input type="number" min={1} max={30} value={weeks} onChange={(e) => setWeeks(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} aria-label="Weeks" />
        </div>
        <Row title={state.weeks.length ? 'Rebuild Schedule' : 'Create Schedule'} variant="action" onClick={busy ? undefined : makeSchedule} />
      </Section>

      <Section header="Future Draft Picks" footer="Gives every team one pick per round for that draft. Existing picks are left alone, so it’s safe to run again after new teams join.">
        <div className="row">
          <span className="label">Draft Year</span>
          <input type="number" value={pickSeason} onChange={(e) => setPickSeason(Number(e.target.value))} aria-label="Draft year" />
        </div>
        <div className="row">
          <span className="label">Rounds</span>
          <input type="number" min={1} max={30} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} aria-label="Rounds" />
        </div>
        <Row
          title="Create Picks"
          variant="action"
          onClick={() => run('commish_create_picks', { p_league: state.league.id, p_season: pickSeason, p_rounds: rounds }, 'Draft picks created')}
        />
      </Section>

      <Section header="Rosters" footer="To bring rosters over from ESPN, open any player from the Players tab and choose “Assign to Team…”. You can also release players and reassign draft picks.">
        <Row title="Assign Players" chevron onClick={() => navigate('/players')} />
        <Row title="Manage Draft Picks" chevron onClick={() => navigate('/league/picks')} />
        <Row title="Scoring & Rules" chevron onClick={() => navigate('/league/settings')} />
      </Section>
    </Page>
  );
}

