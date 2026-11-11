import type { Insight, Row, Snapshot, Stream, Unit } from './types';

// Categories that are not games. Twitch files them under the same "game" field.
export const NON_GAME = new Set([
  'Just Chatting', 'IRL', 'Music', 'Art', 'ASMR', 'Talk Shows & Podcasts', 'Sports', 'Special Events', 'Travel & Outdoors',
  'Pools, Hot Tubs, and Beaches', 'Makers & Crafting', 'Food & Drink', 'Science & Technology', 'Software and Game Development',
  'Animals, Aquariums, and Zoos', 'Fitness & Health', 'Beauty & Body Art', 'Politics', 'Slots', 'Virtual Casino', 'Co-working & Studying',
]);

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0);

export function hoursLive(s: Stream, at: string) {
  return Math.max(0, (Date.parse(at) - Date.parse(s.startedAt)) / 3_600_000);
}

export function median(xs: number[]) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function boxArt(url: string | undefined, w = 144, h = 192) {
  return url ? url.replace('{width}', String(w)).replace('{height}', String(h)) : undefined;
}
export function thumb(url: string, w = 320, h = 180) {
  return url ? url.replace('{width}', String(w)).replace('{height}', String(h)) : undefined;
}

let languageNames: Intl.DisplayNames | null = null;
export function languageName(code: string) {
  if (code === 'other') return 'Other';
  try {
    languageNames ??= new Intl.DisplayNames(['en'], { type: 'language' });
    return languageNames.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function formatValue(v: number, unit: Unit): string {
  switch (unit) {
    case 'percent':
      return `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;
    case 'hours':
      return v < 1 ? `${Math.round(v * 60)}m` : `${v < 10 ? v.toFixed(1) : Math.round(v)}h`;
    default:
      return compact(v);
  }
}

export function compact(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return String(Math.round(v));
}

const unitWord: Record<Unit, string> = { viewers: 'viewers', channels: 'channels', percent: '', hours: '', avg: 'viewers per channel' };
export const unitLabel = (u: Unit) => unitWord[u];

function groupBy<K extends string>(streams: Stream[], key: (s: Stream) => K) {
  const m = new Map<K, { viewers: number; channels: number; streams: Stream[] }>();
  for (const s of streams) {
    const k = key(s);
    const g = m.get(k) ?? { viewers: 0, channels: 0, streams: [] };
    g.viewers += s.viewers;
    g.channels += 1;
    g.streams.push(s);
    m.set(k, g);
  }
  return [...m.entries()].sort((a, b) => b[1].viewers - a[1].viewers);
}

// Folds everything past the first `n` rows into one "Everything else" row, so share stats still add up to the whole.
function topWithRest(rows: Row[], n: number): Row[] {
  if (rows.length <= n) return rows;
  const rest = sum(rows.slice(n).map((r) => r.value));
  return [...rows.slice(0, n), { id: 'rest', label: 'Everything else', value: rest }];
}



export function buildInsights(snap: Snapshot): Insight[] {
  const { streams, at } = snap;
  // Sample channels are made up, so they get no links.
  const channelUrl = (s: Stream) => (snap.sample ? undefined : `https://www.twitch.tv/${s.login}`);
  const channelRow = (s: Stream, value: number, sub = s.game): Row => ({
    id: s.id,
    label: s.name,
    value,
    sub,
    image: thumb(s.thumb),
    avatar: s.avatar,
    kind: 'channel',
    href: channelUrl(s),
  });
  const total = sum(streams.map((s) => s.viewers));
  const n = streams.length;

  // Categories
  const byGame = groupBy(streams, (s) => s.gameId || s.game);
  const categoryRows: Row[] = byGame.map(([id, g]) => ({
    id,
    label: g.streams[0].game,
    value: g.viewers,
    sub: `${g.channels} ${g.channels === 1 ? 'channel' : 'channels'}`,
    image: boxArt(snap.categories[id]?.art),
    kind: 'category',
  }));
  const top = categoryRows[0];

  // Channels
  const channelRows: Row[] = streams.map((s) => channelRow(s, s.viewers));
  const lead = streams[0];

  // Audience size bands
  const bands: [string, number, number][] = [
    ['100k+', 100_000, Infinity],
    ['10k to 100k', 10_000, 100_000],
    ['1k to 10k', 1_000, 10_000],
    ['Under 1k', 0, 1_000],
  ];
  const bandRows: Row[] = bands.map(([label, lo, hi]) => {
    const inBand = streams.filter((s) => s.viewers >= lo && s.viewers < hi);
    return { id: label, label, value: sum(inBand.map((s) => s.viewers)), sub: `${inBand.length} channels` };
  });

  // Languages
  const byLang = groupBy(streams, (s) => s.language);
  const langRows = topWithRest(
    byLang.map(([code, g]) => ({ id: code, label: languageName(code), value: g.viewers, sub: `${g.channels} channels` })),
    7,
  );
  const topLang = byLang[0];

  // Concentration
  const top10 = sum(streams.slice(0, 10).map((s) => s.viewers));
  const next90 = sum(streams.slice(10, 100).map((s) => s.viewers));
  const restN = total - top10 - next90;

  // Uptime
  const hrs = streams.map((s) => hoursLive(s, at));
  const uptimeBands: [string, number, number][] = [
    ['Under 1h', 0, 1],
    ['1 to 3h', 1, 3],
    ['3 to 6h', 3, 6],
    ['6 to 12h', 6, 12],
    ['12h+', 12, Infinity],
  ];
  const uptimeRows: Row[] = uptimeBands.map(([label, lo, hi]) => ({
    id: label,
    label,
    value: hrs.filter((h) => h >= lo && h < hi).length,
  }));
  const medianHours = median(hrs);

  const marathons = streams
    .map((s, i) => ({ s, h: hrs[i] }))
    .sort((a, b) => b.h - a.h)
    .slice(0, 12)
    .map(({ s, h }) => channelRow(s, h));

  // Talking vs playing
  const talk = streams.filter((s) => NON_GAME.has(s.game));
  const talkViewers = sum(talk.map((s) => s.viewers));
  const talkRows = groupBy(talk, (s) => s.game).map(([name, g]) => ({ id: name, label: name, value: g.viewers }));
  const talkShareRows: Row[] = [
    { id: 'games', label: 'Playing games', value: total - talkViewers, sub: `${n - talk.length} channels` },
    ...topWithRest(talkRows, 3),
  ];

  // Tags
  const tagMap = new Map<string, { viewers: number; channels: number }>();
  for (const s of streams)
    for (const t of s.tags) {
      const g = tagMap.get(t) ?? { viewers: 0, channels: 0 };
      g.viewers += s.viewers;
      g.channels += 1;
      tagMap.set(t, g);
    }
  const tagRows: Row[] = [...tagMap.entries()]
    .sort((a, b) => b[1].viewers - a[1].viewers)
    .slice(0, 12)
    .map(([t, g]) => ({ id: t, label: t, value: g.viewers, sub: `${g.channels} channels` }));

  // Go-live hour, in UTC
  const clock = new Array(24).fill(0);
  for (const s of streams) clock[new Date(s.startedAt).getUTCHours()] += 1;
  const busiestHour = clock.indexOf(Math.max(...clock));
  const hourRows: Row[] = clock.map((c, h) => ({ id: `h${h}`, label: `${String(h).padStart(2, '0')}:00`, value: c }));

  // Viewers per channel, per category: where an audience is shared by few channels
  const roomy = byGame
    .filter(([, g]) => g.channels >= 3)
    .map(([id, g]): Row => ({ id, label: g.streams[0].game, value: g.viewers / g.channels, sub: `${g.channels} channels`, image: boxArt(snap.categories[id]?.art), kind: 'category' }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Fresh starts: channels live under half an hour
  const fresh = streams.filter((_, i) => hrs[i] < 0.5);
  const freshRows: Row[] = fresh.slice(0, 12).map((s) => channelRow(s, s.viewers));

  const fmt = (v: number) => compact(v);

  return [
    {
      key: 'watching',
      title: 'Watching right now',
      kicker: 'Audience',
      unit: 'viewers',
      headline: { value: total, unit: 'viewers', label: `across the ${n} biggest channels` },
      rows: bandRows,
      share: true,
      sentence: `${fmt(total)} people are watching the ${n} biggest live channels. ${Math.round(pct(bandRows[0].value + bandRows[1].value, total))}% of them are in channels with 10k or more viewers.`,
    },
    {
      key: 'categories',
      title: 'Top categories',
      kicker: 'Categories',
      unit: 'viewers',
      headline: { value: top?.value ?? 0, unit: 'viewers', label: top ? `in ${top.label}` : 'no category yet' },
      rows: categoryRows.slice(0, 15),
      sentence: top
        ? `${top.label} leads with ${fmt(top.value)} viewers, ${Math.round(pct(top.value, total))}% of everyone watching. ${categoryRows[1] ? `${categoryRows[1].label} is next with ${fmt(categoryRows[1].value)}.` : ''}`
        : 'No one is live.',
    },
    {
      key: 'channels',
      title: 'Biggest channels',
      kicker: 'Channels',
      unit: 'viewers',
      headline: { value: lead?.viewers ?? 0, unit: 'viewers', label: lead ? `watching ${lead.name}` : '' },
      rows: channelRows.slice(0, 15),
      sentence: lead ? `${lead.name} has the biggest audience right now: ${fmt(lead.viewers)} people, in ${lead.game}.` : 'No one is live.',
    },
    {
      key: 'languages',
      title: 'Languages',
      kicker: 'Audience',
      unit: 'viewers',
      headline: { value: pct(topLang?.[1].viewers ?? 0, total), unit: 'percent', label: `watch in ${languageName(topLang?.[0] ?? 'en')}` },
      rows: langRows,
      share: true,
      sentence: `${Math.round(pct(topLang?.[1].viewers ?? 0, total))}% of viewers are watching in ${languageName(topLang?.[0] ?? 'en')}. ${byLang[1] ? `${languageName(byLang[1][0])} is second at ${Math.round(pct(byLang[1][1].viewers, total))}%.` : ''}`,
    },
    {
      key: 'bigten',
      title: 'The big ten',
      kicker: 'Concentration',
      unit: 'viewers',
      headline: { value: pct(top10, total), unit: 'percent', label: 'of viewers are in just 10 channels' },
      rows: [
        { id: 'top10', label: 'Top 10 channels', value: top10 },
        { id: 'next90', label: 'Next 90', value: next90 },
        { id: 'rest', label: `The other ${Math.max(0, n - 100)}`, value: restN },
      ],
      share: true,
      sentence: `The ten biggest channels hold ${Math.round(pct(top10, total))}% of the audience. The next 90 hold ${Math.round(pct(next90, total))}%.`,
    },
    {
      key: 'uptime',
      title: 'How long they’ve been live',
      kicker: 'Uptime',
      unit: 'channels',
      headline: { value: medianHours, unit: 'hours', label: 'median time on air' },
      rows: uptimeRows,
      share: true,
      sentence: `Half of the biggest channels have been live for more than ${formatValue(medianHours, 'hours')}. ${uptimeRows[4].value} have been on for 12 hours or longer.`,
    },
    {
      key: 'marathons',
      title: 'Marathons',
      kicker: 'Uptime',
      unit: 'hours',
      headline: { value: marathons[0]?.value ?? 0, unit: 'hours', label: marathons[0] ? `${marathons[0].label}, still going` : '' },
      rows: marathons,
      sentence: marathons[0] ? `${marathons[0].label} has been live for ${formatValue(marathons[0].value, 'hours')}, the longest run among the biggest channels.` : '',
    },
    {
      key: 'talk',
      title: 'Talking vs playing',
      kicker: 'Categories',
      unit: 'viewers',
      headline: { value: pct(talkViewers, total), unit: 'percent', label: 'are watching something that isn’t a game' },
      rows: talkShareRows,
      share: true,
      sentence: `${Math.round(pct(talkViewers, total))}% of viewers are in non-game categories like Just Chatting, Music and Sports.`,
    },
    {
      key: 'tags',
      title: 'Top tags',
      kicker: 'Tags',
      unit: 'viewers',
      headline: { value: tagRows[0]?.value ?? 0, unit: 'viewers', label: tagRows[0] ? `in channels tagged ${tagRows[0].label}` : 'no tags yet' },
      rows: tagRows,
      sentence: tagRows[0] ? `${tagRows[0].label} is the tag with the biggest audience, then ${tagRows.slice(1, 3).map((t) => t.label).join(' and ')}.` : '',
    },
    {
      key: 'golive',
      title: 'When they went live',
      kicker: 'Time of day, UTC',
      unit: 'channels',
      headline: { value: clock[busiestHour], unit: 'channels', label: `went live at ${String(busiestHour).padStart(2, '0')}:00 UTC, the busiest hour` },
      rows: hourRows,
      clock,
      sentence: `Most of today’s biggest channels went live around ${String(busiestHour).padStart(2, '0')}:00 UTC.`,
    },
    {
      key: 'roomy',
      title: 'Most viewers per channel',
      kicker: 'Categories',
      unit: 'avg',
      headline: { value: roomy[0]?.value ?? 0, unit: 'avg', label: roomy[0] ? `per channel in ${roomy[0].label}` : '' },
      rows: roomy,
      sentence: roomy[0] ? `In ${roomy[0].label}, each channel averages ${fmt(roomy[0].value)} viewers, the most of any category with three or more channels.` : '',
    },
    {
      key: 'fresh',
      title: 'Just went live',
      kicker: 'Channels',
      unit: 'viewers',
      headline: { value: fresh.length, unit: 'channels', label: 'went live in the last 30 minutes' },
      rows: freshRows,
      sentence: fresh[0] ? `${fresh.length} big channels started in the last half hour. ${fresh[0].name} is the biggest, with ${fmt(fresh[0].viewers)} viewers.` : 'No big channel has started in the last half hour.',
    },
  ];
}

// The board's own history: total viewers at each refresh since the page opened.
export function pulseInsight(history: { at: string; viewers: number }[]): Insight {
  const last = history[history.length - 1];
  const first = history[0];
  const change = last && first ? last.viewers - first.viewers : 0;
  const rows: Row[] = history.map((h) => ({
    id: h.at,
    label: new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    value: h.viewers,
  }));
  return {
    key: 'pulse',
    title: 'Since you opened this',
    kicker: 'Live pulse',
    unit: 'viewers',
    headline: { value: last?.viewers ?? 0, unit: 'viewers', label: history.length > 1 ? `${change >= 0 ? '+' : '−'}${compact(Math.abs(change))} since ${rows[0].label}` : 'watching now; updates every minute' },
    rows,
    sentence:
      history.length > 1
        ? `The audience has ${change >= 0 ? 'grown' : 'shrunk'} by ${compact(Math.abs(change))} over the ${history.length} refreshes since you opened the board.`
        : 'Leave the board open. It refreshes every minute and draws the audience over time here.',
  };
}
