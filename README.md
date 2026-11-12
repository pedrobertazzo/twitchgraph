# On Air for Twitch

What Twitch is watching right now, as a board you can rearrange, in Twitch's own purple and dark greys (red is kept for LIVE, as on Twitch). It is a fan-made stats site, not affiliated with Twitch. It reads the 500 biggest live channels once a minute and turns them into twelve live stats: top categories, biggest channels, languages, how concentrated the audience is, uptime and marathons, talking vs playing, tags, go-live times, viewers per channel, channels that just went live, and a pulse of the audience since you opened the page.

Planned home: **twitch.morphgrid.io**. Built on [morphgrid](https://www.npmjs.com/package/morphgrid): drag a panel onto another and they swap, each redrawn for its new spot.

## Panels

Every stat can be shown in every panel type:

| Panel | Shows a stat as |
| --- | --- |
| Tally | One large number |
| Rundown | A numbered list, with box art or stream thumbnails |
| Levels | Meter bars: horizontal, or vertical columns in wide panels (a 24-hour clock for go-live times) |
| Split | One band split into shares, with a legend |
| Dial | A 24-hour dial, or radial levels around the headline |
| Wall | A video wall of tiles sized by audience |
| Ticker | A crawl along the top of the board |

Press **i** (or double-click a panel) to see a stat in every panel type.

## Everyone live, history and clips

The live board reads the 500 biggest channels once a minute. A background **refresher** (`lib/refresher.ts`) adds what that can't show, every 15 minutes:

- **A count of everyone live**, small channels included. Helix lists streams 100 a page, biggest first, so the count reads one chain of pages per big language and a few chains for all other languages in parallel (every ISO 639-1 code plus `other`, so nothing is skipped), paced to stay well under Twitch's 800 calls a minute. That is several hundred to about a thousand calls and takes a minute or two. The list reorders while it's read, so channels seen twice are counted once and a few may be missed: the totals are approximate.
- **History**: one point per run (everyone's viewers, channels and the 30 biggest categories), kept for two days. It powers Last 24 hours, Busiest hours and Rising now.
- **Clips of the day**: the most-watched clips of the last 24 hours in the 8 biggest categories, every other run.

Partner/affiliate status and account age come from the profile call the live board already makes for avatars.

Stories from the refresher appear once it has run: All of Twitch, The long tail, Every category, Last 24 hours, Busiest hours, Rising now, Clips of the day. Partners vs affiliates and New faces work without it.

### Setting it up on Vercel (Hobby)

The same setup as the football site, and you can connect the same Upstash databases to this project:

1. **Storage → Upstash for Redis** and **Upstash QStash**, both connected to this project with no variable prefix.
2. Add `CRON_SECRET` (any long random string) under **Settings → Environment Variables** and redeploy.
3. In Upstash, **QStash → Schedules → Create**: destination `https://twitch.morphgrid.io/api/refresh`, cron `*/15 * * * *`, retries 0. Requests are checked against QStash's signing keys, so no header is needed.
4. Check it: `curl -H "Authorization: Bearer <CRON_SECRET>" https://twitch.morphgrid.io/api/refresh` runs a count and reports channels, viewers and how long it took.

Every 15 minutes is 96 QStash messages a day; with the football site's every 3 minutes (480) that's 576, inside QStash's free daily allowance. On a long-running server (`npm start`), `instrumentation.ts` starts the refresher with the server instead.

## Setup

```bash
npm install
cp .env.example .env.local   # add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET
npm run dev
```

Create the app at [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps). It uses the client-credentials flow only, so no user ever signs in. Without keys the board shows made-up sample data and says so.

Every Helix response is kept for a minute in Next's data cache, which all server instances share, and the page and `/api/snapshot` are rebuilt on the same schedule. One snapshot is about 6 Helix calls a minute however many people are watching; open boards ask `/api/snapshot` once a minute and get the same cached copy.

```bash
npm test          # stats
npm run typecheck
npm run build
```
