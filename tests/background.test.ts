import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extraInsights } from '@/lib/insights';
import { addPoint } from '@/lib/refresher';
import { sampleExtras, sampleSnapshot } from '@/lib/sample';
import { languageChains, takeCensus } from '@/lib/twitch';
import type { Census, HistoryPoint } from '@/lib/types';

const NOW = Date.UTC(2026, 10, 12, 20, 0);

describe('languageChains', () => {
  it('puts every language in exactly one chain, big languages on their own', () => {
    const chains = languageChains();
    const all = chains.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain('other');
    expect(chains[0]).toEqual(['en']);
    expect(chains.every((c) => c.length <= 100)).toBe(true); // Helix takes up to 100 language filters a call
  });
});

describe('takeCensus', () => {
  beforeEach(() => {
    process.env.TWITCH_CLIENT_ID = 'id';
    process.env.TWITCH_CLIENT_SECRET = 'secret';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
  });

  it('reads every chain to the end, counts a channel seen twice once, and sorts them into bands', async () => {
    const stream = (id: string, viewers: number, language: string) => ({ id, user_id: id, user_login: id, user_name: id, game_id: '1', game_name: 'Chess', title: '', viewer_count: viewers, started_at: '', language, thumbnail_url: '', tags: [], is_mature: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('oauth2/token')) return Response.json({ access_token: 't', expires_in: 3600 });
        const u = new URL(url);
        const langs = u.searchParams.getAll('language');
        const after = u.searchParams.get('after');
        if (langs[0] === 'en' && !after) return Response.json({ data: [stream('a', 20_000, 'en'), stream('b', 3, 'en')], pagination: { cursor: 'p2' } });
        if (langs[0] === 'en' && after === 'p2') return Response.json({ data: [stream('b', 3, 'en'), stream('c', 0, 'en')], pagination: {} }); // b again
        if (langs[0] === 'es') return Response.json({ data: [stream('d', 50, 'es')], pagination: {} });
        return Response.json({ data: [], pagination: {} });
      }),
    );
    const c = await takeCensus();
    expect(c.channels).toBe(4);
    expect(c.viewers).toBe(20_053);
    expect(Object.fromEntries(c.bands.map((b) => [b.label, b.channels]))).toMatchObject({ 'No viewers': 1, '1 to 5': 1, '21 to 100': 1, '10k+': 1 });
    expect(c.languages.map((l) => l.code)).toEqual(['en', 'es']);
  });
});

describe('addPoint', () => {
  it('keeps two days of history', () => {
    const census = { viewers: 100, channels: 10, categories: [{ id: '1', name: 'Chess', viewers: 60, channels: 4 }] } as Census;
    const old: HistoryPoint[] = [
      { t: NOW - 49 * 3_600_000, viewers: 1, channels: 1, cats: {} },
      { t: NOW - 3_600_000, viewers: 2, channels: 1, cats: {} },
    ];
    const h = addPoint(old, census, NOW);
    expect(h.map((p) => p.t)).toEqual([NOW - 3_600_000, NOW]);
    expect(h[1]).toMatchObject({ viewers: 100, cats: { '1': 60 }, names: { '1': 'Chess' } });
  });
});

describe('extraInsights', () => {
  it('builds every background story from a collection', () => {
    const now = new Date(NOW);
    const snap = sampleSnapshot(now);
    const keys = extraInsights({ ...snap, sample: false }, sampleExtras(now)).map((i) => i.key);
    expect(keys).toEqual(['everyone', 'longtail', 'allcategories', 'trend', 'hours', 'rising', 'clips', 'partners', 'newfaces']);
  });

  it('leaves out what has not been collected yet', () => {
    const snap = sampleSnapshot(new Date(NOW));
    const keys = extraInsights(snap, { census: null, history: [], clips: [] }).map((i) => i.key);
    expect(keys).toEqual(['partners', 'newfaces']); // from channel profiles, not the background collection
  });

  it('shows partner shares that add up, and categories rising against an hour ago', () => {
    const now = new Date(NOW);
    const snap = { ...sampleSnapshot(now), sample: false };
    const history: HistoryPoint[] = [
      { t: NOW - 60 * 60_000, viewers: 1000, channels: 10, cats: { a: 10_000, b: 10_000 }, names: { a: 'Chess', b: 'Rust' } },
      { t: NOW, viewers: 1200, channels: 12, cats: { a: 15_000, b: 8_000 }, names: { a: 'Chess', b: 'Rust' } },
    ];
    const ins = Object.fromEntries(extraInsights(snap, { census: null, history, clips: [] }).map((i) => [i.key, i]));
    expect(ins.rising.rows.map((r) => [r.label, Math.round(r.value)])).toEqual([['Chess', 50]]);
    expect(ins.rising.sentence).toContain('Rust is falling most, down 20%');
    const p = ins.partners.rows.reduce((a, r) => a + r.value, 0);
    expect(p).toBe(snap.streams.reduce((a, s) => a + s.viewers, 0));
  });

  it('never links made-up sample clips', () => {
    const now = new Date(NOW);
    const clips = extraInsights(sampleSnapshot(now), sampleExtras(now)).find((i) => i.key === 'clips')!;
    expect(clips.rows.every((r) => r.href === undefined)).toBe(true);
  });
});
