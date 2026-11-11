'use client';

import type { ViewProps } from 'morphgrid';
import type { CSSProperties } from 'react';
import { compact, formatValue, unitLabel } from '@/lib/insights';
import type { Insight, Row } from '@/lib/types';

export type View = 'tally' | 'rundown' | 'bars' | 'strip' | 'dial' | 'wall' | 'ticker';
type P = ViewProps<Insight, View>;

// The frame's title bar and padding take part of the cell; views size themselves to what is left.
const HEAD = 56;
const PAD = 14;
function inner(p: P) {
  const inGrid = !p.cell.id.startsWith('itemview-');
  return { w: Math.max(0, p.width - PAD * 2), h: Math.max(0, p.height - (inGrid && p.view !== 'ticker' ? HEAD : 0) - PAD) };
}

export const VIEW_LABELS: Record<View, string> = {
  tally: 'Tally',
  rundown: 'Rundown',
  bars: 'Levels',
  strip: 'Split',
  dial: 'Dial',
  wall: 'Wall',
  ticker: 'Ticker',
};

// Series colours, in order. Defined in globals.css so light and dark themes can each tune them.
const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
export const seriesColor = (i: number) => `var(${SERIES[i % SERIES.length]})`;

function hashColor(label: string) {
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) | 0;
  return seriesColor(Math.abs(h));
}

const rowValue = (item: Insight, r: Row) => formatValue(r.value, item.unit === 'avg' ? 'viewers' : item.unit);
const total = (rows: Row[]) => rows.reduce((a, r) => a + r.value, 0);

function Empty({ text = 'Nothing live here yet' }: { text?: string }) {
  return <div className="v-empty">{text}</div>;
}

