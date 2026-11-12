import 'server-only';
import { getMany, put, storeTag, tryLock, unlock } from './store';
import { hasKeys, takeCensus, topClips } from './twitch';
import type { Census, Clip, HistoryPoint } from './types';

// The background half of the board. A schedule (QStash on Vercel, a timer elsewhere) runs this every 15 minutes:
// it counts everyone live, adds a point of history, and refreshes the clips of the day. Pages only read what it
// stored. The live top-500 board is separate and refreshes itself every minute.

export const KEYS = { census: 'census', history: 'history', clips: 'clips' } as const;
const KEEP_MS = 48 * 3_600_000;
const CLIPS_EVERY_MS = 25 * 60_000;
const CATS_IN_HISTORY = 30;

export type Report = { skipped?: string; stored: string[]; channels?: number; viewers?: number; ms: number; error?: string };

export function addPoint(history: HistoryPoint[], census: Census, now: number): HistoryPoint[] {
  const top = census.categories.slice(0, CATS_IN_HISTORY);
  const point: HistoryPoint = {
    t: now,
    viewers: census.viewers,
    channels: census.channels,
    cats: Object.fromEntries(top.map((c) => [c.id, c.viewers])),
    names: Object.fromEntries(top.map((c) => [c.id, c.name])),
  };
  return [...history.filter((p) => now - p.t < KEEP_MS && p.t !== now), point];
}

export async function tick(): Promise<Report> {
  const started = Date.now();
  const report: Report = { stored: [], ms: 0 };
  if (!hasKeys()) return { ...report, skipped: 'no Twitch keys' };
  if (!(await tryLock('refresh', 300))) return { ...report, skipped: 'another run is in progress' };
  try {
    const census = await takeCensus();
    await put(KEYS.census, census);
    report.stored.push(KEYS.census);
    report.channels = census.channels;
    report.viewers = census.viewers;

    const [history, clips] = await getMany<unknown>([KEYS.history, KEYS.clips], { fresh: true });
    await put(KEYS.history, addPoint((history as HistoryPoint[] | null) ?? [], census, Date.now()));
    report.stored.push(KEYS.history);

    const c = clips as { at: number; clips: Clip[] } | null;
    if (!c || Date.now() - c.at > CLIPS_EVERY_MS) {
      await put(KEYS.clips, { at: Date.now(), clips: await topClips(census.categories.slice(0, 8)) });
      report.stored.push(KEYS.clips);
    }
  } catch (err) {
    report.error = (err as Error).message;
    console.error('[refresh]', err);
  } finally {
    await unlock('refresh');
  }
  report.ms = Date.now() - started;
  return report;
}

export { storeTag };
