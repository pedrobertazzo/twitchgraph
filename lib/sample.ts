import type { Category, Snapshot, Stream } from './types';

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
    });
  }
  streams.sort((a, b) => b.viewers - a.viewers);
  return { at: now.toISOString(), sample: true, streams, categories };
}