function Thumb({ row, wide }: { row: Row; wide?: boolean }) {
  if (row.image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={wide ? 'v-thumb wide' : 'v-thumb'} src={row.image} alt="" loading="lazy" />;
  return (
    <span className={wide ? 'v-thumb wide v-mono' : 'v-thumb v-mono'} style={{ background: hashColor(row.label) }} aria-hidden>
      {row.label.slice(0, 1).toUpperCase()}
    </span>
  );
}

// A channel's profile picture, or its initial on a colour when there's none (sample data, or Twitch didn't send one).
export function Avatar({ row, size = 30 }: { row: Row; size?: number }) {
  if (row.avatar)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="v-avatar" src={row.avatar} alt="" width={size} height={size} loading="lazy" />;
  return (
    <span className="v-avatar v-mono" style={{ width: size, height: size, background: hashColor(row.label), fontSize: size * 0.42 }} aria-hidden>
      {row.label.slice(0, 1).toUpperCase()}
    </span>
  );
}

// A whole row that opens the channel on Twitch, or a plain row when there's nowhere to go.
function RowLink({ row, className, children, style }: { row: Row; className: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return row.href ? (
    <a href={row.href} target="_blank" rel="noreferrer" className={`${className} is-link`} style={style} aria-label={`${row.label} on Twitch`}>
      {children}
    </a>
  ) : (
    <div className={className} style={style}>
      {children}
    </div>
  );
}

// One large number, like a studio tally light.
export function Tally(p: P) {
  const { item } = p;
  const { w, h } = inner(p);
  const head = item.headline;
  const text = formatValue(head.value, head.unit);
  // Monospace digits are about 0.62em wide, so the number fills the width without a measuring pass.
  const size = Math.max(26, Math.min((h - 40) * 0.9, w / (text.length * 0.62), 150));
  return (
    <div className="v-tally">
      <div className="v-tally-num" style={{ fontSize: size }}>{text}</div>
      <p className="v-tally-label">{head.label}</p>
    </div>
  );
}

// A ranked list, numbered like a show rundown.
export function Rundown(p: P) {
  const { item, shape } = p;
  const height = inner(p).h;
  const per = 42;
  const fit = Math.max(1, Math.floor((height - 8) / per));
  const rows = item.rows.slice(0, fit);
  if (!rows.length) return <Empty />;
  const whole = total(item.rows);
  return (
    <ol className="v-rundown" data-shape={shape}>
      {rows.map((r, i) => (
        <li key={r.id}>
          <RowLink row={r} className="v-rundown-row">
            <span className="v-rank">{String(i + 1).padStart(2, '0')}</span>
            {r.kind === 'channel' ? <Avatar row={r} /> : <Thumb row={r} />}
            <span className="v-rundown-text">
              <span className="v-rundown-label">{r.label}</span>
              {r.sub && <span className="v-sub">{r.sub}</span>}
            </span>
            <span className="v-rundown-val">{item.share ? formatValue((r.value / whole) * 100, 'percent') : rowValue(item, r)}</span>
            {r.href && <span className="v-go" aria-hidden>↗</span>}
          </RowLink>
        </li>
      ))}
    </ol>
  );
}

// Audio-meter style levels: horizontal in tall or square cells, vertical columns in wide ones.
export function Bars(p: P) {
  const { item, shape } = p;
  const { w: width, h: height } = inner(p);
  const vertical = shape === 'wide' && (item.clock || item.rows.length > 6);
  const fit = vertical ? Math.max(3, Math.floor(width / 18)) : Math.max(2, Math.floor((height - 4) / 30));
  const rows = item.rows.slice(0, item.clock ? 24 : fit);
  if (!rows.length) return <Empty />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (vertical) {
    const step = rows.length > 12 ? Math.ceil(rows.length / 8) : 1;
    return (
      <div className="v-cols" role="img" aria-label={`${item.title}: ${rows.map((r) => `${r.label} ${rowValue(item, r)}`).join(', ')}`}>
        {rows.map((r, i) => (
          <div key={r.id} className="v-col">
            <div className="v-col-bar" style={{ '--h': `${(r.value / max) * 100}%` } as CSSProperties}>
              <i />
            </div>
            <span className="v-col-label">{i % step === 0 ? shortLabel(r.label) : ''}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <ul className="v-bars">
      {rows.map((r, i) => (
        <li key={r.id}>
          <span className="v-bars-label">{r.label}</span>
          <span className="v-bars-track">
            <i style={{ width: `${(r.value / max) * 100}%`, background: i === 0 ? 'var(--on-air)' : undefined }} />
          </span>
          <span className="v-bars-val">{rowValue(item, r)}</span>
        </li>
      ))}
    </ul>
  );
}

const shortLabel = (s: string) => (s.length > 6 ? s.slice(0, 5) + '…' : s);

// One band split into shares, with a legend.
export function Strip(p: P) {
  const { item, shape } = p;
  const height = inner(p).h;
  const legendRows = Math.max(1, Math.floor((height - 64) / 24));
  let rows = item.rows.filter((r) => r.value > 0);
  if (!item.share) rows = rows.slice(0, 6);
  if (!rows.length) return <Empty />;
  const whole = total(rows);
  return (
    <div className="v-strip" data-shape={shape}>
      <div className="v-strip-band" role="img" aria-label={rows.map((r) => `${r.label} ${Math.round((r.value / whole) * 100)}%`).join(', ')}>
        {rows.map((r, i) => (
          <i key={r.id} style={{ flexGrow: r.value, background: seriesColor(i) }} title={r.label} />
        ))}
      </div>
      {!item.share && <p className="v-note">Share of the top {rows.length}</p>}
      <ul className="v-legend">
        {rows.slice(0, legendRows * (shape === 'wide' ? 2 : 1)).map((r, i) => (
          <li key={r.id}>
            <b style={{ background: seriesColor(i) }} />
            <span>{r.label}</span>
            <em>{formatValue((r.value / whole) * 100, 'percent')}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A 24-hour dial when the stat has a time of day; otherwise radial levels around the headline.
export function Dial(p: P) {
  const { item } = p;
  const { w: width, h: height } = inner(p);
  const size = Math.max(80, Math.min(width, height) - 8);
  const values = item.clock ?? item.rows.slice(0, 12).map((r) => r.value);
  if (!values.length || values.every((v) => v === 0)) return <Empty />;
  const max = Math.max(...values, 1);
  const c = size / 2;
  const rIn = size * 0.24;
  const outer = size * 0.48;
  const n = values.length;
  const seg = (Math.PI * 2) / n;
  const peak = values.indexOf(max);
  const labels = item.clock ? [0, 6, 12, 18] : [];
  return (
    <div className="v-dial">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={item.sentence}>
        <circle cx={c} cy={c} r={outer} className="v-dial-ring" />
        <circle cx={c} cy={c} r={rIn} className="v-dial-ring" />
        {values.map((v, i) => {
          const a0 = i * seg - Math.PI / 2 + seg * 0.12;
          const a1 = (i + 1) * seg - Math.PI / 2 - seg * 0.12;
          const r = rIn + (outer - rIn) * (v / max);
          const p = (a: number, rad: number) => `${c + Math.cos(a) * rad},${c + Math.sin(a) * rad}`;
          const d = `M${p(a0, rIn)} L${p(a0, r)} A${r},${r} 0 0 1 ${p(a1, r)} L${p(a1, rIn)} A${rIn},${rIn} 0 0 0 ${p(a0, rIn)}Z`;
          return <path key={i} d={d} fill={i === peak ? 'var(--on-air)' : 'var(--meter)'} opacity={i === peak ? 1 : 0.35 + 0.65 * (v / max)} />;
        })}
        {labels.map((h) => {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
          return (
            <text key={h} x={c + Math.cos(a) * (outer + 0)} y={c + Math.sin(a) * (outer + 0)} className="v-dial-hour" dy="0.35em">
              {String(h).padStart(2, '0')}
            </text>
          );
        })}
        <text x={c} y={c} className="v-dial-center" dy="0.35em" style={{ fontSize: Math.max(12, rIn * 0.62) }}>
          {formatValue(item.headline.value, item.headline.unit)}
        </text>
      </svg>
      {!item.clock && <p className="v-note">Top {Math.min(12, item.rows.length)}, clockwise from the top</p>}
    </div>
  );
}

// A video wall: tiles sized by value, with art when the rows have it.
export function Wall(p: P) {
  const { item } = p;
  const { w: width, h: height } = inner(p);
  // Tiles are at least 120×64; fit as many whole tiles as the cell holds, so none is cut off at the bottom.
  const perRow = Math.max(1, Math.floor((width + 4) / 124));
  const lines = Math.max(1, Math.floor((height + 4) / 68));
  const fit = Math.max(1, Math.min(16, perRow * Math.min(lines, 3)));
  const rows = item.rows.filter((r) => r.value > 0).slice(0, fit);
  if (!rows.length) return <Empty />;
  const max = rows[0].value || 1;
  return (
    <div className="v-wall">
      {rows.map((r, i) => {
        const grow = Math.max(0.6, Math.sqrt(r.value / max) * 3);
        return (
          <RowLink key={r.id} row={r} className="v-wall-tile" style={{ flexGrow: grow }}>
            {r.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.image} alt="" loading="lazy" />
            ) : (
              <span className="v-wall-fill" style={{ background: seriesColor(i) }} />
            )}
            <span className="v-wall-cap">
              {r.kind === 'channel' && <Avatar row={r} size={22} />}
              <b>{r.label}</b>
              <em>{rowValue(item, r)}</em>
            </span>
            {i === 0 && <span className="v-live">LIVE</span>}
          </RowLink>
        );
      })}
    </div>
  );
}

// A news-style crawl along the bottom of the screen.
export function Ticker({ item }: P) {
  const rows = item.rows.slice(0, 15);
  const parts = rows.length
    ? rows.map((r) => (
        <span key={r.id} className="v-ticker-item">
          <b>{r.label}</b> {item.share ? formatValue((r.value / total(item.rows)) * 100, 'percent') : rowValue(item, r)}
        </span>
      ))
    : [<span key="s" className="v-ticker-item">{item.sentence}</span>];
  return (
    <div className="v-ticker">
      <span className="v-ticker-head">
        {formatValue(item.headline.value, item.headline.unit)} <small>{item.headline.label}</small>
      </span>
      <div className="v-ticker-crawl" aria-label={item.sentence}>
        <div className="v-ticker-track">
          {parts}
          <span aria-hidden className="v-ticker-dup">{parts}</span>
        </div>
      </div>
    </div>
  );
}

export const VIEWS = { tally: Tally, rundown: Rundown, bars: Bars, strip: Strip, dial: Dial, wall: Wall, ticker: Ticker };

export { compact, unitLabel };
