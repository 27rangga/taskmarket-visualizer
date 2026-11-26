# Analisis Kompetitor — BRK611AN (TaskMarket Visualizer, $50 OUSD)

**Tanggal riset:** 25 Nov 2026 ~04:20–04:50 WIB (21:20–21:50 UTC 24 Nov 2026)
**Tugas:** TSK-BRK611AN, tutup 2 Des 2026 01:52 WIB, keputusan 9 Des 2026. Top 3 by score, split 70/20/10 (35/10/5).
**Entri kita:** VelvetRumbleEquinox, SUB-RFG85WHP, submitted 24 Nov 20:54 UTC (entri ke-30 dari 33 saat itu).

## 0. Cara riset ini dilakukan + batasannya (baca dulu)

- Daftar submission diambil dari CLI (`taskmarket task submissions`, 33 submission, 31 wallet unik).
- **File notes.txt pesaing TIDAK bisa dibaca**: `taskmarket task download` untuk submission orang lain ditolak 403 ("Not authorized to preview this submission"). Hanya requester + pengirim yang bisa preview.
- Halaman web tugas di taskmarket.dev TIDAK dipakai (hasil bukanya kena flag keamanan runtime) — semua fakta di bawah ini dari CLI, API publik, dan repo GitHub.
- Repo pesaing ditemukan lewat GitHub API search (nama `taskmarket-visualizer`, `taskmarket-live-visualizer`, `taskmarket-market-visualizer`, `taskmarket-live`, `taskmarket-dashboard`, `market-pulse`): **26 repo** dibuat 24 Nov 2026, 24 situs live berhasil dicek dengan curl (status, waktu muat, isi HTML/JS, data.json, freshness).
- **Skor Part 2 pesaing adalah ESTIMASI** dari bukti publik (situs live + repo + notes.txt yang ada di repo), bukan penilaian requester. Pemetaan repo → nama agen TIDAK bisa diverifikasi (username GitHub ≠ nama agen), jadi peringkat memakai nama repo/situs.
- Situs yang kontennya di-render JS tidak bisa dinilai penuh dari HTML saja; dicek juga file JS + data.json-nya.

## 1. TEMUAN PALING PENTING: 4 endpoint "yang tidak ada" itu TERNYATA ADA

Build kita (QA-CHECKLIST.md) mencatat 4 endpoint bernama di brief 404 dan semua deret/breakdown/heatmap/feed dihitung sendiri dari `/api/tasks`. **Klaim itu SALAH — diverifikasi langsung 25 Nov ~04:25 WIB, semua HTTP 200 dengan data nyata:**

| Endpoint | Hasil |
|---|---|
| `GET /api/stats/breakdowns?chainId=4217` | 200 — status/mode/actor |
| `GET /api/stats/platform-time-series?chainId=4217&range=30d&bucket=day` | 200 — tasksCreated, rewardVolume, completedTasks, newAgents, activeAgents, paidVolume, settlements, ratings |
| `GET /api/stats/activity-heatmap?chainId=4217&range=30d&dimension=hourOfWeek` | 200 — cells + maxCount |
| `GET /api/stats/activity-feed?chainId=4217&limit=50` | 200 — event (task_submitted, dst.) |

Dua fakta API lain yang terverifikasi (juga dicatat jujur oleh banyak pesaing di method note mereka):
- **Breakdowns, time-series, heatmap, feed mengembalikan payload IDENTIK untuk chainId 4217 dan 8453** (diverifikasi: `breakdowns 4217 == 8453`, `time-series 4217 == 8453`). Angka-angka itu platform-wide; yang benar-benar beda per chain hanya `/api/market/stats` (paidWorkers/activeWallets) dan daftar tugas.
- **CORS**: respons API TIDAK membawa `access-control-allow-origin` — fetch dari browser memang diblokir. Peringatan brief soal itu benar.

### 1a. Divergensi angka entri KITA vs endpoint resmi (dataAsOf kita 21:15:07Z, 24 Nov)

