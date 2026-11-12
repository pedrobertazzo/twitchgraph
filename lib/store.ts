import 'server-only';

// Where the refresher keeps Twitch answers, and where pages read them. On Vercel this is Upstash Redis
// (shared by every server instance); without Redis settings it's this process's memory, which only suits one
// long-running server or local development.
//
// Upstash's REST API is plain HTTPS, so no client library is needed. Vercel's Upstash integration names the settings
// either UPSTASH_REDIS_REST_* or KV_REST_API_*; both work.

const URL_ = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const PREFIX = 'tw:v1:';

export const hasRedis = () => Boolean(URL_ && TOKEN);

type Cmd = (string | number)[];

// Pages read through Next's data cache (tagged per key, kept at most a minute), because a "never cache" fetch isn't
// allowed while Next renders a cached page. The refresher expires exactly the keys it rewrites (see storeTag), so
// pages pick up new data on their next visit. Everything else (writes, bookkeeping, the rate limit) runs only in the
// refresher and always goes straight to Redis.
export const storeTag = (key: string) => `store:${key}`;

async function redis(cmds: Cmd[], read?: { tags: string[] }): Promise<unknown[]> {
  const res = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
    ...(read ? { cache: 'force-cache' as const, next: { revalidate: 60, tags: read.tags } } : { cache: 'no-store' as const }),
  });
  if (!res.ok) throw new Error(`Redis ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const out = (await res.json()) as { result?: unknown; error?: string }[];
  return out.map((r) => {
    if (r.error) throw new Error(`Redis: ${r.error}`);
    return r.result;
  });
}

// --- In-memory fallback ---------------------------------------------------------------------------
type Mem = { kv: Map<string, string>; meta: Map<string, string>; locks: Map<string, number>; calls: number[] };
const g = globalThis as unknown as { __fdMem?: Mem };
const mem: Mem = (g.__fdMem ??= { kv: new Map(), meta: new Map(), locks: new Map(), calls: [] as number[] });

/** Clears the in-memory store. Tests only. */
export function resetMemory() {
  mem.kv.clear();
  mem.meta.clear();
  mem.locks.clear();
  mem.calls.length = 0;
}

// --- Data ---------------------------------------------------------------------------------------
// Pages read through the cache; the refresher passes { fresh: true } to read what is in Redis right now.
export async function getMany<T>(keys: string[], opts: { fresh?: boolean } = {}): Promise<(T | null)[]> {
  if (!keys.length) return [];
  const raw = hasRedis()
    ? ((await redis(
        keys.map((k) => ['GET', PREFIX + k]),
        opts.fresh ? undefined : { tags: keys.map(storeTag) },
      )) as (string | null)[])
    : keys.map((k) => mem.kv.get(k) ?? null);
  return raw.map((v) => (v ? (JSON.parse(v) as T) : null));
}

export async function put(key: string, value: unknown) {
  const v = JSON.stringify(value);
  if (hasRedis()) await redis([['SET', PREFIX + key, v]]);
  else mem.kv.set(key, v);
}

// --- Bookkeeping: when each job last ran, and what it learned -------------------------------------
export async function getMeta<T>(): Promise<Record<string, T>> {
  let flat: Record<string, string>;
  if (hasRedis()) {
    const [arr] = (await redis([['HGETALL', `${PREFIX}meta`]])) as [string[]];
    flat = {};
    for (let i = 0; i < (arr?.length ?? 0); i += 2) flat[arr[i]] = arr[i + 1];
  } else flat = Object.fromEntries(mem.meta);
  return Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, JSON.parse(v) as T]));
}

export async function setMeta(field: string, value: unknown) {
  const v = JSON.stringify(value);
  if (hasRedis()) await redis([['HSET', `${PREFIX}meta`, field, v]]);
  else mem.meta.set(field, v);
}

// --- Only one refresher at a time ---------------------------------------------------------------
export async function tryLock(name: string, seconds: number): Promise<boolean> {
  if (hasRedis()) {
    const [r] = await redis([['SET', `${PREFIX}lock:${name}`, String(Date.now()), 'NX', 'EX', seconds]]);
    return r === 'OK';
  }
  const until = mem.locks.get(name) ?? 0;
  if (until > Date.now()) return false;
  mem.locks.set(name, Date.now() + seconds * 1000);
  return true;
}

export async function unlock(name: string) {
  if (hasRedis()) await redis([['DEL', `${PREFIX}lock:${name}`]]);
  else mem.locks.delete(name);
}

// --- The shared rate limit: at most `limit` API calls in any rolling minute --------------------------
// Returns 0 and records the call when there's room, or how many milliseconds until there will be.
export async function takeSlot(limit: number, windowMs = 60_000): Promise<number> {
  const now = Date.now();
  if (hasRedis()) {
    const key = `${PREFIX}calls`;
    const [, count, oldest] = (await redis([
      ['ZREMRANGEBYSCORE', key, 0, now - windowMs],
      ['ZCARD', key],
      ['ZRANGE', key, 0, 0, 'WITHSCORES'],
    ])) as [number, number, string[]];
    if (count >= limit) return Math.max(250, Number(oldest?.[1] ?? now) + windowMs - now + 50);
    await redis([
      ['ZADD', key, now, `${now}-${Math.random().toString(36).slice(2, 8)}`],
      ['PEXPIRE', key, windowMs * 2],
    ]);
    return 0;
  }
  while (mem.calls.length && now - mem.calls[0] >= windowMs) mem.calls.shift();
  if (mem.calls.length >= limit) return Math.max(250, mem.calls[0] + windowMs - now + 50);
  mem.calls.push(now);
  return 0;
}
