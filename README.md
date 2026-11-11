# On Air

What Twitch is watching right now, as a board you can rearrange. It reads the 500 biggest live channels once a minute and turns them into twelve live stats: top categories, biggest channels, languages, how concentrated the audience is, uptime and marathons, talking vs playing, tags, go-live times, viewers per channel, channels that just went live, and a pulse of the audience since you opened the page.

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
