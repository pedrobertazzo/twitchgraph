'use client';

import { MorphGrid, ItemView, type Assignment, type CellDef, type ChromeProps, type GridLayout } from 'morphgrid';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildInsights, compact, extraInsights, pulseInsight } from '@/lib/insights';
import type { Insight, Snapshot } from '@/lib/types';
import { VIEWS, VIEW_LABELS, type View } from './views';

const REFRESH_MS = 60_000;

const CELLS: CellDef<View>[] = [
  { id: 'crawl', view: 'ticker', area: 'crawl', name: 'the ticker' },
  { id: 'wall', view: 'wall', area: 'wall', name: 'the wall' },
  { id: 'main', view: 'tally', area: 'main', name: 'the main tally' },
  { id: 'side', view: 'tally', area: 'side', name: 'the side tally' },
  { id: 'run', view: 'rundown', area: 'run', name: 'the rundown' },
  { id: 'levels', view: 'bars', area: 'levels', name: 'the levels' },
  { id: 'dial', view: 'dial', area: 'dial', name: 'the dial' },
  { id: 'split', view: 'strip', area: 'split', name: 'the split' },
  { id: 'run2', view: 'rundown', area: 'run2', name: 'the second rundown' },
  { id: 'small1', view: 'tally', area: 'small1', name: 'the small tally' },
  { id: 'small2', view: 'strip', area: 'small2', name: 'the small split' },
  { id: 'trend', view: 'bars', area: 'trend', name: 'the trend' },
  { id: 'clips', view: 'wall', area: 'clips', name: 'the clips' },
  { id: 'census', view: 'tally', area: 'census', name: 'the census' },
  { id: 'tail', view: 'strip', area: 'tail', name: 'the long tail' },
];

const START: Assignment = {
  crawl: 'categories',
  wall: 'channels',
  main: 'watching',
  side: 'pulse',
  run: 'categories-list',
  levels: 'golive',
  dial: 'uptime',
  split: 'languages',
  run2: 'marathons',
  small1: 'bigten',
  small2: 'talk',
  trend: 'trend',
  clips: 'clips',
  census: 'everyone',
  tail: 'longtail',
};

const LAYOUT: GridLayout = {
  columns: '1.25fr 1.25fr 1fr 1fr',
  rows: '58px 170px 170px 170px 250px 230px 250px 330px',
  gap: 10,
  templateAreas: [
    'crawl crawl crawl crawl',
    'wall  wall  main  side',
    'wall  wall  run   run',
    'wall  wall  run   run',
    'levels levels dial split',
    'run2  small1 small1 small2',
    'trend trend census tail',
    'clips clips clips clips',
  ],
  breakpoints: [
    {
      maxWidth: 980,
      columns: '1fr 1fr',
      rows: '58px 400px 150px 340px 230px 260px 200px 340px 250px 160px 230px 420px',
      templateAreas: ['crawl crawl', 'wall wall', 'main side', 'run run', 'levels levels', 'dial split', 'small1 small2', 'run2 run2', 'trend trend', 'census census', 'tail tail', 'clips clips'],
    },
    {
      maxWidth: 560,
      columns: '1fr',
      rows: '58px 420px 150px 150px 340px 230px 280px 230px 150px 220px 340px 250px 150px 230px 470px',
      templateAreas: ['crawl', 'wall', 'main', 'side', 'run', 'levels', 'dial', 'split', 'small1', 'small2', 'run2', 'trend', 'census', 'tail', 'clips'],
    },
  ],
};

function Frame(p: ChromeProps<Insight, View>) {
  const it = p.item;
  return (
    <div className={`fr fr-${p.view}`}>
      {p.view !== 'ticker' && (
        <header className="fr-head">
          <span className="fr-kicker">
            <i className="tally-dot" aria-hidden />
            {it.kicker}
          </span>
          <h2 className="fr-title">{it.title}</h2>
        </header>
      )}
      <div className="fr-body">{p.children}</div>
      <div className="fr-tools" data-mg-nodrag>
        {p.canCycle && (
          <>
            <button data-mg-cycle="prev" aria-label={p.labels.cyclePrev} onClick={() => p.cycle(-1)}>‹</button>
            <button data-mg-cycle="next" aria-label={p.labels.cycleNext} onClick={() => p.cycle(1)}>›</button>
          </>
        )}
        <button onClick={p.open} aria-label={`More about ${it.title}`}>i</button>
      </div>
    </div>
  );
}

