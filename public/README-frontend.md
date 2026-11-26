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
    fonts/     — DepartureMono-Regular.woff2 (self-hosted)
    img/       — taskmarket-lockup.png, taskmarket-mark.png,
                 taskmarket-og-1200x630.png (self-hosted)
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

## Page size (local files, 26 Nov 2026)

| File | Bytes |
|---|---|
| index.html | 21,873 |
| styles.css | 13,807 |
| app.js | 26,014 |
| **Total local (initial page)** | **~60.2 KB** |
| live /api/data payload | ~91.7 KB (not part of the initial page) |

(Koreksi 26 Nov 2026: tabel lama 25 Nov — 15.398 / 11.791 / 17.606 B,
total ~44.8 KB — sudah basi; file tumbuh saat R2+R3.)

External on first load: Google Fonts (Instrument Serif + Inter Tight,
woff2 subsets, ~30–90 KB depending on browser) and the TaskMarket lockup
PNG (~30 KB, self-hosted in assets/img/). No JS library.
Estimated transfer on a slow 3G connection (~1.6 Mbps): well under 3 s
for the local files + fonts; see test notes below.

## Brand assets — self-hosted (25 Nov 2026)

The lockup, mark, og image and Departure Mono are bundled in
`public/assets/` (font in `fonts/`, images in `img/`), downloaded as
binaries from the kit's public gist URLs — the earlier security flag only
blocked reading the kit's text files, not the binary assets themselves.
Live-verified HTTP 200 with exact sizes and content types.
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
