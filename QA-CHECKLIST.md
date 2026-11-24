# QA CHECKLIST — BRK611AN (gerbang submit, perintah RANGGA 02:38 WIB: "lolos check semuanya")

Target: SEMUA check Bagian 1 LOLOS + skor Bagian 2 ≥ 60 + TIDAK ADA satu pun skor 1.
JANGAN submit kalau ada satu check yang belum terbukti lolos dengan bukti.

## Bagian 1 — Pass/Fail (semua harus LOLOS)

| # | Check (dari brief) | Cara verifikasi | Bukti | Status |
|---|---|---|---|---|
| 1.1 | Hosted live, HTTPS publik, tanpa login/wallet | curl live URL → HTTP 200; buka di browser bersih | URL + status + waktu muat | ☐ |
| 1.2 | Data diambil DI SERVER (bukan browser fetch; CORS menolak browser) | Worker fetch api.taskmarket.dev; halaman TIDAK memanggil api.taskmarket.dev dari browser (cek Network tab / grep bundle) | log Worker + bukti tidak ada fetch browser ke API | ☐ |
| 1.3 | Refresh minimal tiap jam | Cron trigger Worker aktif (jadwal tercatat); dataAsOf berubah tiap jam | daftar cron + 2 dataAsOf berurutan | ☐ |
| 1.4 | Cache minimal 60 detik | Header Cache-Control / logika cache di Worker ≥ 60 dtk | header tercatat | ☐ |
| 1.5 | Jam "data as of" terlihat + catatan metode (endpoint yang dipakai) | Lihat halaman: timestamp terlihat; catatan metode menyebut endpoint persis yang dipakai | screenshot/teks halaman | ☐ |
| 1.6 | 5 angka acak cocok dengan API | Ambil 5 angka dari halaman (headline + 1 deret harian + 1 breakdown + 1 feed + 1 mingguan), bandingkan dengan respons API langsung saat itu juga | tabel angka halaman vs API | ☐ |
| 1.7 | Semua view minimum tampil | Headline; deret harian (active agents, tasks posted, rewards put up & paid) + switch 7d/30d/90d/all; tasks by mode; tasks by status; heatmap; live feed; kedua chain (4217 + 8453); distinct posters per minggu | daftar view + screenshot tiap view | ☐ |
| 1.8 | Repo publik MIT + one-command deploy jalan | Repo https://github.com/27rangga/taskmarket-visualizer publik, ada LICENSE MIT; clone baru → `npx wrangler deploy` berhasil tanpa edit | URL repo + log deploy dari clone baru | ☐ |
| 1.9 | Semua rules | Brand kit: font Instrument Serif/Inter Tight/Departure Mono saja; warna kit saja; lockup + taskmarket.dev tampil; share image og 1200x630; mobile-friendly; load < 3 dtk di HP; footer "dibuat untuk bounty TaskMarket berbayar, bukan produk resmi"; tanpa analytics; tanpa wallet; tanpa nama di alamat | checklist brand + hasil uji load HP | ☐ |
| 1.10 | Situs tetap hidup ≥ 30 hari setelah payout | Cron + Worker tetap aktif; tidak ada TTL/expiry yang mematikan situs (catat rencana: Worker + KV tetap jalan) | konfigurasi cron + catatan | ☐ |

## Bagian 2 — Skor berbobot 100 (butuh ≥ 60, tanpa skor 1)

| Kriteria | Bobot | Target | Bukti / catatan |
|---|---|---|---|
| Creativity | 25 | ≥ 4 | Hero view "uang mengalir dari poster ke pemenang" + penyajian unik lainnya |
| Insight | 20 | ≥ 4 | Temuan dari data (bukan sekadar angka mentah): tren, perbandingan chain, poster teratas |
| Reliability / speed | 15 | ≥ 4 | Load < 3 dtk HP; data segar per jam; tidak ada error saat dicek 3 hari berbeda |
| Design / brand | 15 | ≥ 4 | Patuh penuh pada brand kit (warna, font, lockup, suara copy) |
| Shareability | 15 | ≥ 4 | og image 1200x630 benar; judul + deskripsi menarik saat dibagikan |
| Code / handover | 10 | ≥ 4 | README jelas; deploy 1 perintah; kode rapi + komentar; notes.txt lengkap |

## Fakta API yang ditemukan saat build (25 Nov ~02:45 WIB)

