-- Fantasy hockey league schema.
--
-- All writes go through the SECURITY DEFINER functions at the bottom of this
-- file, which check who is calling (auth.uid()) and enforce league rules.
-- Tables are read-only to signed-in users, and only for leagues they belong to.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  invite_code text not null unique,
  commissioner_id uuid not null references auth.users(id),
  settings jsonb not null,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  name text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (league_id, owner_id)
);

-- One row per stint of a player on a team in a lineup slot. A lineup move,
-- trade or drop closes the current row (end_date) and opens a new one, so
-- scoring for any past day can be reconstructed exactly.
-- Dates are hockey days in US Eastern time; end_date is exclusive.
create table public.roster_spots (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id integer not null,
  player_name text not null,
  pos text not null check (pos in ('C', 'L', 'R', 'D', 'G')),
  nhl_team text,
  slot text not null check (slot in ('F', 'D', 'G', 'UTIL', 'BN')),
  start_date date not null,
  end_date date,
  check (end_date is null or end_date > start_date)
);
create unique index roster_spots_one_current
  on public.roster_spots (league_id, player_id) where end_date is null;
create index roster_spots_team on public.roster_spots (team_id) where end_date is null;
create index roster_spots_dates on public.roster_spots (league_id, start_date, end_date);

create table public.draft_picks (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season integer not null,
  round integer not null check (round between 1 and 30),
  original_team_id uuid not null references public.teams(id) on delete cascade,
  owner_team_id uuid not null references public.teams(id) on delete cascade,
  unique (league_id, season, round, original_team_id)
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  proposer_team_id uuid not null references public.teams(id) on delete cascade,
  recipient_team_id uuid not null references public.teams(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled', 'failed')),
  message text check (char_length(message) <= 280),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.trade_items (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  from_team_id uuid not null references public.teams(id) on delete cascade,
  player_id integer,
  player_name text,
  player_pos text,
  pick_id uuid references public.draft_picks(id) on delete cascade,
  check ((player_id is null) <> (pick_id is null))
);

create table public.weeks (
  league_id uuid not null references public.leagues(id) on delete cascade,
  week integer not null,
  start_date date not null,
  end_date date not null, -- inclusive
  primary key (league_id, week),
  check (end_date >= start_date)
);

create table public.matchups (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  week integer not null,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  home_score numeric(8, 2),
  away_score numeric(8, 2),
  final boolean not null default false,
  foreign key (league_id, week) references public.weeks(league_id, week) on delete cascade
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  kind text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index activity_league on public.activity (league_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security: members can read their league, nobody writes directly.
-- ---------------------------------------------------------------------------

create function public.is_member(p_league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teams where league_id = p_league and owner_id = auth.uid());
$$;

alter table public.leagues enable row level security;
alter table public.teams enable row level security;
alter table public.roster_spots enable row level security;
alter table public.draft_picks enable row level security;
alter table public.trades enable row level security;
alter table public.trade_items enable row level security;
alter table public.weeks enable row level security;
alter table public.matchups enable row level security;
alter table public.activity enable row level security;

create policy member_read on public.leagues for select using (public.is_member(id));
create policy member_read on public.teams for select using (public.is_member(league_id));
create policy member_read on public.roster_spots for select using (public.is_member(league_id));
create policy member_read on public.draft_picks for select using (public.is_member(league_id));
create policy member_read on public.trades for select using (public.is_member(league_id));
create policy member_read on public.trade_items for select
  using (exists (select 1 from public.trades t where t.id = trade_id and public.is_member(t.league_id)));
create policy member_read on public.weeks for select using (public.is_member(league_id));
create policy member_read on public.matchups for select using (public.is_member(league_id));
create policy member_read on public.activity for select using (public.is_member(league_id));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.default_settings() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'scoring', jsonb_build_object(
      'G', 2, 'A', 1, 'PM', 0.5, 'PIM', 0, 'PPP', 0.5, 'SHP', 1, 'GWG', 1,
      'SOG', 0.1, 'HIT', 0.1, 'BLK', 0.5,
      'W', 4, 'L', 0, 'OTL', 1, 'GA', -2, 'SV', 0.2, 'SO', 3
    ),
    'lineup', jsonb_build_object('F', 6, 'D', 4, 'UTIL', 1, 'G', 2),
    'roster_max', 20,
    'lock_hour', 12
  );
$$;

-- Overridable clock so tests and the demo can move time.
create function public._now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now());
$$;

create function public._uid() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'You need to sign in first.'; end if;
  return v;
end $$;

-- The hockey day a change made right now applies to. Before the league's lock
-- hour (Eastern) it applies today; after it, from tomorrow.
create function public._effective_date(p_league uuid) returns date
language plpgsql stable set search_path = public as $$
declare
  local_ts timestamp := public._now() at time zone 'America/New_York';
  lock_hour int;
begin
  select coalesce((settings ->> 'lock_hour')::int, 12) into lock_hour from leagues where id = p_league;
  if extract(hour from local_ts) < lock_hour then
    return local_ts::date;
  end if;
  return local_ts::date + 1;
end $$;

create function public._my_team(p_league uuid) returns uuid
language plpgsql stable set search_path = public as $$
declare v uuid;
begin
  select id into v from teams where league_id = p_league and owner_id = public._uid();
  if v is null then raise exception 'You are not in this league.'; end if;
  return v;
end $$;

create function public._require_commissioner(p_league uuid) returns void
language plpgsql stable set search_path = public as $$
begin
  if not exists (select 1 from leagues where id = p_league and commissioner_id = public._uid()) then
    raise exception 'Only the commissioner can do that.';
  end if;
end $$;

create function public._log(p_league uuid, p_team uuid, p_kind text, p_summary text) returns void
language sql set search_path = public as $$
  insert into activity (league_id, team_id, kind, summary) values (p_league, p_team, p_kind, p_summary);
$$;

-- Close a current roster row as of p_eff. A row that would not have
-- covered any day is deleted instead.
create function public._close_spot(p_spot uuid, p_eff date) returns void
language plpgsql set search_path = public as $$
begin
  delete from roster_spots where id = p_spot and start_date >= p_eff;
  update roster_spots set end_date = p_eff where id = p_spot and end_date is null;
end $$;

create function public._open_spot(
  p_league uuid, p_team uuid, p_player_id int, p_name text, p_pos text, p_nhl_team text,
  p_slot text, p_eff date
) returns void
language sql set search_path = public as $$
  insert into roster_spots (league_id, team_id, player_id, player_name, pos, nhl_team, slot, start_date)
  values (p_league, p_team, p_player_id, p_name, p_pos, p_nhl_team, p_slot, p_eff);
$$;

create function public._roster_count(p_team uuid) returns int
language sql stable set search_path = public as $$
  select count(*)::int from roster_spots where team_id = p_team and end_date is null;
$$;

create function public._check_roster_size(p_league uuid, p_team uuid) returns void
language plpgsql stable set search_path = public as $$
declare
  max_size int;
  team_name text;
begin
  select coalesce((settings ->> 'roster_max')::int, 20) into max_size from leagues where id = p_league;
  if public._roster_count(p_team) > max_size then
    select name into team_name from teams where id = p_team;
    raise exception '% would have more than % players. Drop someone first.', team_name, max_size;
  end if;
end $$;

create function public._validate_player(p jsonb) returns void
language plpgsql immutable as $$
begin
  if p ->> 'id' is null or p ->> 'name' is null then raise exception 'Missing player details.'; end if;
  if coalesce(p ->> 'pos', '') not in ('C', 'L', 'R', 'D', 'G') then
    raise exception 'Unknown position for %.', p ->> 'name';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- League membership
-- ---------------------------------------------------------------------------

create function public.create_league(p_name text, p_team_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public._uid();
  league uuid;
  code text;
begin
  loop
    code := upper(substr(md5(random()::text), 1, 6));
    exit when not exists (select 1 from leagues where invite_code = code);
  end loop;
  insert into leagues (name, invite_code, commissioner_id, settings)
  values (trim(p_name), code, me, public.default_settings())
  returning id into league;
  insert into teams (league_id, owner_id, name) values (league, me, trim(p_team_name));
  return league;
end $$;

create function public.join_league(p_code text, p_team_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public._uid();
  league uuid;
  team uuid;
begin
  select id into league from leagues where invite_code = upper(trim(p_code));
  if league is null then raise exception 'No league has that invite code.'; end if;
  if exists (select 1 from teams where league_id = league and owner_id = me) then
    return league;
  end if;
  if (select count(*) from teams where league_id = league) >= 20 then
    raise exception 'This league is full.';
  end if;
  insert into teams (league_id, owner_id, name) values (league, me, trim(p_team_name)) returning id into team;
  perform public._log(league, team, 'join', trim(p_team_name) || ' joined the league');
  return league;
end $$;

create function public.my_leagues() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'name', l.name, 'team_id', t.id, 'team_name', t.name
  ) order by l.created_at), '[]'::jsonb)
  from teams t join leagues l on l.id = t.league_id
  where t.owner_id = auth.uid();
$$;

create function public.rename_team(p_league uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update teams set name = trim(p_name) where id = public._my_team(p_league);
end $$;

-- Everything the app needs for a league in one call.
create function public.get_league_state(p_league uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := public._uid();
  my_team uuid := public._my_team(p_league);
begin
  return jsonb_build_object(
    'league', (select jsonb_build_object(
        'id', id, 'name', name, 'invite_code', invite_code, 'settings', settings,
        'commissioner_id', commissioner_id)
      from leagues where id = p_league),
    'me', jsonb_build_object(
      'user_id', me,
      'team_id', my_team,
      'is_commissioner', exists (select 1 from leagues where id = p_league and commissioner_id = me)),
    'effective_date', public._effective_date(p_league),
    'today', (public._now() at time zone 'America/New_York')::date,
    'teams', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'owner_id', owner_id) order by created_at), '[]'::jsonb)
      from teams where league_id = p_league),
    'roster', (select coalesce(jsonb_agg(jsonb_build_object(
        'team_id', team_id, 'player_id', player_id, 'player_name', player_name,
        'pos', pos, 'nhl_team', nhl_team, 'slot', slot, 'start_date', start_date)
        order by player_name), '[]'::jsonb)
      from roster_spots where league_id = p_league and end_date is null),
    'picks', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'season', season, 'round', round,
        'original_team_id', original_team_id, 'owner_team_id', owner_team_id)
        order by season, round), '[]'::jsonb)
      from draft_picks where league_id = p_league),
    'trades', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'proposer_team_id', t.proposer_team_id, 'recipient_team_id', t.recipient_team_id,
        'status', t.status, 'message', t.message, 'note', t.note,
        'created_at', t.created_at, 'resolved_at', t.resolved_at,
        'items', (select coalesce(jsonb_agg(jsonb_build_object(
            'from_team_id', i.from_team_id, 'player_id', i.player_id,
            'player_name', i.player_name, 'player_pos', i.player_pos, 'pick_id', i.pick_id)), '[]'::jsonb)
          from trade_items i where i.trade_id = t.id))
        order by t.created_at desc), '[]'::jsonb)
      from (select * from trades where league_id = p_league
            order by created_at desc limit 100) t),
    'weeks', (select coalesce(jsonb_agg(jsonb_build_object(
        'week', week, 'start_date', start_date, 'end_date', end_date) order by week), '[]'::jsonb)
      from weeks where league_id = p_league),
    'matchups', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'week', week, 'home_team_id', home_team_id, 'away_team_id', away_team_id,
        'home_score', home_score, 'away_score', away_score, 'final', final)
        order by week), '[]'::jsonb)
      from matchups where league_id = p_league),
    'activity', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'team_id', team_id, 'kind', kind, 'summary', summary, 'created_at', created_at)
        order by created_at desc), '[]'::jsonb)
      from (select * from activity where league_id = p_league
            order by created_at desc limit 60) a)
  );