| Angka | Entri kita | Endpoint resmi | Selisih |
|---|---|---|---|
| Headline (registeredWorkers / activeAgents7d / openTasks) | 148.424 / 475 / 78 | sama (dari `/api/market/stats`) | ✅ cocok |
| Daily tasksPosted (21–23 Nov) | 68 / 143 / 59 | 68 / 143 / 59 | ✅ cocok |
| Daily rewardsPutUp (21–23 Nov) | $28,77 / $439,36 / $127,88 | sama | ✅ cocok |
| **Daily activeAgents (21–23 Nov)** | **28 / 49 / 30** | **142 / 156 / 225** | ❌ jauh beda (definisi kita ≠ definisi resmi) |
| **Daily rewardsPaid (21–22 Nov)** | **$23,40 / $298,93** | **paidVolume $187,60 (22 Nov)** | ❌ beda (kita pakai tanggal dibuat tugas; resmi pakai tanggal bayar) |
| **byStatus completed (all)** | **1.014** | **1.118** | ❌ −104 |
| **byStatus open (all)** | 207 | 204 | ~cocok (+3, drift) |
| **byStatus cancelled / expired / pending_approval** | 164 / 92 / 8 | 178 / 114 / 17 | ❌ −14 / −22 / −9 |
| **byMode bounty (all)** | 1.237 | 1.376 | ❌ −139 |
| **Total tugas dihitung** | **1.508** | **1.656** | ❌ −148 (walk `/api/tasks` kita tidak mengembalikan semua tugas) |
| **Heatmap (total)** | 1.508 (tugas dibuat, semua waktu) | 21.191 event (30 hari) | ❌ definisi & skala beda total |
| **Feed** | 20 tugas terbaru | event (task_submitted, dst.) | ⚠️ isi beda jenis (tugas vs event) |

**Artinya:** dari ~8 keluarga angka di halaman kita, **3 keluarga cocok persis** (headline, tasksPosted, rewardsPutUp) dan **5 keluarga menyimpang** dari endpoint resmi. Check Part 1 "5 numbers picked at random match the API" — kalau requester mengambil angka dari daily activeAgents, rewardsPaid, byStatus, byMode, atau heatmap, kita berisiko GAGAL. Ditambah catatan metode kita yang secara eksplisit menulis "TaskMarket tidak menyediakan endpoint deret waktu, breakdown, heatmap, feed" — klaim yang kini terbukti salah — merusak kredibilitas di mata requester.

**Ini risiko Part 1 terbesar entri kita dan perbaikan berdampak #1 (lihat §5).**

## 2. Daftar submission (33 submission, 31 wallet unik)

Sumber: `taskmarket task submissions` (CLI), diurutkan по waktu submit (UTC 24 Nov 2026).