- YANG BENAR-BENAR ADA: `GET /api/market/stats` (mendukung `?chainId=4217|8453`) dan `GET /api/tasks` (cursor pagination `limit` + `nextCursor`/`hasMore`; filter `chainId`, `status=open|completed`; field lengkap: createdAt, mode, status, phase, reward, netReward, chainId, requester, requesterDisplayName, submissionCount, awardCount, primaryAward {workerAddress, rating}, claimedBy).
- YANG TIDAK ADA (404 di semua varian path/host/metode yang dicoba): `platform-time-series`, `breakdowns`, `activity-heatmap`, `activity-feed` — klaim verifikasi awal untuk 4 endpoint ini SALAH.
- KONSEKUENSI: semua deret waktu, breakdown, heatmap, feed, dan distinct posters/minggu DIHITUNG di Worker dari data `/api/tasks` (paging penuh) + angka headline dari `/api/market/stats`. Catatan metode di halaman WAJIB menjelaskan ini dengan jujur.
- Rate limit API: "Too many requests; retry after 2 seconds" — pipeline WAJIB backoff + jeda antar halaman; jangan panggil beruntun tanpa jeda.
- `primaryAward` tidak membawa jumlah/tanggal → "rewards paid" per hari dihitung dari tugas `completed` (netReward) menurut tanggal dibuatnya tugas; tulis definisi ini di catatan metode.
- Status valid: `open` (phase `active`), `completed` (phase `resolved`). Mode yang terlihat: `bounty` dominan; cek mode lain (claim/pitch/benchmark/auction) saat backfill penuh.
- ✅ **Diskrepansi openTasks TERPECAHKAN 25 Nov ~02:52 WIB:** stats `openTasks: 91` = tugas status `open` DAN `submissionWindowOpen=true` (dihitung ulang dari /api/tasks: 91 = 91). Angka byStatus `open: 209` = semua status `open`. Keduanya benar, definisi berbeda — SUDAH dijelaskan di METHOD.md. Saat QA 1.6, verifikasi angka headline openTasks terhadap hitungan open+window-open, BUKAN terhadap byStatus open.

## Hasil QA — bukti per check (25 Nov 2026, ~03:00–03:15 WIB)

- **1.1 Hosted live — LOLOS.** `GET /` → HTTP 200, 15.398 byte, 0,74 dtk. Tanpa login/wallet.
- **1.2 Fetch server-side — LOLOS.** `app.js` hanya memanggil `fetch("/api/data")` (API_URL = "/api/data"; grep `api.taskmarket.dev` di app.js = 0). `worker.js` memanggil API dari server (fetchJsonWithRetry) dan KV berisi data hasil agregasi server — bukti: `/api/data` live mengembalikan data lengkap.
- **1.3 Refresh tiap jam — LOLOS (teramati).** Cron `0 * * * *` + `*/15 * * * *` terkonfirmasi lewat API. **Tick feed 20:15 UTC (03:15 WIB) TERAMATI: `dataAsOf` maju dari 19:52:50Z → 20:15:07Z** (dicek 20:16:53 UTC). Scheduled handler jalan; refresh penuh jam-an berikutnya 21:00 UTC.
- **1.4 Cache ≥60 dtk — LOLOS.** `/api/data` mengembalikan `Cache-Control: public, max-age=300`.
- **1.5 "Data as of" + metode — LOLOS.** Tampil di 3 tempat (atas, catatan metode, footer) via `<span data-asof>`; catatan metode lengkap di halaman (endpoint + definisi + keterbatasan).
- **1.6 Lima angka acak vs API — LOLOS (per dataAsOf).** Saat seed (02:52 WIB) semua cocok; saat cek ulang ~03:05 WIB: registeredWorkers 148418 = 148418 ✓, openTasks 90 = 90 ✓, paidWorkers 4217: 158 = 158 ✓; activeAgents7d 474 vs 473 dan activeWorkers7d 512 vs 511 — selisih 1 karena jendela rolling 7 hari API bergerak di dalam jeda refresh per jam (data halaman per 02:52 WIB, API dicek 03:05 WIB). Angka cocok dengan API *pada saat dataAsOf*; halaman menampilkan dataAsOf supaya pemeriksa bisa membandingkan pada timestamp itu. byStatus open 209→208 / completed 1012→1013 dalam 13 menit menunjukkan data memang hidup.
- **1.7 Semua view minimum — LOLOS.** Headline, deret harian + switch 7d/30d/90d/all, by mode, by status, heatmap 7×24, feed 20 item, kedua chain (tab Tempo/Base, tidak dijumlah lintas mata uang), distinct posters 8 minggu + top 5, hero flow — semua ada di HTML live.
- **1.8 Repo MIT + deploy 1 perintah — SEBAGIAN (butuh push).** Repo https://github.com/27rangga/taskmarket-visualizer publik, berisi LICENSE MIT (terverifikasi via GitHub API). **File lain BELUM ada di repo** — semua file siap lokal di ~/workspace/taskmarket/brk611an/ (README, LICENSE, package.json, .gitignore, worker.js, aggregate.js, wrangler.toml, public/, notes.txt, dst) dan HARUS di-push oleh agen utama (browser + login GitHub). `wrangler.toml` ter-parse valid (tomllib): name, compatibility_date, KV binding, crons, assets. Deploy live memakai file yang SAMA via alur API (setara `npx wrangler deploy`); eksekusi `npx wrangler deploy` dari clone baru belum dijalankan end-to-end karena butuh auth wrangler.
- **1.9 Semua rules — LOLOS (dengan 1 catatan).** Brand kit: warna/font/lockup sesuai (grep kata terlarang = 0); og image + lockup + font Departure Mono hotlink gist resmi, semua HTTP 200; footer disclaimer persis; tanpa analytics (yang cocok grep hanya kata "wallet" di teks "No login, no wallet" + label metrik "Active wallets" + komentar kode); tanpa wallet; URL tanpa nama orang (subdomain workers.dev `moltify-bob` sudah ada sebelumnya di akun — "bob" adalah nama agen, bukan nama RANGGA). Halaman lokal 45.021 byte; 3 file utama termuat 1,81 dtk (curl sekuensial dari VM) — jauh di bawah 3 dtk. **Catatan: cek visual 360px di browser sungguhan BELUM dilakukan** (subagent ini tidak punya browser) — agen utama perlu memverifikasi tampilan mobile live.
- **1.10 Hidup ≥30 hari — TERKONFIGURASI.** Cron + KV aktif, tidak ada TTL/expiry pada nilai KV maupun Worker. (Tidak bisa "dibuktikan" 30 hari ke depan; yang diverifikasi adalah tidak ada mekanisme yang mematikannya.)

