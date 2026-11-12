import { Board } from '@/components/Board';
import { getExtras } from '@/lib/extras';
import { getSnapshot } from '@/lib/twitch';

// Rebuilt at most once a minute and shared by every visitor; open boards then update themselves from /api/snapshot.
export const revalidate = 60;

export default async function Page() {
  // A failure throws: the last good board keeps being served, or error.tsx shows on a cold start.
  const [live, extras] = await Promise.all([getSnapshot(), getExtras()]);
  const snap = { ...live, extras };
  return (
    <main className="page">
      <Masthead />
      <Board initial={snap} />
      <footer className="foot">
        <p>
          The live board reads the {snap.streams.length} biggest channels once a minute. Every 15 minutes the server also counts
          everyone live, small channels included, for All of Twitch, the long tail and the last 24 hours; that count is approximate,
          because the list reorders while it’s read.
        </p>
        <p>
          Drag a panel onto another to swap them, and each redraws for its new spot. Built on{' '}
          <a href="https://pedrobertazzo.github.io/morphgrid/">morphgrid</a>. On Air is a fan-made stats site, not affiliated with or endorsed by Twitch. Twitch is a trademark of Twitch Interactive, Inc.
        </p>
      </footer>
    </main>
  );
}

function Masthead() {
  return (
    <header className="mast">
      <div className="mast-brand">
        <span className="mast-mark" aria-hidden>
          <i />
        </span>
        <h1>
          On Air <b>for Twitch</b> <span>what Twitch is watching, live</span>
        </h1>
      </div>
    </header>
  );
}
