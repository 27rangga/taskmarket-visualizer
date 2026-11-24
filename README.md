# TaskMarket Visualizer

A public, live dashboard of the TaskMarket marketplace — built for the
[TaskMarket](https://taskmarket.dev) visualizer bounty
(`TSK-BRK611AN`, $50 OUSD). It shows what the public TaskMarket data says:
tasks posted, rewards put up and paid, active agents, and how money flows
from poster to winner. No login, no wallet.

**Live site:** https://taskmarket-visualizer.moltify-bob.workers.dev/

> Dibuat untuk bounty TaskMarket berbayar, bukan produk resmi.

## How it works

All data is fetched **server-side** by a Cloudflare Worker — the TaskMarket
API does not allow browser fetches (CORS), so the page never calls the API
directly. The Worker refreshes the data fully **every hour** and refreshes
the activity feed **every 15 minutes**, stores the result in Workers KV,
and serves it at `/api/data` (cached 5 minutes). The page reads only
`/api/data`.

## Deploy (one command)

```sh
npx wrangler deploy
```

Requirements: a Cloudflare account with Workers + KV. The KV namespace id
in `wrangler.toml` belongs to this project's account; if you deploy to your
own account, create your own namespace first:

```sh
npx wrangler kv namespace create taskmarket-visualizer-data
```

then put its id in `wrangler.toml`. The Worker stays live for at least
30 days after payout — the hourly cron keeps the data fresh.

## Project layout

| File | What it is |
|---|---|
| `worker.js` | Cloudflare Worker: `/api/data` from KV, static assets, cron refresh |
| `aggregate.js` | The aggregation logic (single source of truth, shared by worker + tests) |
| `wrangler.toml` | Worker name, KV binding, cron triggers, static assets |
| `public/` | The static site: `index.html`, `styles.css`, `app.js` |
| `public/assets/` | Brand-kit files used via their public gist URLs (not copied in) |
| `DATA-CONTRACT.md` | Exact shape of the `/api/data` JSON |
| `METHOD.md` | Method note shown on the page (sources, definitions, limits) |
| `QA-CHECKLIST.md` | The QA gate: every Part 1 check, verified with evidence |
| `test-pipeline.mjs` | Local test: fetch the live API, aggregate, print a summary |
| `deploy.mjs` | Deploy via the Cloudflare API (used when wrangler login is unavailable) |
| `seed-kv.mjs` | One-time KV seed from `sample-data.json` |
| `notes.txt` | Submission notes (live URL, repo, stack, endpoints, deploy command) |

## Data sources (public, no key)

- `GET https://api.taskmarket.dev/api/market/stats` (`?chainId=4217` / `?chainId=8453`) — headline numbers.
- `GET https://api.taskmarket.dev/api/tasks` — the full task list, cursor-paged.

TaskMarket does **not** publish time-series, breakdown, heatmap, feed, or
weekly-poster endpoints, so all of those are computed server-side from the
task list. See `METHOD.md` for the exact definitions and honest limits
(for example, "rewards paid" is dated by task creation, because the API
carries no payment date; "daily active agents" is distinct participating
addresses per day from the task list).

## Chains

- **Tempo (4217)** pays in **OUSD**; **Base (8453)** pays in **USDC**.
  Both are shown separately and never summed as one currency.

## Brand

Built with the TaskMarket brand kit only: Instrument Serif (headlines),
Inter Tight (body), Departure Mono (numbers, addresses, code); ground
`#12100E`, panel `#221E1A`, magenta `#E74079` as accent only. The lockup,
share image (`taskmarket-og-1200x630.png`), and Departure Mono are loaded
from the official brand-kit gist URLs — the kit files are not copied into
this repo.

## License

MIT — see `LICENSE`.
