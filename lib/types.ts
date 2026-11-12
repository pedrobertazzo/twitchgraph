// One live channel, trimmed from Helix's /streams response to what the board uses.
export type Stream = {
  id: string;
  userId: string;
  login: string;
  avatar?: string; // profile picture, from Helix /users
  name: string;
  gameId: string;
  game: string;
  title: string;
  viewers: number;
  startedAt: string; // ISO
  language: string; // ISO 639-1, or "other"
  thumb: string; // template with {width} and {height}
  tags: string[];
  mature: boolean;
  broadcasterType?: 'partner' | 'affiliate' | ''; // from Helix /users
  createdAt?: string; // when the account was made, ISO
};

export type Category = { id: string; name: string; art: string };

// Everything one refresh of the board needs. Taken at `at`, from the `streams.length` biggest live channels.
export type Snapshot = {
  at: string;
  sample: boolean; // true when the data is made up (no API keys configured)
  streams: Stream[];
  categories: Record<string, Category>;
  extras?: Extras; // what the background refresher collected: everyone live, history, clips
};

export type Unit = 'viewers' | 'channels' | 'percent' | 'hours' | 'avg';

export type Row = {
  id: string;
  label: string;
  value: number;
  sub?: string;
  image?: string; // a ready-to-use URL
  avatar?: string; // a channel's profile picture
  kind?: 'channel' | 'category' | 'clip';
  href?: string; // the channel on twitch.tv
};

// A stat the board can show. Every view knows how to draw every insight from these fields alone.
export type Insight = {
  key: string;
  title: string;
  kicker: string; // the short label above the title
  unit: Unit;
  headline: { value: number; unit: Unit; label: string };
  rows: Row[];
  share?: boolean; // the rows are parts of one whole
  clock?: number[]; // 24 values, one per UTC hour, when the stat has a time of day
  sentence: string;
};

// --- Collected in the background by the refresher (lib/refresher.ts), read from the store ---------------------------

// One full count of everyone live, taken every 15 minutes.
export type Census = {
  at: string;
  ms: number; // how long the count took
  channels: number;
  viewers: number;
  median: number; // viewers of the median channel
  bands: { label: string; channels: number; viewers: number }[];
  categories: { id: string; name: string; viewers: number; channels: number }[]; // the 60 biggest
  languages: { code: string; viewers: number; channels: number }[];
};

// One point of history per refresher run: everyone's totals and the biggest categories' viewers.
export type HistoryPoint = { t: number; viewers: number; channels: number; cats: Record<string, number>; names?: Record<string, string> };

export type Clip = { id: string; url: string; title: string; broadcaster: string; game: string; views: number; thumb: string; createdAt: string };

export type Extras = { census: Census | null; history: HistoryPoint[]; clips: Clip[] };
