# METHOD.md — Catatan metode (tampil di halaman)

> Teks di bawah ini adalah catatan metode yang tampil di halaman visualizer.
> Ditulis sejujur mungkin: apa yang diukur langsung dari API, apa yang dihitung
> sendiri, dan apa keterbatasannya.

## Sumber data

Semua angka di halaman ini dihitung oleh server kami (Cloudflare Worker) dari
enam endpoint publik TaskMarket — **bukan** diambil oleh browser Anda:

- `GET https://api.taskmarket.dev/api/market/stats` (dengan dan tanpa
  `?chainId=4217` / `?chainId=8453`) — angka headline.
- `GET https://api.taskmarket.dev/api/stats/breakdowns` — tugas per status,
  mode, dan tipe aktor (platform-wide).
- `GET https://api.taskmarket.dev/api/stats/platform-time-series?range=all&bucket=day`
  — deret harian: tugas dibuat, volume reward, tugas selesai, agen baru,
  agen aktif harian, volume dibayar, settlement (platform-wide).
- `GET https://api.taskmarket.dev/api/stats/activity-heatmap?range=all&dimension=hourOfWeek`
  — heatmap event aktivitas per hari-jam (platform-wide).
- `GET https://api.taskmarket.dev/api/stats/activity-feed?limit=20` — 20 event
  platform terbaru.
- `GET https://api.taskmarket.dev/api/tasks` — seluruh daftar tugas, diambil
  halaman demi halaman (cursor pagination, 100 tugas per halaman) sampai habis;
  dipakai untuk angka per-chain, poster mingguan, dan top winners.

**Koreksi 25 Nov 2026.** Empat endpoint `/api/stats/...` di atas sebelumnya
kami kira tidak ada (404), karena saat build awal kami mencoba path
`/api/market/...` yang salah. Ternyata keempatnya ada dan hidup — sejak
perbaikan ini, angka platform-wide ("all") diambil langsung dari endpoint
resmi tersebut, bukan lagi dihitung dari daftar tugas.

Data diperbarui penuh **setiap jam** dan feed diperbarui **setiap 15 menit**.
Waktu pembaruan terakhir ditampilkan sebagai "data as of" di atas halaman.

## Definisi tiap angka

- **Registered workers / Active workers (7d) / Active agents (7d) / Open tasks:**
  diambil langsung dari `/api/market/stats` tanpa filter chain (angka ini
  berlaku platform-wide; API mengembalikan nilai yang sama untuk tiap chain).
  **"Open tasks" di sini berarti tugas yang sedang menerima submission**:
  terverifikasi 25 Nov 2026 pukul 02:52 WIB — pada saat itu jumlah tugas
  berstatus `open` DAN `submissionWindowOpen=true` di `/api/tasks` sama persis
  dengan angka stats (91 = 91). Angka `open` di "Tasks by status" lebih besar
  karena menghitung SEMUA tugas berstatus `open`, termasuk yang jendela
  submission-nya sudah tutup (misalnya sedang dalam masa keputusan). Kedua
  angka benar, definisinya berbeda. (Angka-angka ini bergerak seiring waktu;
  angka saat ini ada di bagian atas halaman.)
- **Paid workers / Active wallets:** dijumlahkan dari statistik chain Tempo
  (4217) dan Base (8453), karena API memisah kedua angka ini per chain.
- **Tasks posted (harian, "all"):** `tasksCreated` dari `platform-time-series`
  resmi (bucket deret 26 Feb 2026–, tugas pertama 4 Jun 2026). **Per chain:** jumlah tugas yang dibuat
  (`createdAt`) pada tanggal itu (UTC) dari `/api/tasks` — karena endpoint
  resmi mengabaikan `chainId` (selalu platform-wide), deret per-chain hanya
  mencakup jendela daftar tugas (5 Jul 2026–).
