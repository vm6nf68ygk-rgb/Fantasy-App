import type { DemoControls } from './demo/demoBackend';

export interface AuthUser {
  id: string;
  email: string | null;
}

/** The app talks to its database only through named functions (see supabase/migrations). */
export interface Backend {
  mode: 'supabase' | 'demo';
  /** Only in demo mode: switch teams, reset data, generated stats. */
  demo?: DemoControls;
  rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
  currentUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}

export const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export async function createBackend(): Promise<Backend> {
  if (supabaseConfigured) {
    const { createSupabaseBackend } = await import('./supabaseBackend');
    return createSupabaseBackend(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  }
  const { createDemoBackend } = await import('./demo/demoBackend');
  return createDemoBackend();
}