function Detail({ item, onClose }: { item: Insight; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="detail" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <header>
        <span className="fr-kicker">
          <i className="tally-dot" aria-hidden />
          {item.kicker}
        </span>
        <h2>{item.title}</h2>
        <p>{item.sentence}</p>
        <button className="detail-close" onClick={() => ref.current?.close()} aria-label="Close">×</button>
      </header>
      <div className="detail-views">
        {(['tally', 'bars', 'strip', 'dial', 'rundown', 'wall'] as View[]).map((v) => (
          <figure key={v}>
            <figcaption>{VIEW_LABELS[v]}</figcaption>
            <ItemView item={item} itemId={item.key} view={v} views={VIEWS} style={{ height: v === 'rundown' || v === 'wall' ? 300 : 200 }} />
          </figure>
        ))}
      </div>
    </dialog>
  );
}

export function Board({ initial }: { initial: Snapshot }) {
  const [snap, setSnap] = useState(initial);
  const [history, setHistory] = useState<{ at: string; viewers: number }[]>([]);
  const [assignment, setAssignment] = useState<Assignment>(START);
  const [open, setOpen] = useState<Insight | null>(null);
  const [status, setStatus] = useState<'live' | 'stale'>('live');

  const viewers = useMemo(() => snap.streams.reduce((a, s) => a + s.viewers, 0), [snap]);

  useEffect(() => {
    setHistory((h) => (h.length && h[h.length - 1].at === snap.at ? h : [...h, { at: snap.at, viewers }].slice(-120)));
  }, [snap, viewers]);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/snapshot', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as Snapshot;
        if (!stop) {
          setSnap(next);
          setStatus('live');
        }
      } catch {
        if (!stop) setStatus('stale');
      }
    };
    const id = setInterval(tick, REFRESH_MS);
    const onVisible = () => !document.hidden && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const items = useMemo(() => {
    const list = buildInsights(snap);
    const cats = list.find((i) => i.key === 'categories')!;
    // The categories also appear as a rundown, under their own id, so the ticker and the list can both show them.
    const catList: Insight = { ...cats, key: 'categories-list', title: 'Category rundown' };
    const pulse = history.length ? pulseInsight(history) : { ...pulseInsight([]), headline: { value: viewers, unit: 'viewers' as const, label: 'watching now; updates every minute' } };
    return [...list.slice(0, 2), catList, pulse, ...list.slice(2), ...extraInsights(snap, snap.extras)];
  }, [snap, history, viewers]);

  const at = new Date(snap.at);

  return (
    <>
      <div className="statusbar" role="status">
        <span className={`onair ${status}`}>
          <i aria-hidden /> {status === 'live' ? 'On air' : 'Reconnecting'}
        </span>
        <span>
          <b>{compact(viewers)}</b> watching the top {snap.streams.length}
        </span>
        <span suppressHydrationWarning>
          Updated <time dateTime={snap.at}>{at.toISOString().slice(11, 16)} UTC</time>
        </span>
        {snap.sample && <span className="sample-flag">Sample data: add Twitch keys to go live</span>}
      </div>
      <MorphGrid<Insight, View>
        className="board"
        cells={CELLS}
        items={items}
        getItemId={(i) => i.key}
        getItemLabel={(i) => i.title}
        views={VIEWS}
        viewLabels={VIEW_LABELS}
        layout={LAYOUT}
        chrome={Frame}
        value={assignment}
        onChange={setAssignment}
        onOpen={(item) => setOpen(item)}
        labels={{ cycle: 'switch feed', cyclePrev: 'Previous feed', cycleNext: 'Next feed' }}
      />
      {open && <Detail item={items.find((i) => i.key === open.key) ?? open} onClose={() => setOpen(null)} />}
    </>
  );
}
