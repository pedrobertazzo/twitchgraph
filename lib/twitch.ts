import 'server-only';
import type { Category, Census, Clip, Snapshot, Stream } from './types';
import { sampleSnapshot } from './sample';

// Overridable for end-to-end tests against stand-in servers.
const HELIX = process.env.TWITCH_HELIX_URL ?? 'https://api.twitch.tv/helix';
const TOKEN_URL = process.env.TWITCH_TOKEN_URL ?? 'https://id.twitch.tv/oauth2/token';
// How many of the biggest live channels one snapshot reads. Helix pages hold 100; five pages cover most of the audience.
export const PAGES = 5;
// Every Helix response is kept this long in Next's data cache, which every server instance shares. One snapshot is
// about 6 calls a minute however many people are watching.
export const FRESH_S = 60;

type HelixStream = {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  language: string;
  thumbnail_url: string;
  tags: string[] | null;
  is_mature: boolean;
};
type HelixGame = { id: string; name: string; box_art_url: string };
type HelixUser = { id: string; profile_image_url: string; broadcaster_type: '' | 'partner' | 'affiliate'; created_at: string };

export const hasKeys = () => Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);

// The app token lives about 60 days. It is cached for a week in the shared data cache; if Twitch rejects it sooner,
// a fresh one is requested directly and used for the rest of that snapshot.
let override: string | null = null;

async function requestToken(cached: boolean): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    client_secret: process.env.TWITCH_CLIENT_SECRET!,
    grant_type: 'client_credentials',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    body,
    ...(cached ? { cache: 'force-cache' as const, next: { revalidate: 7 * 86_400 } } : { cache: 'no-store' as const }),
  });
  if (!res.ok) throw new Error(`Twitch token request failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const appToken = async () => override ?? requestToken(true);

async function helix<T>(path: string, retry = true, ttl: number = FRESH_S): Promise<{ data: T[]; pagination?: { cursor?: string } }> {
  const res = await fetch(`${HELIX}${path}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${await appToken()}` },
    cache: 'force-cache',
    next: { revalidate: ttl },
  });
  if (res.status === 401 && retry) {
    override = await requestToken(false); // revoked or expired early
    return helix(path, false, ttl);
  }
  if (!res.ok) throw new Error(`Twitch ${path.split('?')[0]} failed (${res.status})`);
  return res.json();
}

export function toStream(s: HelixStream): Stream {
  return {
    id: s.id,
    userId: s.user_id,
    login: s.user_login,
    name: s.user_name,
    gameId: s.game_id,
    game: s.game_name || 'No category',
    title: s.title,
    viewers: s.viewer_count,
    startedAt: s.started_at,
    language: s.language || 'other',
    thumb: s.thumbnail_url,
    tags: s.tags ?? [],
    mature: s.is_mature,
  };
}

async function fetchSnapshot(): Promise<Snapshot> {
  const streams: Stream[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < PAGES; page++) {
    const res = await helix<HelixStream>(`/streams?type=live&first=100${cursor ? `&after=${cursor}` : ''}`);
    streams.push(...res.data.map(toStream));
    cursor = res.pagination?.cursor;
    if (!cursor) break;
  }
  // Pages can overlap when viewer counts shift mid-read; keep the first sighting of each channel.
  const seen = new Set<string>();
  const unique = streams.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));

  const ids = [...new Set(unique.map((s) => s.gameId).filter(Boolean))];
  const categories: Record<string, Category> = {};
  for (let i = 0; i < ids.length; i += 100) {
    const q = ids.slice(i, i + 100).map((id) => `id=${id}`).join('&');
    const res = await helix<HelixGame>(`/games?${q}`);
    for (const g of res.data) categories[g.id] = { id: g.id, name: g.name, art: g.box_art_url };
  }
  // Profile pictures: /users takes 100 ids a call. Pictures rarely change, so these are cached for an hour.
  const userIds = unique.map((s) => s.userId);
  // The same call gives partner/affiliate status and account age.
  const users = new Map<string, HelixUser>();
  for (let i = 0; i < userIds.length; i += 100) {
    const q = userIds.slice(i, i + 100).map((id) => `id=${id}`).join('&');
    const res = await helix<HelixUser>(`/users?${q}`, true, 3600);
    for (const u of res.data) users.set(u.id, u);
  }
  for (const s of unique) {
    const u = users.get(s.userId);
    s.avatar = u?.profile_image_url;
    s.broadcasterType = u?.broadcaster_type ?? '';
    s.createdAt = u?.created_at;
  }

  return { at: new Date().toISOString(), sample: false, streams: unique, categories };
}

// The current snapshot: shared through the data cache, at most a minute old, and made up when no keys are set.
// A failure throws, so pages and the API route keep serving their last good version.
export async function getSnapshot(): Promise<Snapshot> {
  if (!hasKeys()) return sampleSnapshot(new Date());
  return fetchSnapshot();
}

// --- Background collection (used only by the refresher, never by a page) --------------------------------------------

// Uncached Helix calls for the refresher, paced to stay well under Twitch's 800 points a minute: at most 10 a second
// across every parallel chain, and a pause when Twitch's own Ratelimit-Remaining runs low.
let nextSlot = 0;
let remaining = 800;
let resetAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function helixLive<T>(path: string, retry = true): Promise<{ data: T[]; pagination?: { cursor?: string } }> {
  for (;;) {
    const now = Date.now();
    if (remaining < 40 && resetAt > now) await sleep(resetAt - now + 200);
    const slot = Math.max(nextSlot, Date.now());
    nextSlot = slot + 100;
    if (slot > Date.now()) await sleep(slot - Date.now());
    const res = await fetch(`${HELIX}${path}`, {
      headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${await appToken()}` },
      cache: 'no-store',
    });
    remaining = Number(res.headers.get('Ratelimit-Remaining') ?? remaining);
    resetAt = Number(res.headers.get('Ratelimit-Reset') ?? 0) * 1000 || resetAt;
    if (res.status === 429) {
      remaining = 0;
      resetAt = Math.max(resetAt, Date.now() + 5_000);
      continue;
    }
    if (res.status === 401 && retry) {
      override = await requestToken(false);
      retry = false;
      continue;
    }
    if (!res.ok) throw new Error(`Twitch ${path.split('?')[0]} failed (${res.status})`);
    return res.json();
  }
}

