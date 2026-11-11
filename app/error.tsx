'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page">
      <p className="offline">
        Twitch isn’t answering right now. <button className="retry" onClick={reset}>Try again</button>
      </p>
    </main>
  );
}
