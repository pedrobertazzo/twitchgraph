import 'server-only';
import { KEYS } from './refresher';
import { getMany } from './store';
import { hasKeys } from './twitch';
import { sampleExtras } from './sample';
import type { Census, Clip, Extras, HistoryPoint } from './types';

// What the background refresher has collected, for pages. Empty until its first run (or without a store).
export async function getExtras(): Promise<Extras> {
  if (!hasKeys()) return sampleExtras(new Date());
  const [census, history, clips] = await getMany<unknown>([KEYS.census, KEYS.history, KEYS.clips]);
  return {
    census: (census as Census | null) ?? null,
    history: (history as HistoryPoint[] | null) ?? [],
    clips: (clips as { clips: Clip[] } | null)?.clips ?? [],
  };
}
