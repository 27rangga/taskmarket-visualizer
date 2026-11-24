# TaskMarket Visualizer — Frontend

Static site for bounty TSK-BRK611AN. One page, no framework, no analytics,
no wallet. Data comes only from same-origin `/api/data` (served by the
Cloudflare Worker); the browser never calls `api.taskmarket.dev`.

## Files

```
public/
  index.html   — page structure, all sections, og/twitter meta
  styles.css   — brand-kit styling, mobile-first
  app.js       — fetch /api/data, render every view, chain/range switches
  assets/
    fonts/     — DepartureMono-Regular.woff2 (to be added, see below)
    img/       — (empty; lockup + og image pending copy, see below)
```

`../mock-data.json` — example `/api/data` payload for local testing.
`../test-server.py` — local server: serves `public/` and answers
`/api/data` from `mock-data.json`.

## How to change the data

Swap the Worker payload behind `/api/data`. The page reads exactly the
contract in `aggregate.js` (`dataAsOf`, `headline`, `chains`, `daily`,
`byMode`, `byStatus`, `heatmap`, `feed`, `postersWeekly`, `topWinners`,
`totals`, `totalsByChain`). Missing fields render as "—"; a failed or
bad fetch shows the "Data belum tersedia" panel instead of empty numbers.

## Page size (local files, 25 Nov 2026)

| File | Bytes |
|---|---|
| index.html | 15,398 |
| styles.css | 11,791 |
| app.js | 17,606 |
| **Total local (initial page)** | **~44.8 KB** |
| mock /api/data payload | ~37 KB (not part of the initial page) |

External on first load: Google Fonts (Instrument Serif + Inter Tight,
woff2 subsets, ~30–90 KB depending on browser) and the TaskMarket lockup
PNG (~30 KB, hotlinked from the kit's public gist URL). No JS library.
Estimated transfer on a slow 3G connection (~1.6 Mbps): well under 3 s
for the local files + fonts; see test notes below.

## Brand assets — pending copy (needs approval)

A security flag on the brand-kit directory blocked copying its files into
this repo in this session, so these are referenced, not bundled yet:

- **Lockup + og image:** currently hotlinked from the kit's public gist
  URLs (`gist.githubusercontent.com/ponderingdemocritus/…/taskmarket-lockup.png`
  and `…/taskmarket-og-1200x630.png`). After approval, copy them to
  `public/assets/img/` and change the `src` / `og:image` / `twitter:image`
  URLs to `/assets/img/taskmarket-lockup.png` and
  `/assets/img/taskmarket-og-1200x630.png`.
- **Departure Mono:** `app.js`/`styles.css` already declare
  `@font-face` for `assets/fonts/DepartureMono-Regular.woff2`. Until that
  file is copied in, numbers fall back to the system monospace stack.
  Instrument Serif and Inter Tight load from Google Fonts CDN.
- **Inter Tight subsetting:** not done — the full variable TTF (~580 KB)
  was not copied, so the CDN serves the font instead. If self-hosting is
  wanted later, subset with `pyftsubset` to latin + basic punctuation
  before copying in.

## Local test

```
python3 test-server.py        # http://localhost:8000/
curl -s http://localhost:8000/api/data | head -c 200
```

## Method (short version)

Headline numbers come from `GET /api/market/stats`; everything else is
computed server-side from `GET /api/tasks`. Tempo (4217) pays OUSD, Base
(8453) pays USDC — combined figures are nominal dollar sums, never one
currency. "Rewards paid" per day = net reward of `completed` tasks by
creation date. Full method note is on the page itself.
