import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { IconArrows, IconJersey, IconPeople, IconRink, IconTrophy } from './components/icons';
import { UIProvider } from './components/overlays';
import { Empty, Spinner } from './components/ui';
import { LeagueProvider, SessionProvider, useLeague, useSession } from './data/session';
import { ActivityPage, CommissionerPage, LeagueScreen, PicksPage, SchedulePage, SettingsPage } from './screens/LeagueScreen';
import { MatchupScreen } from './screens/MatchupScreen';
import { PlayersScreen } from './screens/PlayersScreen';
import { TeamScreen } from './screens/TeamScreen';
import { TradeBuilder, TradesScreen } from './screens/TradesScreen';
import { SignIn, Welcome } from './screens/Welcome';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 } },
});

/** Shrinks the floating tab bar while scrolling down, and restores it on the way back up. */
function useMinimizeOnScroll(pathname: string) {
  const [min, setMin] = useState(false);
  useEffect(() => {
    setMin(false);
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setMin(y > last && y > 120);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);
  return min;
}

function TabBar() {
  const { data: state } = useLeague();
  const { pathname } = useLocation();
  const min = useMinimizeOnScroll(pathname);
  if (pathname.startsWith('/trades/new') || pathname.startsWith('/welcome')) return null;
  const incoming = state?.trades.filter((t) => t.status === 'pending' && t.recipient_team_id === state.me.team_id).length ?? 0;
  const tabs = [
    { to: '/', label: 'Matchup', icon: <IconRink />, match: (p: string) => p === '/' || p.startsWith('/matchup') },
    { to: '/team', label: 'My Team', icon: <IconJersey />, match: (p: string) => p.startsWith('/team') && !p.startsWith('/teams') },
    { to: '/players', label: 'Players', icon: <IconPeople />, match: (p: string) => p.startsWith('/players') },
    { to: '/trades', label: 'Trades', icon: <IconArrows />, badge: incoming, match: (p: string) => p.startsWith('/trades') },
    { to: '/league', label: 'League', icon: <IconTrophy />, match: (p: string) => p.startsWith('/league') || p.startsWith('/teams') },
  ];
  return (
    <nav className={`tabbar ${min ? 'min' : ''}`} aria-label="Main">
      <div className="tabbar-inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={`tab ${t.match(pathname) ? 'on' : ''}`}>
            {t.icon}
            <span>{t.label}</span>
            {!!t.badge && <span className="tab-badge">{t.badge}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function Signed() {
  const { user } = useSession();
  if (!user) return <SignIn />;
  return (
    <LeagueProvider loading={<Spinner />} none={<Welcome />}>
      <Routes>
        <Route path="/" element={<MatchupScreen />} />
        <Route path="/matchup/:week" element={<MatchupScreen />} />
        <Route path="/matchup/:week/:team" element={<MatchupScreen />} />
        <Route path="/team" element={<TeamScreen />} />
        <Route path="/teams/:teamId" element={<TeamScreen />} />
        <Route path="/players" element={<PlayersScreen />} />
        <Route path="/trades" element={<TradesScreen />} />
        <Route path="/trades/new" element={<TradeBuilder />} />
        <Route path="/league" element={<LeagueScreen />} />
        <Route path="/league/schedule" element={<SchedulePage />} />
        <Route path="/league/picks" element={<PicksPage />} />
        <Route path="/league/activity" element={<ActivityPage />} />
        <Route path="/league/settings" element={<SettingsPage />} />
        <Route path="/league/commissioner" element={<CommissionerPage />} />
        <Route path="/welcome" element={<Welcome canGoBack />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </LeagueProvider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UIProvider>
        <BrowserRouter>
          <div className="app">
            <SessionProvider
              loading={<div style={{ paddingTop: '40vh' }}><Spinner /></div>}
              failed={(e) => <Empty title="Couldn’t start" message={e.message} />}
            >
              <Signed />
            </SessionProvider>
          </div>
        </BrowserRouter>
      </UIProvider>
    </QueryClientProvider>
  );
}