// Every ISO 639-1 code: the full count runs one chain of pages per big language and puts all the rest in a few
// shared chains, so it takes about as long as the biggest language rather than the whole site, without missing any.
const BIG = ['en', 'es', 'pt', 'ru', 'ko', 'ja', 'fr', 'de', 'zh', 'it', 'tr', 'pl'];
const ALL_CODES =
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'.split(' ');

export function languageChains(): string[][] {
  const rest = [...ALL_CODES.filter((c) => !BIG.includes(c)), 'asl', 'other'];
  return [...BIG.map((c) => [c]), rest.slice(0, 90), rest.slice(90)];
}

const BANDS: [string, number, number][] = [
  ['No viewers', 0, 1],
  ['1 to 5', 1, 6],
  ['6 to 20', 6, 21],
  ['21 to 100', 21, 101],
  ['101 to 1k', 101, 1_001],
  ['1k to 10k', 1_001, 10_001],
  ['10k+', 10_001, Infinity],
];

// Counts everyone live. Pages are read in parallel chains (one per language group); the list re-sorts while it's
// read, so channels seen twice are counted once and a few may be missed: the totals are approximate.
export async function takeCensus(): Promise<Census> {
  const started = Date.now();
  const seen = new Map<string, { viewers: number; game: string; gameId: string; language: string }>();
  await Promise.all(
    languageChains().map(async (langs) => {
      const lang = langs.map((l) => `language=${l}`).join('&');
      let cursor: string | undefined;
      for (let page = 0; page < 2_000; page++) {
        const res = await helixLive<HelixStream>(`/streams?type=live&first=100&${lang}${cursor ? `&after=${cursor}` : ''}`);
        for (const x of res.data)
          if (!seen.has(x.id)) seen.set(x.id, { viewers: x.viewer_count, game: x.game_name || 'No category', gameId: x.game_id, language: x.language || 'other' });
        cursor = res.pagination?.cursor;
        if (!cursor || !res.data.length) break;
      }
    }),
  );
  const all = [...seen.values()];
  const viewers = all.reduce((a, x) => a + x.viewers, 0);
  const sorted = all.map((x) => x.viewers).sort((a, b) => a - b);
  const group = <K extends string>(key: (x: (typeof all)[number]) => K) => {
    const m = new Map<K, { viewers: number; channels: number }>();
    for (const x of all) {
      const e = m.get(key(x)) ?? { viewers: 0, channels: 0 };
      e.viewers += x.viewers;
      e.channels++;
      m.set(key(x), e);
    }
    return [...m.entries()].sort((a, b) => b[1].viewers - a[1].viewers);
  };
  const names = new Map(all.map((x) => [x.gameId || x.game, x.game]));
  return {
    at: new Date().toISOString(),
    ms: Date.now() - started,
    channels: all.length,
    viewers,
    median: sorted.length ? sorted[sorted.length >> 1] : 0,
    bands: BANDS.map(([label, lo, hi]) => {
      const inBand = all.filter((x) => x.viewers >= lo && x.viewers < hi);
      return { label, channels: inBand.length, viewers: inBand.reduce((a, x) => a + x.viewers, 0) };
    }),
    categories: group((x) => x.gameId || x.game)
      .slice(0, 60)
      .map(([id, e]) => ({ id, name: names.get(id) ?? id, ...e })),
    languages: group((x) => x.language).map(([code, e]) => ({ code, ...e })),
  };
}

type HelixClip = { id: string; url: string; title: string; broadcaster_name: string; game_id: string; view_count: number; thumbnail_url: string; created_at: string };

// The most-watched clips made in the last 24 hours in the biggest categories.
export async function topClips(categories: { id: string; name: string }[], perCategory = 4): Promise<Clip[]> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const lists = await Promise.all(
    categories
      .filter((c) => /^\d+$/.test(c.id))
      .map(async (c) => {
        const res = await helixLive<HelixClip>(`/clips?game_id=${c.id}&started_at=${encodeURIComponent(since)}&first=${perCategory}`);
        return res.data.map(
          (x): Clip => ({ id: x.id, url: x.url, title: x.title, broadcaster: x.broadcaster_name, game: c.name, views: x.view_count, thumb: x.thumbnail_url, createdAt: x.created_at }),
        );
      }),
  );
  return lists.flat().sort((a, b) => b.views - a.views).slice(0, 16);
}
