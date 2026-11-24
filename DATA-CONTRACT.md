# DATA-CONTRACT.md — Kontrak persis JSON `GET /api/data`

Frontend mengandalkan bentuk ini persis. Worker (`worker.js`) menyimpan JSON ini
di KV `data:latest`; `aggregate.js` adalah satu-satunya kode yang membangunnya.

```jsonc
{
  "dataAsOf": "ISO string — waktu data terakhir dihitung (UTC)",
  "generatedAt": "ISO string — sama dengan dataAsOf",
  "sources": {
    "stats": "GET /api/market/stats?chainId=<id>",
    "tasks": "GET /api/tasks (cursor-paged)"
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
    "all":  [[...]]
  },
  "feed": [
    { "referenceCode": "TSK-XXXX", "title": "80 karakter pertama description",
      "mode": "bounty", "status": "open", "chain": "4217",
      "reward": 5.00, "requesterDisplayName": "...", "createdAt": "ISO",
      "submissionCount": 0, "awardCount": 0 }
  ],
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
  muncul di API ditambahkan sebagai kunci ekstra, bukan dibuang.
- **`byStatus`:** kunci = status apa pun yang muncul di API (`open`, `completed`,
  ...). Status valid yang teramati: `open` (phase `active`), `completed`
  (phase `resolved`).
- **`heatmap`:** hitungan task yang dibuat (posted) per jam UTC; baris 0 = Senin,
  baris 6 = Minggu; kolom 0–23 = jam UTC.
- **`feed[].title`:** 80 karakter pertama `description`, newline diganti spasi.
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
| `data:meta` | `{ lastFullRefresh, lastFeedRefresh?, taskCount, pagesFetched, backfill, errors[] }` |
| `tasks:index` | Array task ringkas (`compactTask`) — sumber agregasi; dipakai refresh inkremental |

## Header HTTP `/api/data`

`Content-Type: application/json`, `Cache-Control: public, max-age=300` (QA 1.4:
minimal 60 detik). Bila KV belum berisi data: HTTP 503 `{"error":"data not ready yet"}`.
