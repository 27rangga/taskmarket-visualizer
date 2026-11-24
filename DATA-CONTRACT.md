# DATA-CONTRACT.md — Kontrak persis JSON `GET /api/data`

Frontend mengandalkan bentuk ini persis. Worker (`worker.js`) menyimpan JSON ini
di KV `data:latest`; `aggregate.js` adalah satu-satunya kode yang membangunnya.

```jsonc
{
  "dataAsOf": "ISO string — waktu data terakhir dihitung (UTC)",
  "generatedAt": "ISO string — sama dengan dataAsOf",
  "sources": {
    "stats": "GET /api/market/stats?chainId=<id>",
    "breakdowns": "GET /api/stats/breakdowns (platform-wide)",
    "timeSeries": "GET /api/stats/platform-time-series?range=all&bucket=day (platform-wide)",
    "heatmap": "GET /api/stats/activity-heatmap?range=all&dimension=hourOfWeek (platform-wide)",
    "feed": "GET /api/stats/activity-feed?limit=20",
    "tasks": "GET /api/tasks (cursor-paged; per-chain + posters + winners)"
  },
  "chains": {
    "4217": { "registeredWorkers": 0, "activeWorkers7d": 0, "activeAgents7d": 0,
              "openTasks": 0, "paidWorkers": 0, "activeWallets": 0 },
    "8453": { "...sama..." }
  },
  "headline": {
    "registeredWorkers": 0, "activeWorkers7d": 0, "activeAgents7d": 0,
    "openTasks": 0, "paidWorkers": 0, "activeWallets": 0
  },
  "daily": [
    { "date": "YYYY-MM-DD", "chain": "4217" | "8453" | "all",
      "tasksPosted": 0, "rewardsPutUp": 0.00, "rewardsPaid": 0.00,
      "submissions": 0, "activeAgents": 0, "posters": 0 }
  ],
  "byMode": {
    "4217": { "bounty": 0, "claim": 0, "pitch": 0, "benchmark": 0, "auction": 0 },
    "8453": { "..." },
    "all":  { "..." }
  },
  "byStatus": {
    "4217": { "open": 0, "completed": 0 },
    "8453": { "..." },
    "all":  { "..." }
  },
  "heatmap": {
    "4217": [[24 angka jam 0-23], ... 7 baris, baris 0 = Senin],
    "8453": [[...]],
    "all":  [[...]]   // event aktivitas (resmi), BUKAN tugas
  },
  "feed": [
    { "referenceCode": "TSK-XXXX" | null, "title": "judul tugas dari event",
      "eventType": "task_created" | "task_submitted" | ..., "event": "label tampil",
      "mode": "bounty" | null, "status": "open" | null, "chain": "4217",
      "reward": 5.00, "requesterDisplayName": "..." | null, "createdAt": "ISO",
      "submissionCount": 0, "awardCount": 0 }
  ],
  "latestCompleted": { "referenceCode": "TSK-XXXX", "title": "...", "reward": 5.00,
                       "requesterDisplayName": "...", "createdAt": "ISO" } | null,
  "postersWeekly": [
    { "weekStart": "YYYY-MM-DD (Senin)", "chain": "4217" | "8453" | "all",
      "distinctPosters": 0,
      "topPosters": [{ "name": "...", "tasks": 0, "rewards": 0.00 }] }
  ],
  "topWinners": [
    { "workerAddress": "0x...", "wins": 0, "totalWon": 0.00 }
  ],
  "totals": { "tasksTotal": 0, "rewardsPutUpTotal": 0.00, "rewardsPaidTotal": 0.00 },
  "totalsByChain": {
    "4217": { "tasksTotal": 0, "rewardsPutUpTotal": 0.00, "rewardsPaidTotal": 0.00 },
    "8453": { "..." }
  }
}
```

## Aturan yang mengikat

- **Urutan:** `daily` urut tanggal naik (lalu chain); `feed` terbaru dulu, 20 item;
  `postersWeekly` 8 minggu terakhir, urut `weekStart` naik; `topWinners` top 10.
- **Reward:** dolar, 2 desimal. Sumbernya `netReward` (satuan terkecil 6 desimal,
  dibagi 1.000.000). `reward` mentah (gross) TIDAK dipakai.
