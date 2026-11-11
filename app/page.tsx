import { Board } from '@/components/Board';
import { getSnapshot } from '@/lib/twitch';

// Rebuilt at most once a minute and shared by every visitor; open boards then update themselves from /api/snapshot.
export const revalidate = 60;

export default async function Page() {
  // A failure throws: the last good board keeps being served, or error.tsx shows on a cold start.
  const snap = await getSnapshot();
  return (
    <main className="page">
      <Masthead />
      <Board initial={snap} />
      <footer className="foot">
        <p>
          Counts come from the {snap.streams.length} biggest live channels on Twitch, read once a minute. Smaller channels aren’t counted,
          so totals are lower than everyone on Twitch.
        </p>
        <p>
          Drag a panel onto another to swap them, and each redraws for its new spot. Built on{' '}
          <a href="https://pedrobertazzo.github.io/morphgrid/">morphgrid</a>. Not affiliated with Twitch.
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
          On Air <span>live Twitch, right now</span>
        </h1>
      </div>
    </header>
  );
}
