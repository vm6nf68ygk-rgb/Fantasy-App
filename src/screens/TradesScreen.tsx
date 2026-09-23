import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TeamAvatar } from '../components/avatars';
import { IconArrows, IconCheck, IconPlus } from '../components/icons';
import { useUI } from '../components/overlays';
import { Empty, ErrorNote, Page, Row, Section, Segmented, Spinner } from '../components/ui';
import { formatPoints, pickLabel, POS_NAMES, relativeTime, rosterOf, seasonPoints, teamName } from '../lib/league';
import type { LeagueState, Trade } from '../lib/types';
import { useAction, useLeague, usePlayers } from '../data/session';

export function TradesScreen() {
  const { data: state, error, refetch } = useLeague();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'history'>('active');

  if (error) return <Page title="Trades"><ErrorNote error={error} retry={refetch} /></Page>;
  if (!state) return <Page title="Trades"><Spinner /></Page>;

  const me = state.me.team_id;
  const pending = state.trades.filter((t) => t.status === 'pending');
  const incoming = pending.filter((t) => t.recipient_team_id === me);
  const outgoing = pending.filter((t) => t.proposer_team_id === me);
  const others = pending.filter((t) => t.recipient_team_id !== me && t.proposer_team_id !== me);
  const history = state.trades.filter((t) => t.status !== 'pending');

  return (
    <Page
      title="Trades"
      right={
        <button className="nav-btn" aria-label="New trade" onClick={() => navigate('/trades/new')}>
          <IconPlus />
        </button>
      }
    >
      <Segmented
        options={[
          { value: 'active', label: `Active${pending.length ? ` (${incoming.length + outgoing.length})` : ''}` },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'active' ? (
        incoming.length + outgoing.length + others.length === 0 ? (
          <Empty
            icon={<IconArrows size={56} />}
            title="No active trades"
            message="Offer players or future draft picks to anyone in the league."
            action={<button className="btn small" style={{ margin: '0 auto' }} onClick={() => navigate('/trades/new')}>New Trade</button>}
          />
        ) : (
          <>
            {incoming.length > 0 && (
              <Section header="Offers for You" flush>
                {incoming.map((t) => <TradeCard key={t.id} state={state} trade={t} />)}
              </Section>
            )}
            {outgoing.length > 0 && (
              <Section header="Your Offers" flush>
                {outgoing.map((t) => <TradeCard key={t.id} state={state} trade={t} />)}
              </Section>
            )}
            {others.length > 0 && (
              <Section header="Around the League" flush>
                {others.map((t) => <TradeCard key={t.id} state={state} trade={t} />)}
              </Section>
            )}
          </>
        )
      ) : history.length === 0 ? (
        <Empty title="No trade history" message="Completed, declined and cancelled trades show up here." />
      ) : (
        <Section flush>
          {history.map((t) => <TradeCard key={t.id} state={state} trade={t} />)}
        </Section>
      )}
    </Page>
  );
}

const STATUS_BADGE: Record<Trade['status'], [string, string]> = {
  pending: ['Pending', 'orange'],
  accepted: ['Completed', 'green'],
  declined: ['Declined', 'red'],
  cancelled: ['Cancelled', ''],
  failed: ['Couldn’t complete', 'red'],
};

function TradeCard({ state, trade }: { state: LeagueState; trade: Trade }) {
  const { run, busy } = useAction();
  const ui = useUI();
  const me = state.me.team_id;
  const sides = [trade.proposer_team_id, trade.recipient_team_id];
  const picks = new Map(state.picks.map((p) => [p.id, p]));
  const [label, color] = STATUS_BADGE[trade.status];

  const respond = async (accept: boolean) => {
    if (accept) {
      const ok = await ui.confirm({ title: 'Accept this trade?', message: 'Players and picks move right away.', confirm: 'Accept' });
      if (!ok) return;
    }
    const result = await run<string>('respond_trade', { p_trade: trade.id, p_accept: accept });
    if (result?.startsWith('failed')) await ui.alert('Trade couldn’t go through', result.replace(/^failed: /, ''));
    else if (result) ui.toast(accept ? 'Trade accepted' : 'Trade declined');
  };

  const cancel = async () => {
    const ok = await ui.confirm({ title: 'Cancel this offer?', confirm: 'Cancel Offer', destructive: true });
    if (ok) await run('cancel_trade', { p_trade: trade.id }, 'Offer cancelled');
  };

  return (
    <div className="list" style={{ marginBottom: 12 }}>
      <div className="trade-sides">
        {sides.map((teamId) => (
          <div className="trade-side" key={teamId}>
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <TeamAvatar state={state} teamId={teamId} size="sm" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{teamId === me ? 'You' : teamName(state, teamId)} send</span>
            </h4>
            {trade.items
              .filter((i) => i.from_team_id === teamId)
              .map((i, n) => (
                <div className="trade-asset" key={n}>
                  {i.player_id ? (
                    <>
                      {i.player_name} <small>{i.player_pos ? POS_NAMES[i.player_pos] : ''}</small>
                    </>
                  ) : (
                    <>
                      {picks.has(i.pick_id!) ? pickLabel(state, picks.get(i.pick_id!)!).replace(/ \(.*\)$/, '') : 'Draft pick'}{' '}
                      <small>pick</small>
                    </>
                  )}
                </div>
              ))}
          </div>
        ))}
      </div>
      {trade.message && <div className="trade-meta" style={{ color: 'var(--label)' }}>“{trade.message}”</div>}
      <div className="trade-meta" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{relativeTime(trade.resolved_at ?? trade.created_at)}</span>
        <span className={`badge ${color}`}>{label}</span>
      </div>
      {trade.note && <div className="trade-meta">{trade.note}</div>}
      {trade.status === 'pending' && trade.recipient_team_id === me && (
        <div className="trade-actions">
          <button className="btn tinted-red" disabled={busy} onClick={() => respond(false)}>Decline</button>
          <button className="btn" disabled={busy} onClick={() => respond(true)}>Accept</button>
        </div>
      )}
      {trade.status === 'pending' && trade.proposer_team_id === me && (
        <div className="trade-actions">
          <button className="btn gray" disabled={busy} onClick={cancel}>Cancel Offer</button>
        </div>
      )}
    </div>
  );
}

/** Build a trade: pick a team, then choose what each side sends. */
export function TradeBuilder() {
  const { data: state } = useLeague();
  const { byId } = usePlayers();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { run, busy } = useAction();
  const [team, setTeam] = useState<string | null>(params.get('team'));
  const [give, setGive] = useState<Set<string>>(new Set());
  const [get, setGet] = useState<Set<string>>(() => new Set(params.get('get') ? [`p:${params.get('get')}`] : []));
  const [message, setMessage] = useState('');

  const assets = useMemo(() => {
    if (!state) return null;
    const of = (teamId: string) => ({
      players: rosterOf(state, teamId).sort(
        (a, b) => seasonPoints(byId.get(b.player_id), state).points - seasonPoints(byId.get(a.player_id), state).points,
      ),
      picks: state.picks.filter((p) => p.owner_team_id === teamId),
    });
    return { mine: of(state.me.team_id), theirs: team ? of(team) : null };
  }, [state, team, byId]);

  if (!state || !assets) return <Page title="New Trade" tabbar={false}><Spinner /></Page>;

  if (!team || team === state.me.team_id) {
    return (
      <Page title="New Trade" large={false} left={<button className="nav-btn" onClick={() => navigate(-1)}>Cancel</button>} tabbar={false}>
        <Section header="Trade With">
          {state.teams
            .filter((t) => t.id !== state.me.team_id)
            .map((t) => (
              <Row
                key={t.id}
                leadingKind="avatar"
                leading={<TeamAvatar state={state} teamId={t.id} />}
                title={t.name}
                subtitle={`${rosterOf(state, t.id).length} players · ${state.picks.filter((p) => p.owner_team_id === t.id).length} picks`}
                chevron
                onClick={() => setTeam(t.id)}
              />
            ))}
        </Section>
      </Page>
    );
  }

  const toggle = (set: Set<string>, update: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
  };
  const ids = (set: Set<string>, prefix: 'p' | 'k') =>
    [...set].filter((k) => k.startsWith(`${prefix}:`)).map((k) => k.slice(2));

  const submit = async () => {
    const id = await run('propose_trade', {
      p_league: state.league.id,
      p_to_team: team,
      p_give_players: ids(give, 'p').map(Number),
      p_give_picks: ids(give, 'k'),
      p_get_players: ids(get, 'p').map(Number),
      p_get_picks: ids(get, 'k'),
      p_message: message || null,
    }, 'Trade offer sent');
    if (id) navigate('/trades', { replace: true });
  };

  const assetList = (
    side: { players: typeof assets.mine.players; picks: typeof assets.mine.picks },
    set: Set<string>,
    update: (s: Set<string>) => void,
  ) => (
    <>
      {side.players.map((r) => {
        const key = `p:${r.player_id}`;
        const sp = seasonPoints(byId.get(r.player_id), state);
        return (
          <Row
            key={key}
            onClick={() => toggle(set, update, key)}
            leading={<span className={`check-circle ${set.has(key) ? 'on' : ''}`}>{set.has(key) && <IconCheck size={14} />}</span>}
            title={r.player_name}
            subtitle={`${POS_NAMES[r.pos]} · ${r.nhl_team ?? ''} · ${r.slot === 'BN' ? 'Bench' : 'Starter'}`}
            trailing={<span className="points">{formatPoints(sp.points)}</span>}
            leadingKind="icon"
          />
        );
      })}
      {side.picks.map((p) => {
        const key = `k:${p.id}`;
        return (
          <Row
            key={key}
            onClick={() => toggle(set, update, key)}
            leading={<span className={`check-circle ${set.has(key) ? 'on' : ''}`}>{set.has(key) && <IconCheck size={14} />}</span>}
            title={pickLabel(state, p)}
            subtitle="Draft pick"
            leadingKind="icon"
          />
        );
      })}
      {side.players.length + side.picks.length === 0 && <Row title="Nothing to trade" variant="muted" />}
    </>
  );

  const ready = give.size > 0 && get.size > 0;
  return (
    <Page
      title={`Trade with ${teamName(state, team)}`}
      large={false}
      tabbar={false}
      left={<button className="nav-btn" onClick={() => (params.get('team') ? navigate(-1) : setTeam(null))}>{params.get('team') ? 'Cancel' : 'Back'}</button>}
      right={<button className="nav-btn bold" disabled={!ready || busy} onClick={submit}>Send</button>}
    >
      <Section header={`You receive (${get.size})`}>{assetList(assets.theirs!, get, setGet)}</Section>
      <Section header={`You send (${give.size})`}>{assetList(assets.mine, give, setGive)}</Section>
      <Section header="Message" footer="Optional. Shown with your offer.">
        <div className="row">
          <textarea
            value={message}
            maxLength={280}
            placeholder="Add a note…"
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </Section>
      <div className="pad">
        <button className="btn" disabled={!ready || busy} onClick={submit}>
          Send Offer
        </button>
      </div>
    </Page>
  );
}
