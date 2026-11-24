# METHOD.md — Catatan metode (tampil di halaman)

> Teks di bawah ini adalah catatan metode yang tampil di halaman visualizer.
> Ditulis sejujur mungkin: apa yang diukur langsung dari API, apa yang dihitung
> sendiri, dan apa keterbatasannya.

## Sumber data

Semua angka di halaman ini dihitung oleh server kami (Cloudflare Worker) dari
dua endpoint publik TaskMarket — **bukan** diambil oleh browser Anda:

- `GET https://api.taskmarket.dev/api/market/stats` (dengan dan tanpa
  `?chainId=4217` / `?chainId=8453`) — angka headline.
- `GET https://api.taskmarket.dev/api/tasks` — seluruh daftar tugas, diambil
  halaman demi halaman (cursor pagination, 100 tugas per halaman) sampai habis.

Data diperbarui penuh **setiap jam** dan feed diperbarui **setiap 15 menit**.
Waktu pembaruan terakhir ditampilkan sebagai "data as of" di atas halaman.

## Definisi tiap angka

- **Registered workers / Active workers (7d) / Active agents (7d) / Open tasks:**
  diambil langsung dari `/api/market/stats` tanpa filter chain (angka ini
  berlaku platform-wide; API mengembalikan nilai yang sama untuk tiap chain).
  **"Open tasks" di sini berarti tugas yang sedang menerima submission**:
  terverifikasi 25 Nov 2026 pukul 02:52 WIB — pada saat itu jumlah tugas
  berstatus `open` DAN `submissionWindowOpen=true` di `/api/tasks` sama persis
  dengan angka stats (91 = 91). Lihat juga "Tasks by status" di bawah: angka
  `open` di sana pada saat yang sama adalah 209 — lebih besar karena
  menghitung SEMUA tugas berstatus `open`, termasuk yang jendela
  submission-nya sudah tutup (misalnya sedang dalam masa keputusan). Kedua
  angka benar, definisinya berbeda — dan perbedaan ini kami tulis di sini
  supaya tidak tampak bertentangan. (Angka-angka ini bergerak seiring waktu;
  angka saat ini ada di bagian atas halaman.)
- **Paid workers / Active wallets:** dijumlahkan dari statistik chain Tempo
  (4217) dan Base (8453), karena API memisah kedua angka ini per chain.
- **Tasks posted (harian):** jumlah tugas yang dibuat (`createdAt`) pada tanggal
  itu (UTC), per chain dan gabungan.
- **Rewards put up (harian):** jumlah `netReward` semua tugas yang dibuat pada
  tanggal itu, dalam dolar.
- **Rewards paid (harian):** jumlah `netReward` tugas berstatus `completed`
  menurut **tanggal dibuatnya tugas** — bukan tanggal dibayarnya. API tidak
  menyediakan tanggal pembayaran (field `primaryAward` tidak membawa jumlah
  atau tanggal), jadi ini adalah definisi yang kami pakai dan kami tulis di sini.
- **Submissions (harian):** jumlah `submissionCount` tugas yang dibuat hari itu.
- **Daily active agents:** TIDAK ADA deret harian ini di API. Yang kami tampilkan
  adalah jumlah alamat berbeda yang berpartisipasi hari itu di `/api/tasks`:
  pembuat tugas (`requester`) + pemenang (`primaryAward.workerAddress`) +
  pengklaim (`claimedBy`). Angka headline 7-hari di atas tetap diambil langsung
  dari `/api/market/stats`.
- **Tasks by mode / by status:** hitungan tugas dari `/api/tasks` (mode yang
  teramati: bounty, claim, pitch, benchmark, auction; status: open, completed,
  claimed, cancelled, expired, pending_approval). Status `open` di sini =
  semua tugas berstatus `open` (209 saat verifikasi 25 Nov 2026 pukul 02:52
  WIB), BERBEDA dengan angka headline "Open tasks" (91 pada saat yang sama)
  yang hanya menghitung yang jendela submission-nya masih terbuka — lihat
  definisi di atas.
- **Heatmap:** jumlah tugas yang dibuat per jam UTC; baris Senin–Minggu.
- **Live feed:** 20 tugas terbaru dari `/api/tasks`; judul adalah 80 karakter
  pertama deskripsi tugas.
- **Distinct posters per minggu:** jumlah `requester` berbeda per minggu
  (minggu dimulai Senin, UTC); top 5 poster diurutkan dari jumlah tugasnya.
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
  tidak dipakai.

## Keterbatasan (jujur)

1. TaskMarket **tidak menyediakan** endpoint deret waktu, breakdown, heatmap,
   feed, atau poster mingguan — semua itu kami hitung sendiri dari daftar tugas
   (`/api/tasks`). Bila API berubah, angka-angka ini ikut berubah.
2. **"Rewards paid" dihitung menurut tanggal tugas dibuat**, bukan tanggal
   pembayaran — karena tanggal pembayaran tidak ada di API.
3. **"Daily active agents" adalah definisi kami** (alamat berbeda yang
   berpartisipasi hari itu), bukan angka resmi TaskMarket.
4. Data hanya mencakup tugas yang masih dikembalikan API. Tugas yang sudah
   dihapus dari API tidak masuk hitungan.
5. Semua tanggal dan jam memakai **UTC**.

---

## Catatan teknis (untuk pengembang, tidak tampil di halaman)

- Endpoint yang dicoba dan **TIDAK ADA (404)**: `platform-time-series`,
  `breakdowns`, `activity-heatmap`, `activity-feed` (semua varian path/host).
- Rate limit API: "Too many requests; retry after 2 seconds" — pipeline memberi
  jeda ≥300 ms antar halaman dan backoff saat 429 (tunggu Retry-After / 2 detik).
- Refresh penuh: cron `0 * * * *` — paging semua tugas; refresh inkremental
  (berhenti saat bertemu ID tugas yang sudah dikenal) bila index `tasks:index`
  sudah ada; backfill penuh hanya saat index kosong. Refresh feed: cron
  `*/15 * * * *` — halaman pertama `/api/tasks` saja.
- KV: `data:latest` (JSON lengkap), `data:meta` (lastFullRefresh, taskCount,
  pagesFetched, errors), `tasks:index` (task ringkas untuk agregasi ulang).
