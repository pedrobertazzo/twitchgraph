import 'server-only';
import type { Category, Snapshot, Stream } from './types';
import { sampleSnapshot } from './sample';

const HELIX = 'https://api.twitch.tv/helix';
// How many of the biggest live channels one snapshot reads. Helix pages hold 100; five pages cover most of the audience.
export const PAGES = 5;
// Every Helix response is kept this long in Next's data cache, which every server instance shares. One snapshot is
// about 6 calls a minute however many people are watching.
export const FRESH_S = 60;

type HelixStream = {
  id: string;
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
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    body,
    ...(cached ? { cache: 'force-cache' as const, next: { revalidate: 7 * 86_400 } } : { cache: 'no-store' as const }),
  });
  if (!res.ok) throw new Error(`Twitch token request failed (${res.status})`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const appToken = async () => override ?? requestToken(true);

async function helix<T>(path: string, retry = true): Promise<{ data: T[]; pagination?: { cursor?: string } }> {
  const res = await fetch(`${HELIX}${path}`, {
    headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${await appToken()}` },
    cache: 'force-cache',
    next: { revalidate: FRESH_S },
  });
  if (res.status === 401 && retry) {
    override = await requestToken(false); // revoked or expired early
    return helix(path, false);
  }
  if (!res.ok) throw new Error(`Twitch ${path.split('?')[0]} failed (${res.status})`);
  return res.json();
}

export function toStream(s: HelixStream): Stream {
  return {
    id: s.id,
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
  return { at: new Date().toISOString(), sample: false, streams: unique, categories };
}

// The current snapshot: shared through the data cache, at most a minute old, and made up when no keys are set.
// A failure throws, so pages and the API route keep serving their last good version.
export async function getSnapshot(): Promise<Snapshot> {
  if (!hasKeys()) return sampleSnapshot(new Date());
  return fetchSnapshot();
}