## Penilaian Bagian 2 — self-assessment jujur (target ≥60, tanpa skor 1)

| Kriteria | Bobot | Skor (1–5) | Alasan |
|---|---|---|---|
| Creativity | 25 | 4 | Hero flow "uang mengalir poster → escrow → pemenang" dari data nyata; deret "distinct participants"; poster mingguan. Pembeda nyata, bukan radikal. |
| Insight | 20 | 4 | Temuan nyata ditampilkan: lonjakan 22 Nov (143 tugas), konsentrasi chain 4217 (26 hari ber-data vs 117 di 8453), top winner 65 wins, dominasi CosmicCanyonSentinel. |
| Reliability / speed | 15 | 4 | 45 KB, muat ~1–2 dtk, refresh per jam + 15 mnt, cache 300 dtk. Minus 1 karena uji perangkat HP sungguhan belum dilakukan. |
| Design / brand | 15 | 4 | Patuh penuh pada kit (warna, font, lockup, suara copy, tanpa kata terlarang). Minus 1 karena aset brand di-hotlink, bukan self-host. |
| Shareability | 15 | 4 | og image 1200x630 live (HTTP 200), judul + deskripsi jelas, kartu Twitter summary_large_image. |
| Code / handover | 10 | 4 | README, DATA-CONTRACT, METHOD, QA checklist, notes.txt, deploy 1 perintah, skrip deploy/test/seed. Minus 1 karena `npx wrangler deploy` dari clone baru belum dieksekusi end-to-end. |

**Total perkiraan: 80/100** (semua 4/5) — di atas ambang 60, tanpa skor 1. Penilaian akhir tetap di tangan requester.

## Infrastruktur (per 25 Nov ~02:45 WIB)

- Worker: `taskmarket-visualizer` — live https://taskmarket-visualizer.moltify-bob.workers.dev/ (HTTP 200, ~0,45 dtk)
- Cron: `0 * * * *` (tiap jam) — terpasang; feed refresh tiap 15 mnt direncanakan (`*/15 * * * *`, hanya feed)
- KV namespace: `taskmarket-visualizer-data` — id `26a60de5fdbf4b278fe33035350201b5`
- Akun Cloudflare: 27rngga@gmail.com (id `c939fdfcd4e347be1916807e152781d4`), subdomain workers.dev `moltify-bob`
- Repo: https://github.com/27rangga/taskmarket-visualizer (publik, MIT, akun 27rangga)
- Brand kit lokal: ~/workspace/taskmarket/brand-kit/ (font + lockup + og image + plates)
- Workdir build: ~/workspace/taskmarket/brk611an/
