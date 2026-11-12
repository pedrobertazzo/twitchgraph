import type { Category, Census, Clip, Extras, HistoryPoint, Snapshot, Stream } from './types';

// A made-up board for when no Twitch keys are configured. Channel names are invented; the page labels it as sample data.

const CATEGORIES: [name: string, weight: number][] = [
  ['Just Chatting', 22], ['Grand Theft Auto V', 9], ['League of Legends', 8], ['Counter-Strike', 7], ['Valorant', 6],
  ['Fortnite', 5], ['Minecraft', 5], ['Dota 2', 4], ['World of Warcraft', 3], ['Apex Legends', 3], ['Sports', 3],
  ['Music', 2], ['IRL', 2], ['Hearthstone', 2], ['Rust', 2], ['Escape from Tarkov', 2], ['EA Sports FC 26', 2],
  ['Chess', 1], ['Art', 1], ['Talk Shows & Podcasts', 1], ['Dead by Daylight', 1], ['Elden Ring', 1], ['Slots', 1],
];
const LANGS: [string, number][] = [
  ['en', 40], ['es', 12], ['pt', 8], ['ko', 7], ['ja', 7], ['ru', 6], ['fr', 6], ['de', 6], ['zh', 3], ['it', 2], ['tr', 2], ['pl', 1],
];
const TAGS = ['English', 'Español', 'Competitive', 'Chill', 'Esports', 'FirstPlaythrough', 'Speedrun', 'Roleplay', 'Variety', 'Funny', 'Interactive', 'NoBackseating', 'Coaching', 'Drops'];
const SYL = ['ka', 'zu', 'mi', 'ro', 'vex', 'lo', 'nyx', 'ta', 'shi', 'bo', 'ra', 'kin', 'ze', 'qua', 'dor', 'fi', 'lux', 'mo', 'pex', 'yu'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: [T, number][]): T {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of list) if ((x -= w) < 0) return v;
  return list[0][0];
}

function handle(r: () => number, i: number) {
  const n = 2 + Math.floor(r() * 2);
  let s = '';
  for (let k = 0; k < n; k++) s += SYL[Math.floor(r() * SYL.length)];
  return r() < 0.3 ? `${s}${i % 100}` : s;
}

export function sampleSnapshot(now: Date, count = 500): Snapshot {
  // The channels stay the same all day; viewer counts drift a little each minute so the board feels live.
  const day = Math.floor(now.getTime() / 86_400_000);
  const minute = Math.floor(now.getTime() / 60_000);
  const r = rng(day * 7919);
  const drift = rng(minute);

  const categories: Record<string, Category> = {};
  CATEGORIES.forEach(([name], i) => (categories[`c${i}`] = { id: `c${i}`, name, art: '' }));

  const streams: Stream[] = [];
  for (let i = 0; i < count; i++) {
    const name = handle(r, i);
    const game = pick(r, CATEGORIES.map(([n, w], k) => [k, w] as [number, number]));
    const base = 210_000 / Math.pow(i + 1, 1.05) + 700;
    const viewers = Math.round(base * (0.9 + r() * 0.2) * (0.97 + drift() * 0.06));
    const hoursLive = r() < 0.06 ? 12 + r() * 30 : Math.pow(r(), 1.4) * 9;
    const tags = TAGS.filter(() => r() < 0.18).slice(0, 4);
    streams.push({
      id: `s${i}`,
      userId: `u${i}`,
      login: name.toLowerCase(),
      name: name[0].toUpperCase() + name.slice(1),
      gameId: `c${game}`,
      game: CATEGORIES[game][0],
      title: 'Sample stream',
      viewers,
      startedAt: new Date(now.getTime() - hoursLive * 3_600_000).toISOString(),
      language: pick(r, LANGS),
      thumb: '',
      tags,
      mature: r() < 0.2,
      broadcasterType: i < 60 || r() < 0.55 ? 'partner' : r() < 0.85 ? 'affiliate' : '',
      createdAt: new Date(now.getTime() - (r() < 0.08 ? r() * 300 : 300 + r() * 4000) * 86_400_000).toISOString(),
    });
  }
  streams.sort((a, b) => b.viewers - a.viewers);
  return { at: now.toISOString(), sample: true, streams, categories };
}

