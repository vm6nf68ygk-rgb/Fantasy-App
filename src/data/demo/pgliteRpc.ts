import type { PGlite } from '@electric-sql/pglite';

// Calls a database function the way Supabase's rpc() does: by parameter name.
export async function pgliteRpc<T = unknown>(
  db: PGlite,
  uid: string | null,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!/^[a-z_]+$/.test(name)) throw new Error(`Bad function name: ${name}`);
  const keys = Object.keys(args);
  keys.forEach((k) => {
    if (!/^p_[a-z_]+$/.test(k)) throw new Error(`Bad argument name: ${k}`);
  });
  const params = keys.map((k) => {
    const v = args[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) return JSON.stringify(v);
    return v;
  });
  const call = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as result`;
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('app.uid', $1, true)`, [uid ?? '']);
    const res = await tx.query<{ result: T }>(call, params);
    return res.rows[0]?.result as T;
  });
}