end $$;

-- Roster stints overlapping a date range (inclusive), used to score matchups.
create function public.get_roster_history(p_league uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._my_team(p_league);
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'team_id', team_id, 'player_id', player_id, 'player_name', player_name, 'pos', pos,
      'nhl_team', nhl_team, 'slot', slot, 'start_date', start_date, 'end_date', end_date)), '[]'::jsonb)
    from roster_spots
    where league_id = p_league
      and start_date <= p_to
      and (end_date is null or end_date > p_from));
end $$;

-- ---------------------------------------------------------------------------
-- Roster moves
-- ---------------------------------------------------------------------------

-- p_player: {"id": 8478402, "name": "Connor McDavid", "pos": "C", "team": "EDM"}
create function public.add_player(p_league uuid, p_player jsonb, p_drop_player_id int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  team uuid := public._my_team(p_league);
  eff date := public._effective_date(p_league);
  drop_spot roster_spots;
  team_name text;
begin
  perform public._validate_player(p_player);
  if exists (select 1 from roster_spots where league_id = p_league
             and player_id = (p_player ->> 'id')::int and end_date is null) then
    raise exception '% is already on a team.', p_player ->> 'name';
  end if;
  if p_drop_player_id is not null then
    select * into drop_spot from roster_spots
      where team_id = team and player_id = p_drop_player_id and end_date is null;
    if drop_spot.id is null then raise exception 'That player is not on your team.'; end if;
    perform public._close_spot(drop_spot.id, eff);
  end if;
  perform public._open_spot(p_league, team, (p_player ->> 'id')::int, p_player ->> 'name',
    p_player ->> 'pos', p_player ->> 'team', 'BN', eff);
  perform public._check_roster_size(p_league, team);
  select name into team_name from teams where id = team;
  perform public._log(p_league, team, 'add', team_name || ' added ' || (p_player ->> 'name')
    || case when drop_spot.id is not null then ' and dropped ' || drop_spot.player_name else '' end);
end $$;

create function public.drop_player(p_league uuid, p_player_id int) returns void
language plpgsql security definer set search_path = public as $$
declare
  team uuid := public._my_team(p_league);
  spot roster_spots;
  team_name text;
begin
  select * into spot from roster_spots where team_id = team and player_id = p_player_id and end_date is null;
  if spot.id is null then raise exception 'That player is not on your team.'; end if;
  perform public._close_spot(spot.id, public._effective_date(p_league));
  select name into team_name from teams where id = team;
  perform public._log(p_league, team, 'drop', team_name || ' dropped ' || spot.player_name);
end $$;

create function public.set_lineup_slot(p_league uuid, p_player_id int, p_slot text) returns void
language plpgsql security definer set search_path = public as $$
declare
  team uuid := public._my_team(p_league);
  eff date := public._effective_date(p_league);
  spot roster_spots;
  capacity int;
  used int;
begin
  select * into spot from roster_spots where team_id = team and player_id = p_player_id and end_date is null;
  if spot.id is null then raise exception 'That player is not on your team.'; end if;
  if spot.slot = p_slot then return; end if;

  if p_slot = 'F' and spot.pos not in ('C', 'L', 'R') then
    raise exception '% is not a forward.', spot.player_name;
  elsif p_slot = 'D' and spot.pos <> 'D' then
    raise exception '% is not a defenseman.', spot.player_name;
  elsif p_slot = 'G' and spot.pos <> 'G' then
    raise exception '% is not a goalie.', spot.player_name;
  elsif p_slot = 'UTIL' and spot.pos = 'G' then
    raise exception 'Goalies cannot play in the UTIL slot.';
  elsif p_slot not in ('F', 'D', 'G', 'UTIL', 'BN') then
    raise exception 'Unknown lineup slot.';
  end if;

  if p_slot <> 'BN' then
    select coalesce((settings -> 'lineup' ->> p_slot)::int, 0) into capacity from leagues where id = p_league;
    select count(*) into used from roster_spots
      where team_id = team and end_date is null and slot = p_slot;
    if used >= capacity then
      raise exception 'Your % slots are full. Bench someone first.', p_slot;
    end if;
  end if;

  if spot.start_date >= eff then
    update roster_spots set slot = p_slot where id = spot.id;
  else
    perform public._close_spot(spot.id, eff);
    perform public._open_spot(p_league, team, spot.player_id, spot.player_name, spot.pos,
      spot.nhl_team, p_slot, eff);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Trades (players and draft picks)
-- ---------------------------------------------------------------------------

create function public.propose_trade(
  p_league uuid, p_to_team uuid,
  p_give_players int[], p_give_picks uuid[],
  p_get_players int[], p_get_picks uuid[],
  p_message text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := public._my_team(p_league);
  trade uuid;
  pid int;
  pick uuid;
  spot roster_spots;
begin
  p_give_players := coalesce(p_give_players, '{}');
  p_give_picks := coalesce(p_give_picks, '{}');
  p_get_players := coalesce(p_get_players, '{}');
  p_get_picks := coalesce(p_get_picks, '{}');
  if p_to_team = me then raise exception 'You cannot trade with yourself.'; end if;
  if not exists (select 1 from teams where id = p_to_team and league_id = p_league) then
    raise exception 'That team is not in this league.';
  end if;
  if cardinality(p_give_players) + cardinality(p_give_picks) = 0
     or cardinality(p_get_players) + cardinality(p_get_picks) = 0 then
    raise exception 'Both sides of a trade need at least one player or pick.';
  end if;

  insert into trades (league_id, proposer_team_id, recipient_team_id, message)
  values (p_league, me, p_to_team, nullif(trim(p_message), ''))
  returning id into trade;

  foreach pid in array p_give_players loop
    select * into spot from roster_spots where team_id = me and player_id = pid and end_date is null;
    if spot.id is null then raise exception 'One of the players you offered is not on your team.'; end if;
    insert into trade_items (trade_id, from_team_id, player_id, player_name, player_pos)
    values (trade, me, pid, spot.player_name, spot.pos);
  end loop;
  foreach pid in array p_get_players loop
    select * into spot from roster_spots where team_id = p_to_team and player_id = pid and end_date is null;
    if spot.id is null then raise exception 'One of the players you asked for is not on their team.'; end if;
    insert into trade_items (trade_id, from_team_id, player_id, player_name, player_pos)
    values (trade, p_to_team, pid, spot.player_name, spot.pos);
  end loop;
  foreach pick in array p_give_picks loop
    if not exists (select 1 from draft_picks where id = pick and owner_team_id = me) then
      raise exception 'One of the picks you offered is not yours.';
    end if;
    insert into trade_items (trade_id, from_team_id, pick_id) values (trade, me, pick);
  end loop;
  foreach pick in array p_get_picks loop
    if not exists (select 1 from draft_picks where id = pick and owner_team_id = p_to_team) then
      raise exception 'One of the picks you asked for does not belong to them.';
    end if;
    insert into trade_items (trade_id, from_team_id, pick_id) values (trade, p_to_team, pick);
  end loop;

  return trade;
end $$;

create function public._execute_trade(p_trade uuid) returns void
language plpgsql set search_path = public as $$
declare
  t trades;
  item trade_items;
  spot roster_spots;
  to_team uuid;
  eff date;
  parts text[] := '{}';
  proposer_name text;
  recipient_name text;
begin
  select * into t from trades where id = p_trade for update;
  eff := public._effective_date(t.league_id);

  -- Everything must still belong to the team giving it up.
  for item in select * from trade_items where trade_id = p_trade loop
    if item.player_id is not null then
      if not exists (select 1 from roster_spots where team_id = item.from_team_id
                     and player_id = item.player_id and end_date is null) then
        raise exception '% is no longer on that team, so this trade can''t go through.', item.player_name;
      end if;
    elsif not exists (select 1 from draft_picks where id = item.pick_id and owner_team_id = item.from_team_id) then
      raise exception 'A draft pick in this trade has changed hands, so this trade can''t go through.';
    end if;
  end loop;

  for item in select * from trade_items where trade_id = p_trade loop
    to_team := case when item.from_team_id = t.proposer_team_id then t.recipient_team_id else t.proposer_team_id end;
    if item.player_id is not null then
      select * into spot from roster_spots where team_id = item.from_team_id
        and player_id = item.player_id and end_date is null;
      perform public._close_spot(spot.id, eff);
      perform public._open_spot(t.league_id, to_team, spot.player_id, spot.player_name, spot.pos,
        spot.nhl_team, 'BN', eff);
    else
      update draft_picks set owner_team_id = to_team where id = item.pick_id;
    end if;
  end loop;

  perform public._check_roster_size(t.league_id, t.proposer_team_id);
  perform public._check_roster_size(t.league_id, t.recipient_team_id);

  update trades set status = 'accepted', resolved_at = public._now() where id = p_trade;

  select name into proposer_name from teams where id = t.proposer_team_id;
  select name into recipient_name from teams where id = t.recipient_team_id;
  perform public._log(t.league_id, t.proposer_team_id, 'trade',
    proposer_name || ' and ' || recipient_name || ' completed a trade');
end $$;

create function public.respond_trade(p_trade uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  t trades;
begin
  select * into t from trades where id = p_trade;
  if t.id is null then raise exception 'Trade not found.'; end if;
  if t.recipient_team_id <> public._my_team(t.league_id) then
    raise exception 'Only the team receiving this offer can respond.';
  end if;
  if t.status <> 'pending' then raise exception 'This trade is no longer pending.'; end if;

  if not p_accept then
    update trades set status = 'declined', resolved_at = public._now() where id = p_trade;
    return 'declined';
  end if;

  begin
    perform public._execute_trade(p_trade);
  exception when raise_exception then
    -- The subtransaction rolled back every roster change; record why.
    update trades set status = 'failed', note = sqlerrm, resolved_at = public._now() where id = p_trade;
    return 'failed: ' || sqlerrm;
  end;
  return 'accepted';
end $$;

create function public.cancel_trade(p_trade uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t trades;
begin
  select * into t from trades where id = p_trade;
  if t.id is null then raise exception 'Trade not found.'; end if;
  if t.proposer_team_id <> public._my_team(t.league_id) then
    raise exception 'Only the team that made this offer can cancel it.';
  end if;
  if t.status <> 'pending' then raise exception 'This trade is no longer pending.'; end if;
  update trades set status = 'cancelled', resolved_at = public._now() where id = p_trade;
end $$;

-- ---------------------------------------------------------------------------
-- Commissioner tools
-- ---------------------------------------------------------------------------

create function public.commish_update_settings(p_league uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_commissioner(p_league);
  if jsonb_typeof(p_settings -> 'scoring') <> 'object' or jsonb_typeof(p_settings -> 'lineup') <> 'object' then
    raise exception 'Settings are missing scoring or lineup.';
  end if;
  update leagues set settings = public.default_settings() || p_settings where id = p_league;
end $$;

create function public.commish_rename_league(p_league uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_commissioner(p_league);
  update leagues set name = trim(p_name) where id = p_league;
end $$;

-- Put a player on any team (used to load rosters when moving from another app).
create function public.commish_assign_player(p_league uuid, p_team uuid, p_player jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  eff date := public._effective_date(p_league);
  spot roster_spots;
  team_name text;
begin
  perform public._require_commissioner(p_league);
  perform public._validate_player(p_player);
  select name into team_name from teams where id = p_team and league_id = p_league;
  if team_name is null then raise exception 'That team is not in this league.'; end if;
  select * into spot from roster_spots where league_id = p_league
    and player_id = (p_player ->> 'id')::int and end_date is null;
  if spot.id is not null then
    if spot.team_id = p_team then return; end if;
    perform public._close_spot(spot.id, eff);
  end if;
  perform public._open_spot(p_league, p_team, (p_player ->> 'id')::int, p_player ->> 'name',
    p_player ->> 'pos', p_player ->> 'team', 'BN', eff);
  perform public._log(p_league, p_team, 'commissioner',
    'Commissioner assigned ' || (p_player ->> 'name') || ' to ' || team_name);
end $$;

create function public.commish_release_player(p_league uuid, p_player_id int) returns void
language plpgsql security definer set search_path = public as $$
declare
  spot roster_spots;
begin
  perform public._require_commissioner(p_league);
  select * into spot from roster_spots where league_id = p_league and player_id = p_player_id and end_date is null;
  if spot.id is null then raise exception 'That player is not on a team.'; end if;
  perform public._close_spot(spot.id, public._effective_date(p_league));
  perform public._log(p_league, spot.team_id, 'commissioner', 'Commissioner released ' || spot.player_name);
end $$;

-- p_weeks: [{"week": 1, "start_date": "2026-10-12", "end_date": "2026-10-18",
--            "matchups": [["<home team id>", "<away team id>"], ...]}, ...]
-- Replaces weeks that have not finished yet; finished weeks are kept.
create function public.commish_set_schedule(p_league uuid, p_weeks jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  w jsonb;
  m jsonb;
begin
  perform public._require_commissioner(p_league);
  delete from weeks where league_id = p_league
    and not exists (select 1 from matchups where league_id = p_league and week = weeks.week and final);
  for w in select * from jsonb_array_elements(p_weeks) loop
    if exists (select 1 from weeks where league_id = p_league and week = (w ->> 'week')::int) then
      continue;
    end if;
    insert into weeks (league_id, week, start_date, end_date)
    values (p_league, (w ->> 'week')::int, (w ->> 'start_date')::date, (w ->> 'end_date')::date);
    for m in select * from jsonb_array_elements(w -> 'matchups') loop
      if not exists (select 1 from teams where league_id = p_league and id in ((m ->> 0)::uuid, (m ->> 1)::uuid)
                     having count(*) = 2) then
        raise exception 'Schedule includes a team that is not in this league.';
      end if;
      insert into matchups (league_id, week, home_team_id, away_team_id)
      values (p_league, (w ->> 'week')::int, (m ->> 0)::uuid, (m ->> 1)::uuid);
    end loop;
  end loop;
  perform public._log(p_league, null, 'commissioner', 'Commissioner updated the schedule');
end $$;

-- Give every team one pick per round for a draft year (skips picks that exist).
create function public.commish_create_picks(p_league uuid, p_season int, p_rounds int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_commissioner(p_league);
  if p_rounds < 1 or p_rounds > 30 then raise exception 'Rounds must be between 1 and 30.'; end if;
  insert into draft_picks (league_id, season, round, original_team_id, owner_team_id)
  select p_league, p_season, r, t.id, t.id
  from teams t cross join generate_series(1, p_rounds) r
  where t.league_id = p_league
  on conflict do nothing;
  perform public._log(p_league, null, 'commissioner',
    'Commissioner created ' || p_rounds || ' rounds of ' || p_season || ' draft picks');
end $$;

create function public.commish_reassign_pick(p_league uuid, p_pick uuid, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._require_commissioner(p_league);
  if not exists (select 1 from teams where id = p_team and league_id = p_league) then
    raise exception 'That team is not in this league.';
  end if;
  update draft_picks set owner_team_id = p_team where id = p_pick and league_id = p_league;
end $$;

-- ---------------------------------------------------------------------------
-- Scoring (called by the nightly job with the service role key)
-- ---------------------------------------------------------------------------

create function public.finalize_matchup(p_matchup uuid, p_home numeric, p_away numeric) returns void
language sql security definer set search_path = public as $$
  update matchups set home_score = p_home, away_score = p_away, final = true where id = p_matchup;
$$;

-- Nothing here should be callable without signing in, and scoring is
-- reserved for the server.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.finalize_matchup(uuid, numeric, numeric) from authenticated;
