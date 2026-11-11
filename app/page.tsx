import { Board } from '@/components/Board';
import { getSnapshot } from '@/lib/twitch';

export const dynamic = 'force-dynamic';

export default async function Page() {
  let snap;
  try {
    snap = await getSnapshot();
  } catch {
    return (
      <main className="page">
        <Masthead />
        <p className="offline">Twitch isn’t answering right now. The board will be back in a minute.</p>
      </main>
    );
  }
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
