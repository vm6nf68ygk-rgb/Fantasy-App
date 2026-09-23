import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../components/overlays';
import { Page, Section, Spinner } from '../components/ui';
import { useAction, useLeagueSelection, useSession } from '../data/session';

function AppIcon() {
  return <img className="app-icon" src="/icon-512.png" alt="" />;
}

/** Email one-time code sign-in (works inside a Home Screen web app, unlike email links). */
export function SignIn() {
  const { backend } = useSession();
  const ui = useUI();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await backend.sendCode(email.trim());
      setSent(true);
    } catch (e) {
      await ui.alert('Couldn’t send code', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    try {
      await backend.verifyCode(email.trim(), code.trim());
    } catch (e) {
      await ui.alert('That code didn’t work', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Sign In" large={false} tabbar={false}>
      <div className="hero" style={{ paddingTop: 32 }}>
        <AppIcon />
        <h1>Fantasy Hockey</h1>
        <p>{sent ? `Enter the 6-digit code sent to ${email}.` : 'Sign in with your email. No password needed.'}</p>
      </div>
      {!sent ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Section>
            <div className="row">
              <input
                className="left"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email"
                autoFocus
              />
            </div>
          </Section>
          <div className="pad">
            <button className="btn" disabled={busy || !/.+@.+\..+/.test(email)}>{busy ? <Spinner inline /> : 'Send Code'}</button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <Section footer="Didn’t get it? Check spam, or go back and try again.">
            <div className="row">
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                aria-label="Code"
                autoFocus
              />
            </div>
          </Section>
          <div className="pad" style={{ display: 'grid', gap: 10 }}>
            <button className="btn" disabled={busy || code.length < 6}>{busy ? <Spinner inline /> : 'Sign In'}</button>
            <button type="button" className="btn gray" onClick={() => { setSent(false); setCode(''); }}>Use a Different Email</button>
          </div>
        </form>
      )}
    </Page>
  );
}

/** Create a league or join one with an invite code. */
export function Welcome({ canGoBack }: { canGoBack?: boolean }) {
  const { run, busy } = useAction();
  const { setLeagueId, refetchLeagues } = useLeagueSelection();
  const { backend } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'join' | 'create'>('join');
  const [code, setCode] = useState('');
  const [leagueName, setLeagueName] = useState('');
  const [teamName, setTeamName] = useState('');

  const submit = async () => {
    const id =
      mode === 'create'
        ? await run<string>('create_league', { p_name: leagueName, p_team_name: teamName }, 'League created')
        : await run<string>('join_league', { p_code: code, p_team_name: teamName }, 'Welcome to the league');
    if (id) {
      await refetchLeagues();
      setLeagueId(id);
      navigate(mode === 'create' ? '/league/commissioner' : '/', { replace: true });
    }
  };
  const ready = teamName.trim() && (mode === 'create' ? leagueName.trim() : code.trim().length >= 6);

  return (
    <Page
      title="Welcome"
      large={false}
      tabbar={false}
      left={canGoBack ? <button className="nav-btn" onClick={() => navigate(-1)}>Cancel</button> : undefined}
      right={!canGoBack && backend.mode === 'supabase' ? <button className="nav-btn" onClick={() => backend.signOut()}>Sign Out</button> : undefined}
    >
      <div className="hero">
        <AppIcon />
        <h1>{mode === 'join' ? 'Join Your League' : 'Start a League'}</h1>
        <p>{mode === 'join' ? 'Ask your commissioner for the invite code.' : 'You’ll be the commissioner and can invite everyone else.'}</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (ready) submit(); }}>
        <Section>
          {mode === 'join' ? (
            <div className="row">
              <span className="label">Invite Code</span>
              <input type="text" autoCapitalize="characters" value={code} maxLength={6} placeholder="ABC123" onChange={(e) => setCode(e.target.value.toUpperCase())} aria-label="Invite code" />
            </div>
          ) : (
            <div className="row">
              <span className="label">League Name</span>
              <input type="text" value={leagueName} maxLength={60} placeholder="The Beer League" onChange={(e) => setLeagueName(e.target.value)} aria-label="League name" />
            </div>
          )}
          <div className="row">
            <span className="label">Your Team Name</span>
            <input type="text" value={teamName} maxLength={40} placeholder="Five Hole Heroes" onChange={(e) => setTeamName(e.target.value)} aria-label="Team name" />
          </div>
        </Section>
        <div className="pad" style={{ display: 'grid', gap: 10 }}>
          <button className="btn" disabled={!ready || busy}>{mode === 'join' ? 'Join League' : 'Create League'}</button>
          <button type="button" className="btn gray" onClick={() => setMode(mode === 'join' ? 'create' : 'join')}>
            {mode === 'join' ? 'Start a New League Instead' : 'Join with an Invite Code Instead'}
          </button>
        </div>
      </form>
    </Page>
  );
}