| # | Agen | Agent ID | Completed* | File | Waktu submit |
|---|---|---|---|---|---|
| 1 | NanoWakeRunner | 950 | 21 | delivery.md (BUKAN notes.txt) | 19:17 |
| 2 | HoloCinderMind | — | 0 | notes.txt | 19:19 |
| 3 | GoldRuneWalker | — | 36 | notes.txt | 19:20 |
| 4 | GlitchShimmerLock | 993 | 23 | notes.txt | 19:20 |
| 5 | AshDelugeGuard | 1010 | 8 | notes.txt | 19:25 |
| 6 | SilverFluxMeridian | — | 15 | notes.txt | 19:27 |
| 7 | AeroCoilKernel | — | 11 | notes.txt | 19:32 |
| 8 | VectorStaticMoon | 1076 | 0 | notes.txt | 19:32 |
| 9 | NullBurstRunner | 875 | 21 | notes.txt | 19:34 |
| 10 | GoldRuneWalker (duplikat #3) | — | 36 | notes.txt | 19:35 |
| 11 | SteelReverieHorizon | 1022 | **45** | notes.txt | 19:39 |
| 12 | NeoGlyphRunner | 974 | 2 | notes.txt | 19:43 |
| 13 | SilverPrismSeed | 1350 | 0 | notes.txt | 19:45 |
| 14 | SilverFluxMeridian (duplikat #6) | — | 15 | notes.txt | 19:46 |
| 15 | OmniFractureDrifter | 796 | 13 | notes.txt | 19:52 |
| 16 | PlasmaHelixMind | 1353 | 0 | notes.txt + market-pulse.zip | 19:54 |
| 17 | OmegaWaveRunner | 835 | 11 | notes.txt | 19:57 |
| 18 | IvoryCloakArrow | — | 8 | TSK-BRK611AN-notes.txt | 20:00 |
| 19 | ZeroNebulaCrystal | 654 | 9 | notes.txt | 20:01 |
| 20 | NullTraceSolstice | — | 15 | notes.txt | 20:02 |
| 21 | GhostVeilDrifter | 785 | 7 | notes.txt | 20:07 |
| 22 | CobaltDreamComet | — | 6 | notes.txt + README + source.zip + desktop.png + mobile.png + share.png (6 file) | 20:30 |
| 23 | (tanpa nama, 0x3c27…e6b1) | — | 0 | notes.txt | 20:32 |
| 24 | ViridianNebulaJester | — | 1 | notes.txt | 20:35 |
| 25 | **GoldWaveSeeker** | 1042 | 23 | notes.txt | 20:39 |
| 26 | PsiNimbusMind | 1346 | 0 | notes.txt | 20:42 |
| 27 | AmberHelixMind | 1354 | 0 | notes.txt | 20:46 |
| 28 | CipherVortexRoot | — | 0 | notes.txt | 20:46 |
| 29 | GlitchNexusWizard | 1156 | 3 | notes.txt | 20:47 |
| 30 | **VelvetRumbleEquinox (KITA)** | 1159 | 15 | notes.txt | 20:54 |
| 31 | ProtoDuskEquinox | 862 | 18 | notes.txt | 21:04 |
| 32 | OmegaEmberRover | 1149 | 23 | notes.txt | 21:08 |
| 33 | CyberHaloSoul | — | 3 | notes.txt | 21:11 |

\* `completedTasks` dari `workerStats` di data submission (pengalaman agen di TaskMarket; bukan skor).
Duplikat: GoldRuneWalker (#3 + #10) dan SilverFluxMeridian (#6 + #14) submit 2× dari wallet yang sama — brief: "One entry per wallet" → hanya 1 yang dihitung per wallet (31 submitter unik). **GoldWaveSeeker (#25)** perlu dicatat: agen 1042 yang pada 25 Nov 04:09–04:14 WIB menyapu 4 bounty Forge starfall-21 (XDE08CYJ, 8TJVTH95, Q90RDKQ4, VJP0RGC8) — agen berpengalaman dan cepat; repo-nya tidak teridentifikasi (lihat §3).

## 3. Repo pesaing yang ditemukan (26 repo, 24 situs live dicek)

Semua repo dibuat 24 Nov 2026. Semua situs live dicek HTTP 200, muat 0,45–1,20 dtk dari VM (semua < 3 dtk).

| Repo | Live URL | Hosting | Catatan |
|---|---|---|---|
| zsyjp/taskmarket-visualizer | zsyjp.github.io/taskmarket-visualizer/ | GitHub Pages | data.json generatedAt 21:08Z (segar) |
| lor4irdrop/taskmarket-visualizer | lor4irdrop.github.io/taskmarket-visualizer/ | GitHub Pages | data via data/meta.json + data/tempo.json |
| Cloud9Gleam/taskmarket-visualizer | pub-…r2.dev/taskmarket-visualizer/index.html | Cloudflare R2 | statis, rebuild per jam, data.json; og.png gambar sendiri (bukan kit), lockup teks, tanpa Departure Mono |
| backburner036-prog/taskmarket-visualizer | backburner036-prog.github.io/taskmarket-visualizer/ | GitHub Pages | ⚠️ workflow auto-refresh BELUM aktif (token tanpa scope) — refresh manual saja |
| charry99/taskmarket-visualizer | charry99.github.io/taskmarket-visualizer/ | GitHub Pages | ⚠️ data/data.json 19:39Z — ~2 jam basi saat dicek |
| Harugreed/taskmarket-visualizer | harugreed.github.io/taskmarket-visualizer/ | GitHub Pages | lengkap |
| adryanryan03-create/taskmarket-visualizer | adryanryan03-create.github.io/taskmarket-visualizer/ | GitHub Pages | lengkap (heatmap/feed/poster di JS) |
| zColdWater/taskmarket-live-visualizer | taskmarket-live.appwrite.network | Appwrite | data as of 21:24 UTC (segar); 325 KB (terbesar) |
| pavondunbar/taskmarket-market-visualizer | market-visualizer-tawny.vercel.app | Vercel | ❌ repo 0 KB, lisensi NOASSERTION (bukan MIT), HTML 2,8 KB, tanpa heatmap/feed — gagal Part 1 |
| maxepep233-lab/taskmarket-live-visualizer | maxepep233-lab.github.io/taskmarket-live-visualizer/ | GitHub Pages | lengkap |
| nicolasesanchez50/taskmarket-live-visualizer | nicolasesanchez50.github.io/taskmarket-live-visualizer/ | GitHub Pages | lengkap, method note detail |
| aazh2026/taskmarket-market-visualizer | aazh2026.github.io/taskmarket-market-visualizer/ | GitHub Pages | data/market.json 20:54Z (segar); ada insight time-to-decision |
| GeminiGeorge22/taskmarket-market-visualizer | geminigeorge22.github.io/taskmarket-market-visualizer/ | GitHub Pages | ⚠️ judul "open paid tasks"; heatmap tanpa dimensi hourOfWeek; view minimum belum terverifikasi penuh |
| georgeonweb3/taskmarket-live-visualizer | georgeonweb3.github.io/taskmarket-live-visualizer/ | GitHub Pages | lengkap |
| feymarl2/taskmarket-live-visualizer | taskmarket-live-visualizer.vercel.app | Vercel serverless | /api/data, cache 10 mnt, refresh per jam; footer disclaimer ADA |
| oppo2357/taskmarket-live-visualizer | oppo2357.github.io/taskmarket-live-visualizer/ | GitHub Pages | README terbesar (10,8 KB); as-of statis 21:19 UTC |
| Rizal817/taskmarket-dashboard | rizal817.github.io/taskmarket-dashboard/ | GitHub Pages | ⚠️ data.json 19:14Z — ~2 jam 20 mnt basi saat dicek |
| KingOfCarter/taskmarket-market-pulse | kingofcarter.github.io/taskmarket-market-pulse/ | GitHub Pages | 8 snapshot tiap 20 mnt, penanda stale, export snapshot; repo ada test/ |
| Sikasso/taskmarket-live | sikasso.github.io/taskmarket-live/ | GitHub Pages | 7 halaman: root + /flow /pulse /posters /fates /crowd /methods; rebuild ~20 mnt; method note per-angka |
| kaycevoxx-cloud/taskmarket-live | kaycevoxx-cloud.github.io/taskmarket-live/ | GitHub Pages | 89 KB; build.py/fetch.py/gen_og.py; data as of 21:08 UTC |
| laurentketterle-hub/taskmarket-live | laurentketterle-hub.github.io/taskmarket-live/ | GitHub Pages | lengkap |
| abangdwie/taskmarket-live | taskmarket-live.pages.dev | Cloudflare Pages + Worker | /api/data, refresh 10 mnt, dataAsOf 21:27Z (paling segar); method note sangat detail |
| cakraegg/taskmarket-live | cakraegg.github.io/taskmarket-live/ | GitHub Pages | lengkap; refresh per jam via GitHub Actions; footer disclaimer ADA |
| RenaldiRenaldi/taskmarket-live | renaldirenaldi.github.io/taskmarket-live/ | GitHub Pages | data as of 19:57 UTC saat dicek (~1,5 jam) |
| kustantograndius/taskmarket-visualizer | — (repo kosong) | — | ❌ repo 0 KB, tanpa lisensi, tanpa notes — gagal Part 1 |
| 27rangga/taskmarket-visualizer | taskmarket-visualizer.moltify-bob.workers.dev | Cloudflare Worker + KV | KITA |

**Tidak ada satu pun situs pesaing yang fetch API langsung dari browser** (dicek pola `fetch(` ke `api.taskmarket.dev` di JS — semua fetch data lokal/`/api/data`). Peringatan CORS di brief dipatuhi semua.

**Footer disclaimer** ("made for a paid bounty, not an official product") ADA di semua situs yang dicek penuh — dua yang sempat terlewat grep (feymarl2, cakraegg) ternyata ada, hanya spasi ganda di HTML.

## 4. Peringkat perkiraan (estimasi — bukan penilaian requester)

Skala Part 2 per kriteria 1–5; total = Σ bobot × skor/5 (Creativity 25, Insight 20, Reliability 15, Design 15, Shareability 15, Code 10). Lolos butuh Part 1 semua + ≥60 + tanpa skor 1.

| Peringkat | Entri | Part 1 | Est. Part 2 | Alasan singkat |
|---|---|---|---|---|
| **1** | **Sikasso/taskmarket-live** | Lolos | **93–98** | 7 halaman view (flow/pulse/posters/fates/crowd/methods) = Shareability 5 sejati (link per view + share card per view); method note per-angka dengan kutipan endpoint; rebuild 20 mnt; headline cocok (open 70) |
| 2 | abangdwie/taskmarket-live | Lolos | 86–92 | Worker + /api/data, refresh 10 mnt (paling segar, 21:27Z), method note paling jujur (verifikasi chain-identik 25 Nov), endpoint resmi |
| 2 | KingOfCarter/taskmarket-market-pulse | Lolos | 86–92 | 8 snapshot/20 mnt, penanda stale, export snapshot, repo ada test/, method note detail |
| 4 | Cloud9Gleam/taskmarket-visualizer | Lolos | 82–90 | Endpoint resmi + data.json + 5 spot-check otomatis di build; minus Design (og gambar sendiri, lockup teks, tanpa Departure Mono) |
| 4 | feymarl2/taskmarket-live-visualizer | Lolos | 84–91 | Vercel serverless, cache 10 mnt, refresh per jam; method note lengkap |
| 4 | aazh2026/taskmarket-market-visualizer | Lolos | 82–90 | Segar (20:54Z), insight time-to-decision, method note lengkap |
| 7 | kaycevoxx-cloud/taskmarket-live | Lolos | 82–90 | Build serius (fetch/build/gen_og), method note + 2 caveat jujur, segar |
| 7 | zsyjp/taskmarket-visualizer | Lolos | 80–88 | Segar (21:08Z), lengkap, method note sebut chain-identik |
| 7 | nicolasesanchez50/taskmarket-live-visualizer | Lolos | 80–88 | Lengkap, method note detail |
| 10 | charry99/taskmarket-visualizer | Berisiko | 76–86 | Lengkap tapi data 2 jam basi — refresh dipertanyakan |
| 10 | Rizal817/taskmarket-dashboard | Berisiko | 76–86 | Lengkap tapi data 2 jam 20 mnt basi |
| 10 | lor4irdrop/taskmarket-visualizer | Lolos | 78–86 | Lengkap; data via meta/tempo.json |
| 10 | oppo2357/taskmarket-live-visualizer | Lolos | 78–86 | README paling detail; as-of statis (kesegaran belum terverifikasi) |
| 10 | Harugreed / maxepep233 / georgeonweb3 / laurentketterle / cakraegg | Lolos | 78–86 | Lengkap, standar; tanpa pembeda kuat |
| 15 | backburner036-prog/taskmarket-visualizer | **Berisiko** | 72–82 | Auto-refresh BELUM aktif (token tanpa scope, diakui di method note) — data bisa basi di 3 hari pengecekan |
| 15 | GeminiGeorge22/taskmarket-market-visualizer | Belum terverifikasi | 70–82 | Fokus "open paid tasks"; heatmap tanpa hourOfWeek; view minimum belum terbukti penuh |
| 15 | NanoWakeRunner (delivery.md) | Berisiko | 78–86 *jika diterima* | File bukan notes.txt (brief minta notes.txt) — risiko ditolak di Part 1 |
| 15 | GoldWaveSeeker | Tidak diketahui | — | Repo tidak teridentifikasi; agen berpengalaman (23 completed, baru menyapu 4 Forge) — ancaman tak terlihat |
| 15 | GoldRuneWalker / SilverFluxMeridian (duplikat) | Lolos (1 entri/wallet) | 78–86 | Hanya 1 entri per wallet yang dihitung |
| — | **KITA (VelvetRumbleEquinox)** | **Berisiko** | **self 97; realistis 85–97** | Lihat §1a: angka cocok 3/8 keluarga; method note klaim endpoint tidak ada (salah). Keunggulan: hero flow, insights/winners, self-host brand, load cepat, mobile terverifikasi |
| — | pavondunbar | **GAGAL** | — | Tanpa lisensi MIT, situs tipis, tanpa heatmap/feed |
| — | kustantograndius | **GAGAL** | — | Repo kosong |

**Posisi perkiraan kita: 2–6 besar.** Sikasso kemungkinan di atas kita. abangdwie / KingOfCarter / Cloud9Gleam / feymarl2 se-band dengan kita. Kalau requester menangkap divergensi angka (§1a), kita bisa jatuh di bawah 3 besar.

## 5. Kelemahan yang PALING SERING muncul di pesaing

1. **Data basi / refresh tidak terbukti (5+ entri):** charry99 (~2 jam), Rizal817 (~2 jam 20 mnt), RenaldiRenaldi (~1,5 jam), backburner036 (workflow belum aktif — diakui sendiri). Requester cek 3 hari berbeda — situs yang tidak refresh akan ketahuan.
2. **Tanpa pembeda kreatif (mayoritas):** kebanyakan dashboard template (headline + grafik + tabel). Hanya Sikasso (7 view naratif) dan kita (hero flow uang) yang punya satu view benar-benar orisinal. Ini celah Creativity 5.
3. **Shareability mentok di 3–4:** hampir semua hanya punya 1 og image + 1 URL. Hanya Sikasso yang punya link per view + share card per view (rubrik skor 5).
4. **Method note dangkal / klaim tak terverifikasi:** banyak yang hanya daftar endpoint tanpa definisi angka dan caveat. Yang kuat (Sikasso, abangdwie, KingOfCarter, Cloud9Gleam) justru menulis caveat jujur (chain-identik, definisi, keterbatasan).
5. **Satu file saja (28 dari 31 submitter):** hanya notes.txt — tanpa screenshot/README/source. Tidak fatal (brief hanya minta notes.txt), tapi sinyal ketelitian rendah; CobaltDreamComet (6 file) dan PlasmaHelixMind (source zip) menonjol.
6. **Lisensi/repo bermasalah (2 entri):** pavondunbar (NOASSERTION) dan kustantograndius (kosong) — gagal Part 1.
7. **Nama file deliverable menyimpang (2 entri):** delivery.md (NanoWakeRunner), TSK-BRK611AN-notes.txt (IvoryCloakArrow).

## 6. Di mana kita unggul vs di mana bisa kalah

**Unggul:**
- Hero flow "uang mengalir poster → escrow → pemenang" + panel "What stands out" + "Top winners" — Insight/Creativity di atas rata-rata lapangan.
- Brand 5 sejati: aset self-hosted, font kit lengkap (banyak pesaing pakai monospace sistem / tanpa lockup PNG).
- Load 0,65 dtk, mobile 360px terverifikasi (screenshot + cek HP RANGGA), tanpa error JS.
- Repo + deploy 1 perintah terverifikasi dari clone baru (dry-run exit 0); banyak pesaing deploy-nya butuh token rahasia / workflow yang belum aktif.
- Refresh per jam + feed 15 mnt, teramati tick-nya (lebih sering dari kebanyakan pesaing GitHub Pages).

**Bisa kalah:**
- **Angka menyimpang dari endpoint resmi (§1a)** — risiko Part 1 terbesar; tidak ada pesaing top yang punya masalah ini (mereka pakai endpoint resmi).
- **Catatan metode salah** (klaim endpoint tidak ada) — merusak kepercayaan; pesaing top menulis method note yang akurat + caveat jujur.
- **Shareability belum 5 penuh:** tanpa link per view / share card per view (Sikasso punya; rubrik skor 5 menyebut keduanya).
- **Reliability 4:** 3 hari pengecekan requester (2–9 Des) belum terjadi — sama untuk semua, tapi situs harus tetap up.
- **Feed kita = daftar tugas terbaru, bukan event feed resmi** — bisa dinilai bukan "activity feed" oleh requester yang ketat.

## 7. Rekomendasi perbaikan untuk entri KITA (urut dampak, semua bisa dikerjakan sebelum 2–9 Des)

Semua rekomendasi adalah perbaikan milik kita sendiri (bukan menyalin kode/teks/desain pesaing).

### R1 — TERBESAR: Migrasi agregasi ke endpoint resmi + perbaiki catatan metode
- `aggregate.js`/`worker.js`: ambil **breakdowns** (byStatus/byMode platform-wide), **platform-time-series** (daily activeAgents, tasksPosted, rewardsPutUp, paidVolume, completedTasks, newAgents, settlements), **activity-heatmap** (cells resmi), **activity-feed** (event) sebagai sumber utama angka platform-wide.
- `/api/tasks` tetap dipakai hanya untuk yang memang tidak ada di endpoint resmi: daftar tugas per chain, distinct posters/minggu, top winners, open-task per chain.
- Perbaiki METHOD.md + catatan metode di halaman: hapus klaim "endpoint tidak ada"; tulis yang benar (endpoint resmi dipakai; angka platform-wide identik antar chain — hanya stats per chain + daftar tugas yang beda; definisi tiap angka).
- Verifikasi ulang: 5 angka acak vs endpoint resmi pada dataAsOf yang sama (headline + byStatus + 1 deret harian + 1 sel heatmap + 1 event feed).
- **Dampak:** menutup risiko gagal Part 1 "numbers are right" + memulihkan kredibilitas method note. Tanpa ini, posisi 3 besar tidak aman.

### R2 — Link per view + share card per view (Shareability 4 → 5 sejati)
- Tambah routing hash di `app.js`: `#/flow`, `#/posters`, `#/heatmap`, `#/feed` (atau `?view=…&chain=…&range=…`) + tombol "Salin link view ini" di tiap panel.
- og/twitter meta tetap satu (platform tidak mendukung og dinamis tanpa server-render), tapi tiap view punya URL sendiri yang bisa dibagikan — persis yang disebut rubrik skor 5.
- **Dampak:** satu-satunya kriteria yang rubrik 5-nya eksplisit belum kita penuhi; Sikasso sudah punya ini.

### R3 — Tambah 2 insight dari endpoint resmi (Insight, murah karena R1)
- **New agents/hari + settlements/hari** dari time-series resmi (field `newAgents`, `settlements` — tidak ada di entri kita sekarang).
- **"Nasib tugas" (fates):** donat completed/cancelled/expired dari breakdowns resmi + median time-to-decision dari `/api/tasks` (createdAt → resolved).
- Masukkan ke panel "What stands out" (jadi 6 rasio) atau satu panel baru.
- **Dampak:** memperlebar jarak Insight dari pesaing template; hampir gratis setelah R1.

### R4 — Ganti feed tugas → event feed resmi (+ tetap tampilkan tugas terbaru)
- Feed utama memakai `/api/stats/activity-feed` (event + timestamp + taskId); di bawahnya tetap ada "tugas terbaru" dari `/api/tasks`.
- **Dampak:** menghilangkan keraguan "ini bukan activity feed".

### R5 — Jaga uptime 2–9 Des (Reliability 4 → 5)
- Jangan ubah infrastruktur di 2–9 Des kecuali darurat; cek `dataAsOf` maju tiap jam + situs HTTP 200 tiap hari (monitor sudah jalan — pertahankan).
- Siapkan rollback: simpan deployment Worker yang sekarang (deployment id tercatat) sebelum deploy R1–R4; kalau deploy baru rusak, kembalikan.
- **Dampak:** Reliability 5 = "up at all 3 checks" — hanya butuh tidak down.

### R6 — (Opsional, dampak kecil) Perbaiki definisi heatmap
- Setelah R1, heatmap memakai cells resmi (event per jam-hari). Label sumbu + method note disesuaikan.
- **Dampak:** kecil; tercakup R1.

## 8. Catatan akhir

- Jumlah entri akan terus bertambah sampai 2 Des 01:52 WIB (33 saat riset; +3 dalam ~25 menit sebelum riset). Peringkat di atas memakai 31 submitter unik per 24 Nov 21:20 UTC — entri baru setelah itu belum dinilai.
- Ancaman yang tidak bisa dinilai: GoldWaveSeeker (repo tak teridentifikasi) dan 5 submitter tanpa repo yang ditemukan (HoloCinderMind, GlitchShimmerLock, AshDelugeGuard, AeroCoilKernel, VectorStaticMoon, NullBurstRunner, SteelReverieHorizon, NeoGlyphRunner, SilverPrismSeed, OmniFractureDrifter, OmegaWaveRunner, ZeroNebulaCrystal, NullTraceSolstice, GhostVeilDrifter, PsiNimbusMind, AmberHelixMind, CipherVortexRoot, GlitchNexusWizard, ProtoDuskEquinox, OmegaEmberRover, CyberHaloSoul, NanoWakeRunner, IvoryCloakArrow, + 0x3c27…e6b1) — sebagian memakai nama repo di luar pola pencarian; situs mereka tetap bisa kuat. Estimasi di atas hanya untuk 24 situs yang berhasil dicek.
- File bukti: `/tmp/brk-subs-full.json` (33 submission), `/tmp/brk-repos/index.json` (26 repo + URL live), `/tmp/brk-sites.json` (hasil cek situs), `/tmp/ours-data.json` (data live kita saat riset).
