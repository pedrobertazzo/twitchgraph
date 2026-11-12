import 'server-only';
import { tick } from './refresher';

const EVERY_MS = 15 * 60_000;

// For a long-running server (`next start` on your own machine or a VPS): count everyone as soon as the server starts,
// then every 15 minutes. On Vercel, QStash calls /api/refresh instead.
export function startRefreshLoop() {
  const run = () =>
    tick()
      .then((r) => r.stored.length && console.log(`[refresh] ${r.channels} channels, ${r.viewers} viewers in ${Math.round(r.ms / 1000)}s`))
      .catch((err) => console.error('[refresh]', err));
  run();
  setInterval(run, EVERY_MS).unref?.();
}
