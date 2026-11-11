import { describe, expect, it } from 'vitest';
import { buildInsights, compact, formatValue, median, pulseInsight } from '@/lib/insights';
import { sampleSnapshot } from '@/lib/sample';
import type { Snapshot, Stream } from '@/lib/types';

const AT = '2026-11-11T12:00:00.000Z';

function stream(over: Partial<Stream> & { id: string }): Stream {
  return {
    userId: over.id,
    login: over.id,
    name: over.id,
    gameId: 'g1',
    game: 'Chess',
    title: '',
    viewers: 100,
    startedAt: '2026-11-11T10:00:00.000Z',
    language: 'en',
    thumb: 'https://x/{width}x{height}.jpg',
    tags: [],
    mature: false,
    ...over,
  };
}

function snap(streams: Stream[]): Snapshot {
  return { at: AT, sample: false, streams, categories: { g1: { id: 'g1', name: 'Chess', art: 'https://a/{width}x{height}.jpg' } } };
}

const byKey = (s: Snapshot) => Object.fromEntries(buildInsights(s).map((i) => [i.key, i]));

describe('buildInsights', () => {
  const streams = [
    stream({ id: 'a', viewers: 50_000, game: 'Just Chatting', gameId: 'jc', language: 'es', startedAt: '2026-11-10T20:00:00.000Z', tags: ['Chill'] }),
    stream({ id: 'b', viewers: 30_000, startedAt: '2026-11-11T11:45:00.000Z', tags: ['Chill', 'Competitive'] }),
    stream({ id: 'c', viewers: 15_000, startedAt: '2026-11-11T09:00:00.000Z' }),
    stream({ id: 'd', viewers: 6_000, startedAt: '2026-11-11T09:30:00.000Z' }),
  ];
  const ins = byKey(snap(streams));

  it('totals the audience and splits it into size bands that add up', () => {
    expect(ins.watching.headline.value).toBe(101_000);
    expect(ins.watching.rows.reduce((a, r) => a + r.value, 0)).toBe(101_000);
    expect(ins.watching.rows.find((r) => r.id === '10k to 100k')!.value).toBe(95_000);
  });

  it('ranks categories by viewers and uses box art at a fixed size', () => {
    expect(ins.categories.rows.map((r) => r.label)).toEqual(['Chess', 'Just Chatting']);
    expect(ins.categories.rows[0].value).toBe(51_000);
    expect(ins.categories.rows[0].image).toBe('https://a/144x192.jpg');
  });

  it('counts non-game categories as talking', () => {
    expect(ins.talk.headline.value).toBeCloseTo(49.5, 1);
    expect(ins.talk.rows[0]).toMatchObject({ id: 'games', value: 51_000 });
  });

  it('measures uptime from the snapshot time', () => {
    expect(ins.marathons.rows[0]).toMatchObject({ id: 'a', value: 16 });
    expect(ins.fresh.headline.value).toBe(1); // only b started under 30 minutes ago
    expect(ins.uptime.rows.reduce((a, r) => a + r.value, 0)).toBe(4);
  });

  it('puts go-live times on a 24-hour UTC clock', () => {
    expect(ins.golive.clock).toHaveLength(24);
    expect(ins.golive.clock![9]).toBe(2);
    expect(ins.golive.headline.label).toContain('09:00 UTC');
  });

  it('names languages and sums tags', () => {
    expect(ins.languages.rows[0].label).toBe('English');
    expect(ins.tags.rows[0]).toMatchObject({ label: 'Chill', value: 80_000 });
  });

  it('gives channel rows an avatar and a link to the channel', () => {
    const withAvatar = snap([stream({ id: 'zed', login: 'zed', viewers: 10, avatar: 'https://img/zed.png' })]);
    const row = byKey(withAvatar).channels.rows[0];
    expect(row).toMatchObject({ kind: 'channel', avatar: 'https://img/zed.png', href: 'https://www.twitch.tv/zed' });
    expect(byKey(withAvatar).categories.rows[0].kind).toBe('category');
  });

  it('never links made-up sample channels', () => {
    const all = buildInsights(sampleSnapshot(new Date(AT)));
    for (const i of all) for (const r of i.rows) expect(r.href).toBeUndefined();
  });

  it('copes with an empty snapshot', () => {
    const empty = buildInsights(snap([]));
    expect(empty).toHaveLength(12);
    for (const i of empty) expect(Number.isFinite(i.headline.value)).toBe(true);
  });

  it('works on the sample board, where every share stat adds up', () => {
    const s = sampleSnapshot(new Date(AT));
    expect(s.streams).toHaveLength(500);
    const all = buildInsights(s);
    const total = s.streams.reduce((a, x) => a + x.viewers, 0);
    for (const k of ['watching', 'languages', 'bigten', 'talk']) {
      const i = all.find((x) => x.key === k)!;
      expect(i.rows.reduce((a, r) => a + r.value, 0)).toBe(total);
    }
  });
});

describe('formatting', () => {
  it('compacts numbers the way a broadcast graphic would', () => {
    expect(compact(950)).toBe('950');
    expect(compact(1_234)).toBe('1.2k');
    expect(compact(48_200)).toBe('48k');
    expect(compact(2_340_000)).toBe('2.3M');
  });
  it('formats percent and hours', () => {
    expect(formatValue(4.25, 'percent')).toBe('4.3%');
    expect(formatValue(42.4, 'percent')).toBe('42%');
    expect(formatValue(0.5, 'hours')).toBe('30m');
    expect(formatValue(14.2, 'hours')).toBe('14h');
  });
  it('takes the median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('pulseInsight', () => {
  it('reports the change since the board opened', () => {
    const p = pulseInsight([
      { at: '2026-11-11T12:00:00.000Z', viewers: 1_000_000 },
      { at: '2026-11-11T12:01:00.000Z', viewers: 1_050_000 },
    ]);
    expect(p.headline.value).toBe(1_050_000);
    expect(p.headline.label).toMatch(/^\+50k since/);
  });
});
