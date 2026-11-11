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
};

export type Category = { id: string; name: string; art: string };

// Everything one refresh of the board needs. Taken at `at`, from the `streams.length` biggest live channels.
export type Snapshot = {
  at: string;
  sample: boolean; // true when the data is made up (no API keys configured)
  streams: Stream[];
  categories: Record<string, Category>;
};

export type Unit = 'viewers' | 'channels' | 'percent' | 'hours' | 'avg';

export type Row = {
  id: string;
  label: string;
  value: number;
  sub?: string;
  image?: string; // a ready-to-use URL
  avatar?: string; // a channel's profile picture
  kind?: 'channel' | 'category';
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
