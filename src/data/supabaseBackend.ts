import { createClient } from '@supabase/supabase-js';
import type { AuthUser, Backend } from './backend';

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const toUser = (u: { id: string; email?: string | null } | null | undefined): AuthUser | null =>
    u ? { id: u.id, email: u.email ?? null } : null;

  return {
    mode: 'supabase',
    async rpc<T>(name: string, args: Record<string, unknown> = {}) {
      const { data, error } = await client.rpc(name, args);
      if (error) throw new Error(error.message);
      return data as T;
    },
    async currentUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = client.auth.onAuthStateChange((_event, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async sendCode(email) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(error.message);
    },
    async verifyCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await client.auth.signOut();
    },
  };
}