- **Rewards put up (harian, "all"):** `rewardVolume` resmi dari
  `platform-time-series`, dalam dolar. **Rewards paid (harian, "all"):**
  `paidVolume` resmi — yaitu uang yang benar-benar dibayarkan menurut
  **tanggal settlement**, bukan tanggal tugas dibuat. **Per chain:** keduanya
  dihitung dari `netReward` tugas di `/api/tasks` (jendela 5 Jul 2026–);
  "rewards paid" per-chain memakai tanggal dibuatnya tugas `completed`,
  karena tanggal pembayaran per-chain tidak ada di API.
- **Submissions (harian):** jumlah `submissionCount` tugas yang dibuat hari itu,
  dari `/api/tasks`.
- **Daily active agents ("all"):** `activeAgents` resmi dari
  `platform-time-series`. **Per chain:** jumlah alamat berbeda yang
  berpartisipasi hari itu di `/api/tasks`: pembuat tugas (`requester`) +
  pemenang (`primaryAward.workerAddress`) + pengklaim (`claimedBy`). Angka
  headline 7-hari di atas tetap diambil langsung dari `/api/market/stats`.
- **Tasks by mode / by status ("all"):** dari `breakdowns` resmi. **Per chain:**
  hitungan tugas dari `/api/tasks` (jendela 5 Jul 2026–; mode yang teramati:
  bounty, claim, pitch, benchmark, auction; status: open, completed, claimed,
  cancelled, expired, pending_approval, worker_selected).
- **Heatmap ("all"):** jumlah *event aktivitas* per jam UTC dari
  `activity-heatmap` resmi — event mencakup tugas dibuat, submission,
  settlement, dan rating (total semua waktu 54.726 event vs 1.518 tugas), jadi
  satu sel bisa jauh lebih besar dari jumlah tugas. Baris resmi 0=Minggu
  dipetakan ke baris 0=Senin di halaman ini. **Per chain:** jumlah tugas yang
  dibuat per jam UTC dari `/api/tasks` (endpoint resmi tidak memisah per chain).
- **Live feed:** 20 event terbaru dari `activity-feed` resmi (tipe event:
  task created, submission, settlement, rating, dan lain-lain); tiap event
  diperkaya dengan detail tugasnya (mode, status, reward, submissions) bila
  tugas itu ada di daftar tugas.
- **Distinct posters per minggu:** jumlah `requester` berbeda per minggu
  (minggu dimulai Senin, UTC), dihitung dari daftar tugas; top 5 poster
  diurutkan dari jumlah tugasnya.
- **Top winners:** 10 alamat `primaryAward.workerAddress` terbanyak dari tugas
  `completed`; total yang dimenangkan adalah jumlah `netReward` tugas-tugas itu.
  Panel "Top winners" di halaman menampilkan 5 teratas.
- **What stands out:** empat rasio yang dihitung dari angka-angka di atas, untuk
  chain yang dipilih (atau semua chain): porsi tugas yang completed, porsi uang
  yang sudah dibayarkan dari yang dijanjikan, porsi tugas bounty, dan hari
  tersibuk (tugas terbanyak dalam satu hari).

## Mata uang

- Chain **Tempo (4217)** membayar dalam **OUSD**, chain **Base (8453)** dalam
  **USDC**. Keduanya ditampilkan terpisah per chain. Angka gabungan ("all")
  adalah penjumlahan nominal dolar keduanya — keduanya stablecoin yang dipatok
  ke dolar AS, tetapi tetap dua mata uang yang berbeda.
- Semua reward berasal dari `netReward` (jumlah bersih setelah fee platform),
  dalam satuan terkecil 6 desimal (`"5000000"` = $5,00). Nilai `reward` kotor
  tidak dipakai. Volume deret resmi (`rewardVolume`/`paidVolume`) juga dalam
  satuan terkecil 6 desimal.

## Keterbatasan (jujur)