- **Chain:** `"4217"` = Tempo (OUSD), `"8453"` = Base (USDC). Angka `"all"` adalah
  penjumlahan nominal kedua chain — lihat catatan mata uang di METHOD.md.
- **`headline`:** `registeredWorkers`, `activeWorkers7d`, `activeAgents7d`,
  `openTasks` diambil dari `GET /api/market/stats` TANPA `chainId` (nilai ini
  platform-wide; API mengembalikan angka yang sama untuk tiap chain).
  `paidWorkers` dan `activeWallets` = jumlah kedua chain (API memisah keduanya
  per chain).
- **`byMode`:** kelima kunci mode selalu ada (0 bila tidak ada). Mode lain yang
  muncul di API ditambahkan sebagai kunci ekstra, bukan dibuang. **Scope "all"
  dari `breakdowns` resmi; per-chain dari `/api/tasks`** (jendela 5 Jul 2026–,
  karena endpoint resmi mengabaikan `chainId`).
- **`byStatus`:** kunci = status apa pun yang muncul di API (`open`, `completed`,
  ...). Status valid yang teramati: `open` (phase `active`), `completed`
  (phase `resolved`). **Scope "all" dari `breakdowns` resmi; per-chain dari
  `/api/tasks`.**
- **`daily`:** scope "all" dari `platform-time-series` resmi
  (`tasksPosted=tasksCreated`, `rewardsPutUp=rewardVolume/1e6`,
  `rewardsPaid=paidVolume/1e6`, `activeAgents=activeAgents`; `submissions` dan
  `posters` dari daftar tugas). Scope per-chain dari `/api/tasks`
  (jendela 5 Jul 2026–). Rentang deret resmi: 26 Feb 2026– (bucket terakhir =
  hari terakhir yang lengkap; hari berjalan belum ada bucketnya).
- **`heatmap`:** scope "all" = event aktivitas resmi (`activity-heatmap`,
  range=all; baris resmi 0=Minggu dipetakan ke 0=Senin); scope per-chain =
  hitungan task yang dibuat (posted) per jam UTC dari `/api/tasks`. Baris 0 =
  Senin, baris 6 = Minggu; kolom 0–23 = jam UTC.
- **`feed[].title`:** judul tugas dari event (`taskTitle`); bila event tidak
  membawa judul, 80 karakter pertama `description` dari daftar tugas.
  `feed[].event` = label tampil tipe event; `feed[].eventType` = tipe mentah
  API. `referenceCode`/`mode`/`status`/`submissionCount`/`awardCount`/
  `requesterDisplayName` dari daftar tugas bila tugasnya dikenal, bila tidak
  null/0. `feed[].reward` = `amount` event (bila ada) atau `netReward` tugas.
- **`latestCompleted`:** tugas `completed` terbaru (menurut `createdAt`) dari
  daftar tugas; dipakai panel flow. Null bila belum ada.
- **`totals`:** scope "all" resmi — `tasksTotal` = jumlah hitungan status
  `breakdowns`; `rewardsPutUpTotal` = Σ `rewardVolume` deret resmi;
  `rewardsPaidTotal` = Σ `paidVolume` deret resmi. **`totalsByChain`:** dari
  `/api/tasks` (jendela 5 Jul 2026–).
- **`postersWeekly[].topPosters`:** top 5 poster minggu itu per chain (diurutkan
  jumlah task, lalu reward). `name` = `requesterDisplayName` bila ada, bila tidak
  alamat wallet requester.
- **`topWinners`:** hanya dari task `completed` yang punya
  `primaryAward.workerAddress`; `totalWon` = jumlah `netReward` task-task itu.
- **Semua tanggal/jam dalam UTC** (tanggal dari `createdAt`).

## Key KV (Worker)

| Key | Isi |
|---|---|
| `data:latest` | JSON lengkap di atas |
| `data:meta` | `{ lastFullRefresh, lastFeedRefresh?, taskCount, pagesFetched, backfill, breakdownsTotal, timeSeriesBuckets, heatmapEvents, feedItems, errors[] }` |
| `tasks:index` | Array task ringkas (`compactTask`) — sumber agregasi; dipakai refresh inkremental + enrichment feed |

## Header HTTP `/api/data`

`Content-Type: application/json`, `Cache-Control: public, max-age=300` (QA 1.4:
minimal 60 detik). Bila KV belum berisi data: HTTP 503 `{"error":"data not ready yet"}`.