// A made-up background collection: a full count with the usual long tail, two days of history following a daily
// rhythm, and some clips. Labelled as sample data on the page like the rest.
export function sampleExtras(now: Date): Extras {
  const snap = sampleSnapshot(now);
  const r = rng(Math.floor(now.getTime() / 86_400_000) * 31);
  const topViewers = snap.streams.reduce((a, s) => a + s.viewers, 0);
  // Beyond the top 500: tens of thousands of small channels, most with a handful of viewers.
  const tail = Array.from({ length: 72_000 }, () => Math.floor(Math.pow(r(), 3.2) * 140));
  const all = [...snap.streams.map((s) => s.viewers), ...tail].sort((a, b) => a - b);
  const viewers = topViewers + tail.reduce((a, v) => a + v, 0);
  const bands: [string, number, number][] = [
    ['No viewers', 0, 1], ['1 to 5', 1, 6], ['6 to 20', 6, 21], ['21 to 100', 21, 101], ['101 to 1k', 101, 1_001], ['1k to 10k', 1_001, 10_001], ['10k+', 10_001, Infinity],
  ];
  const byGame = new Map<string, { id: string; name: string; viewers: number; channels: number }>();
  for (const st of snap.streams) {
    const e = byGame.get(st.gameId) ?? { id: st.gameId, name: st.game, viewers: 0, channels: 0 };
    e.viewers += st.viewers * 1.6;
    e.channels += 110;
    byGame.set(st.gameId, e);
  }
  const categories = [...byGame.values()].map((c) => ({ ...c, viewers: Math.round(c.viewers) })).sort((a, b) => b.viewers - a.viewers);
  const census: Census = {
    at: now.toISOString(),
    ms: 84_000,
    channels: all.length,
    viewers,
    median: all[all.length >> 1],
    bands: bands.map(([label, lo, hi]) => {
      const inBand = all.filter((v) => v >= lo && v < hi);
      return { label, channels: inBand.length, viewers: inBand.reduce((a, v) => a + v, 0) };
    }),
    categories,
    languages: [['en', 0.42], ['es', 0.13], ['pt', 0.08], ['ru', 0.07], ['ko', 0.06], ['ja', 0.06], ['fr', 0.05], ['de', 0.05], ['other', 0.08]].map(([code, share]) => ({
      code: code as string,
      viewers: Math.round(viewers * (share as number)),
      channels: Math.round(all.length * (share as number)),
    })),
  };
  // Two days, every 15 minutes: busiest in the European and American evening.
  const history: HistoryPoint[] = [];
  for (let t = now.getTime() - 48 * 3_600_000; t <= now.getTime(); t += 15 * 60_000) {
    const h = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
    const wave = 0.72 + 0.2 * Math.sin(((h - 14) / 24) * 2 * Math.PI) + 0.08 * Math.sin(((h - 1) / 12) * 2 * Math.PI);
    const k = wave * (0.97 + r() * 0.06);
    history.push({
      t,
      viewers: Math.round(viewers * k),
      channels: Math.round(all.length * (0.8 + 0.25 * wave)),
      // each category on its own rhythm, so at any moment some are rising and some falling
      cats: Object.fromEntries(categories.slice(0, 12).map((c, i) => [c.id, Math.round(c.viewers * k * (1 + 0.12 * Math.sin(t / 7_200_000 + i * 1.7)))])),
      names: Object.fromEntries(categories.slice(0, 12).map((c) => [c.id, c.name])),
    });
  }
  const clips: Clip[] = snap.streams.slice(0, 12).map((st, i) => ({
    id: `clip${i}`,
    url: '',
    title: ['Unbelievable clutch', 'Chat lost it', 'The perfect throw', 'Did that just happen?', 'Speedrun skip', 'Wholesome moment'][i % 6],
    broadcaster: st.name,
    game: st.game,
    views: Math.round(180_000 / (i + 1.4)),
    thumb: '',
    createdAt: new Date(now.getTime() - i * 3_100_000).toISOString(),
  }));
  return { census, history, clips };
}