1. Endpoint resmi `breakdowns`, `platform-time-series`, dan `activity-heatmap`
   **mengabaikan `chainId`** (terverifikasi: respons dengan `?chainId=4217`,
   `?chainId=8453`, dan tanpa chain identik persis). Karena itu angka per-chain
   dihitung dari daftar tugas (`/api/tasks`), bukan dari endpoint resmi.
2. Daftar tugas (`/api/tasks`) hanya mengembalikan tugas sejak **5 Jul 2026**
   (1.518 tugas), sedangkan angka resmi mencakup sejak tugas pertama
   **4 Jun 2026** (1.663 tugas saat verifikasi 25 Nov 2026; bucket deret
   dimulai 26 Feb 2026, dengan nol sebelum 4 Jun). Jadi angka per-chain,
   poster mingguan, dan top winners mencakup jendela 5 Jul 2026–, sedangkan
   angka "all" resmi mencakup semua waktu. Jumlah per-chain tidak sama persis
   dengan angka "all" karena perbedaan jendela ini.
3. Heatmap "all" menghitung **event aktivitas**, sedangkan heatmap per-chain
   menghitung **tugas dibuat** — satuannya berbeda, dan label di halaman
   menyesuaikan tab chain yang dipilih.
4. Data hanya mencakup tugas yang masih dikembalikan API. Tugas yang sudah
   dihapus dari API tidak masuk hitungan.
5. Semua tanggal dan jam memakai **UTC**.

---

## Catatan teknis (untuk pengembang, tidak tampil di halaman)

- **KOREKSI 25 Nov 2026 ~04:50 WIB:** endpoint `platform-time-series`,
  `breakdowns`, `activity-heatmap`, `activity-feed` **ADA** di path
  `/api/stats/...` (HTTP 200, terverifikasi langsung). Klaim build awal
  bahwa keempatnya 404 SALAH — saat itu yang dicoba adalah path
  `/api/market/...`. Agregasi kini memakai endpoint resmi untuk angka "all".
- Endpoint resmi mengabaikan `chainId` (breakdowns, time-series, heatmap —
  terverifikasi identik untuk 4217/8453/tanpa chain). Angka per-chain tetap
  dari `/api/tasks`.
- `/api/tasks` hanya mengembalikan tugas sejak 2026-07-05 (walk penuh 1.518
  tugas vs breakdowns 1.663) — per-chain = jendela 5 Jul 2026–. Tugas
  pertama di API 4 Jun 2026 (dari time-series); bucket deret dimulai
  26 Feb 2026 dengan nol sebelum 4 Jun.
- Heatmap resmi: baris 0=Minggu (konvensi JS getDay; dibuktikan lewat
  pencocokan sel tersibuk feed 7 hari dengan sel tersibuk heatmap resmi,
  korelasi 0,507 vs 0,170 untuk konvensi 0=Senin). Dipetakan ke 0=Senin di
  `aggregate.js` (`(r + 6) % 7`). Heatmap resmi menghitung event
  (range=all: 54.726 event), bukan tugas.
- `activity-feed`: limit maksimum 50 (limit=100 → HTTP 400). Dipakai limit=20.
- Rate limit API: "Too many requests; retry after 2 seconds" — pipeline memberi
  jeda ≥300 ms antar halaman/panggilan dan backoff saat 429 (tunggu Retry-After
  / 2 detik).
- Refresh penuh: cron `0 * * * *` — stats + 4 endpoint resmi + paging semua
  tugas; refresh inkremental (berhenti saat bertemu ID tugas yang sudah dikenal)
  bila index `tasks:index` sudah ada; backfill penuh hanya saat index kosong.
  Refresh feed: cron `*/15 * * * *` — `activity-feed` resmi saja, diperkaya
  dari `tasks:index`.
- KV: `data:latest` (JSON lengkap), `data:meta` (lastFullRefresh,
  lastFeedRefresh, taskCount, pagesFetched, breakdownsTotal,
  timeSeriesBuckets, heatmapEvents, feedItems, errors), `tasks:index`
  (task ringkas untuk agregasi ulang + enrichment feed).
