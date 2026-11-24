// aggregate.js — logika agregasi data TaskMarket (dipakai worker.js DAN test-pipeline.mjs).
// Satu-satunya sumber kebenaran untuk bentuk /api/data. Jangan duplikasi logika ini.
//
// FAKTA API (dikoreksi 25 Nov 2026 ~04:50 WIB — klaim lama "4 endpoint tidak ada"
// SALAH: path yang dicoba saat build awal adalah /api/market/..., padahal path
// benar adalah /api/stats/... — keempat endpoint ADA dan HTTP 200):
// - GET /api/market/stats — headline (mendukung ?chainId=4217|8453).
// - GET /api/stats/breakdowns — tasks by status, mode, actor type.
// - GET /api/stats/platform-time-series?range=all&bucket=day — deret harian
//   (tasksCreated, rewardVolume, completedTasks, newAgents, activeAgents,
//   paidVolume, settlements, ratings).
// - GET /api/stats/activity-heatmap?range=all&dimension=hourOfWeek — heatmap
//   aktivitas (cells: {row, col, count, volume}).
// - GET /api/stats/activity-feed?limit=..&cursor=.. — event feed (maks limit 50).
// - GET /api/tasks — daftar tugas (cursor pagination, limit 100).
// - PENTING: breakdowns, time-series, dan heatmap MENGABAIKAN chainId —
//   ketiganya selalu mengembalikan angka PLATFORM-WIDE (terverifikasi: respons
//   ?chainId=4217, ?chainId=8453, dan tanpa chainId identik persis). Jadi angka
//   scope "all" diambil dari endpoint resmi, sedangkan angka PER-CHAIN tetap
//   dihitung dari /api/tasks (satu-satunya sumber yang memisah per chain).
// - /api/tasks hanya mengembalikan tugas sejak 2026-07-05 (terverifikasi
//   25 Nov 2026: walk penuh = 1.518 tugas, paling awal 2026-07-05T03:31Z,
//   sedangkan breakdowns/time-series total 1.663/1.664 tugas; tugas pertama
//   di API 4 Jun 2026 menurut time-series, bucket deret dimulai 26 Feb 2026).
//   Jadi angka per-chain mencakup jendela daftar tugas (5 Jul 2026–),
//   sedangkan angka "all" resmi mencakup semua waktu (Jun 2026–).
// - Heatmap resmi menghitung EVENT aktivitas (task dibuat, submission,
//   settlement, rating, ...), BUKAN tugas: total range=all 54.726 event vs
//   1.518 tugas. Baris heatmap resmi 0=Minggu (konvensi JS getDay —
//   dibuktikan: sel tersibuk feed 7 hari terakhir (baris 2, jam 6) sama persis
//   dengan sel tersibuk heatmap resmi; korelasi 0,507 vs 0,170 untuk
//   konvensi 0=Senin). Di sini dipetakan ke baris 0=Senin untuk frontend.
// - Feed resmi: limit maksimum 50 (limit=100 -> HTTP 400).
// - Reward dalam satuan terkecil 6 desimal: netReward "5000000" = $5,00.
// - Tempo (4217) = OUSD, Base (8453) = USDC. Jangan dijumlah lintas mata uang
//   tanpa catatan; angka gabungan "all" adalah penjumlahan nominal dolar.

export const CHAINS = ["4217", "8453"];
export const MODES = ["bounty", "claim", "pitch", "benchmark", "auction"];

/** Satuan terkecil 6 desimal -> dolar, 2 desimal. */
export function toDollars(minor) {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / 1e6) * 100) / 100;
}

/** "2026-11-24T19:01:51.116Z" -> "2026-11-24" (UTC). */
export function dateOf(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

/** 0 = Senin .. 6 = Minggu (UTC). */
export function weekdayOf(iso) {
  const d = new Date(iso).getUTCDay(); // 0=Minggu
  return (d + 6) % 7;
}

/** Jam UTC 0-23. */
export function hourOf(iso) {
  return new Date(iso).getUTCHours();
}

/** Senin dari minggu yang memuat tanggal tsb (UTC), "YYYY-MM-DD". */
export function weekStartOf(iso) {
  const d = new Date(dateOf(iso) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - weekdayOf(iso));
  return d.toISOString().slice(0, 10);
}

/** Judul feed: 80 karakter pertama description, tanpa newline. */
export function feedTitle(description) {
  return String(description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Ringkas satu task mentah dari API ke bentuk yang disimpan di KV (tasks:index). */
export function compactTask(t) {
  return {
    id: t.id,
    referenceCode: t.referenceCode,
    createdAt: t.createdAt,
    chainId: String(t.chainId),
    mode: t.mode || "unknown",
    status: t.status || "unknown",
    reward: t.reward ?? null,
    netReward: t.netReward ?? t.reward ?? "0",
    requester: t.requester || null,
    requesterDisplayName: t.requesterDisplayName || null,
    submissionCount: Number(t.submissionCount) || 0,
    awardCount: Number(t.awardCount) || 0,
    winner: t.primaryAward && t.primaryAward.workerAddress
      ? t.primaryAward.workerAddress
      : null,
    claimedBy: t.claimedBy || null,
    title: feedTitle(t.description),
  };
}

function emptyModeCounts() {
  const o = {};
  for (const m of MODES) o[m] = 0;
  return o;
}

function emptyDailyRow(date, chain) {
  return {
    date,
    chain,
    tasksPosted: 0,
    rewardsPutUp: 0,
    rewardsPaid: 0,
    submissions: 0,
    activeAgents: 0,
    posters: 0,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** [{status|mode, count}] -> {status|mode: count}. */
function breakdownMap(list) {
  const o = {};
  for (const e of list || []) {
    const k = e.status || e.mode || e.actorType;
    if (k != null) o[k] = Number(e.count) || 0;
  }
  return o;
}

/** Label tampil untuk tipe event activity-feed. */
export function eventLabel(type) {
  const map = {
    task_created: "task created",
    task_submitted: "submission",
    task_completed: "completed",
    task_settled: "settlement",
    settlement: "settlement",
    task_cancelled: "cancelled",
    task_claimed: "claimed",
    task_expired: "expired",
    worker_selected: "worker selected",
    rating: "rating",
  };
  if (map[type]) return map[type];
  return String(type || "event").replace(/_/g, " ");
}

/**
 * Petakan event activity-feed resmi ke bentuk feed /api/data, diperkaya dengan
 * detail tugas dari index (bila tugasnya dikenal) supaya mode/status/reward/
 * submissions tetap tampil. Event yang tugasnya tidak ada di index tetap
 * tampil dengan field tugas kosong (bukan dibuang).
 * @param {Array} events - items mentah /api/stats/activity-feed.
 * @param {Map} taskById - id (hex) -> compactTask.
 * @returns {Array} maksimal 20 item, terbaru dulu.
 */
export function buildFeedItems(events, taskById) {
  return (events || [])
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 20)
    .map((e) => {
      const t = (taskById && taskById.get(e.taskId)) || null;
      return {
        referenceCode: t ? t.referenceCode : null,
        title: e.taskTitle || (t ? t.title : "Untitled task"),
        eventType: e.type || null,
        event: eventLabel(e.type),
        mode: t ? t.mode : null,
        status: t ? t.status : null,
        chain: String(e.chainId ?? (t ? t.chainId : "")),
        reward: e.amount != null
          ? toDollars(e.amount)
          : t ? toDollars(t.netReward) : 0,
        requesterDisplayName: t ? t.requesterDisplayName : null,
        createdAt: e.timestamp,
        submissionCount: t ? t.submissionCount : 0,
        awardCount: t ? t.awardCount : 0,
      };
    });
}

/** Tugas completed terbaru (untuk panel flow) dari daftar tugas. */
export function latestCompletedItem(tasks) {
  let best = null;
  for (const t of tasks || []) {
    if (t.status !== "completed") continue;
    if (!best || t.createdAt > best.createdAt) best = t;
  }
  if (!best) return null;
  return {
    referenceCode: best.referenceCode,
    title: best.title,
    reward: toDollars(best.netReward),
    requesterDisplayName: best.requesterDisplayName,
    createdAt: best.createdAt,
  };
}

/**
 * Agregasi penuh.
 * @param {Array} tasks - task ringkas (compactTask), urutan apa pun.
 * @param {Object} statsAll - respons /api/market/stats tanpa chainId.
 * @param {Object} statsByChain - {"4217": {...}, "8453": {...}}.
 * @param {Object} official - {breakdowns, timeSeries, heatmap, feed} dari
 *   endpoint /api/stats/... (boleh null/parsial — bagian yang hilang memakai
 *   fallback hitungan dari /api/tasks, seperti sebelum migrasi).
 * @param {string} [asOfIso] - dataAsOf; default now.
 * @returns {Object} JSON persis kontrak /api/data (lihat DATA-CONTRACT.md).
 */
export function aggregate(tasks, statsAll, statsByChain, official, asOfIso) {
  const now = asOfIso || new Date().toISOString();
  const off = official || {};
  const chainStats = {};
  for (const c of CHAINS) {
    const s = statsByChain[c] || {};
    chainStats[c] = {
      registeredWorkers: Number(s.registeredWorkers) || 0,
      activeWorkers7d: Number(s.activeWorkers7d) || 0,
      activeAgents7d: Number(s.activeAgents7d) || 0,
      openTasks: Number(s.openTasks) || 0,
      paidWorkers: Number(s.paidWorkers) || 0,
      activeWallets: Number(s.activeWallets) || 0,
    };
  }

  const headline = {
    registeredWorkers: Number(statsAll.registeredWorkers) || 0,
    activeWorkers7d: Number(statsAll.activeWorkers7d) || 0,
    activeAgents7d: Number(statsAll.activeAgents7d) || 0,
    openTasks: Number(statsAll.openTasks) || 0,
    // paidWorkers & activeWallets: dijumlah dari kedua chain (stats tanpa
    // chainId tidak memisah; nilai per-chain dari API memang berbeda).
    paidWorkers: CHAINS.reduce((a, c) => a + chainStats[c].paidWorkers, 0),
    activeWallets: CHAINS.reduce((a, c) => a + chainStats[c].activeWallets, 0),
  };

  // ---- akumulator dari /api/tasks (PER-CHAIN + poster/winner) ----
  // Per-chain dihitung dari daftar tugas karena endpoint resmi mengabaikan
  // chainId (selalu platform-wide). Jendela daftar tugas: 5 Jul 2026–.
  const dailyMap = new Map(); // key `${date}|${chain}` -> row (hanya per-chain)
  const walkAllDaily = new Map(); // key date -> {submissions, posters:Set} (utk baris "all")
  const byMode = { "4217": emptyModeCounts(), "8453": emptyModeCounts(), all: emptyModeCounts() };
  const byStatus = { "4217": {}, "8453": {}, all: {} };
  const heatmap = {
    "4217": Array.from({ length: 7 }, () => Array(24).fill(0)),
    "8453": Array.from({ length: 7 }, () => Array(24).fill(0)),
    all: Array.from({ length: 7 }, () => Array(24).fill(0)),
  };
  const weeklyMap = new Map(); // key `${weekStart}|${chain}` -> {posters:Set, byPoster:Map}
  const winners = new Map(); // workerAddress -> {wins, totalWon}
  const totalsByChain = {};
  for (const c of CHAINS) totalsByChain[c] = { tasksTotal: 0, rewardsPutUpTotal: 0, rewardsPaidTotal: 0 };

  function dailyRow(date, chain) {
    const key = date + "|" + chain;
    let row = dailyMap.get(key);
    if (!row) {
      row = { ...emptyDailyRow(date, chain), _agents: new Set(), _posters: new Set() };
      dailyMap.set(key, row);
    }
    return row;
  }

  function weeklyBucket(weekStart, chain) {
    const key = weekStart + "|" + chain;
    let b = weeklyMap.get(key);
    if (!b) {
      b = { weekStart, chain, posters: new Set(), byPoster: new Map() };
      weeklyMap.set(key, b);
    }
    return b;
  }

  for (const t of tasks) {
    const chain = CHAINS.includes(t.chainId) ? t.chainId : "all";
    const date = dateOf(t.createdAt);
    const putUp = toDollars(t.netReward);
    const paid = t.status === "completed" ? putUp : 0;

    // Deret harian PER-CHAIN dari daftar tugas (jendela 5 Jul 2026–).
    const row = dailyRow(date, chain);
    row.tasksPosted += 1;
    row.rewardsPutUp = round2(row.rewardsPutUp + putUp);
    row.rewardsPaid = round2(row.rewardsPaid + paid);
    row.submissions += t.submissionCount;
    if (t.requester) { row._agents.add(t.requester); row._posters.add(t.requester); }
    if (t.winner) row._agents.add(t.winner);
    if (t.claimedBy) row._agents.add(t.claimedBy);
    // Submissions/posters gabungan per tanggal (untuk baris "all" resmi).
    let wad = walkAllDaily.get(date);
    if (!wad) { wad = { submissions: 0, posters: new Set() }; walkAllDaily.set(date, wad); }
    wad.submissions += t.submissionCount;
    if (t.requester) wad.posters.add(t.requester);

    // byMode / byStatus PER-CHAIN dari daftar tugas.
    if (!(t.mode in byMode[chain])) byMode[chain][t.mode] = 0;
    byMode[chain][t.mode] += 1;
    byStatus[chain][t.status] = (byStatus[chain][t.status] || 0) + 1;

    // heatmap PER-CHAIN: tugas dibuat per jam UTC (endpoint resmi tidak
    // memisah per chain; baris 0 = Senin di sini, sama seperti frontend).
    const wd = weekdayOf(t.createdAt);
    const hr = hourOf(t.createdAt);
    heatmap[chain][wd][hr] += 1;

    // posters mingguan
    if (t.requester) {
      const ws = weekStartOf(t.createdAt);
      for (const scope of [chain, "all"]) {
        const b = weeklyBucket(ws, scope);
        b.posters.add(t.requester);
        const name = t.requesterDisplayName || t.requester;
        const cur = b.byPoster.get(t.requester) || { name, tasks: 0, rewards: 0 };
        cur.tasks += 1;
        cur.rewards = round2(cur.rewards + putUp);
        b.byPoster.set(t.requester, cur);
      }
    }

    // pemenang
    if (t.status === "completed" && t.winner) {
      const w = winners.get(t.winner) || { workerAddress: t.winner, wins: 0, totalWon: 0 };
      w.wins += 1;
      w.totalWon = round2(w.totalWon + putUp);
      winners.set(t.winner, w);
    }

    // totals per-chain (jendela daftar tugas)
    const tc = totalsByChain[chain];
    tc.tasksTotal += 1;
    tc.rewardsPutUpTotal = round2(tc.rewardsPutUpTotal + putUp);
    tc.rewardsPaidTotal = round2(tc.rewardsPaidTotal + paid);
  }

  // ---- angka "all" RESMI (endpoint /api/stats/...) ----
  let totals = {
    tasksTotal: tasks.length,
    rewardsPutUpTotal: round2(CHAINS.reduce((a, c) => a + totalsByChain[c].rewardsPutUpTotal, 0)),
    rewardsPaidTotal: round2(CHAINS.reduce((a, c) => a + totalsByChain[c].rewardsPaidTotal, 0)),
  };

  // byMode / byStatus "all" dari breakdowns resmi.
  if (off.breakdowns) {
    const bm = breakdownMap(off.breakdowns.mode);
    const bs = breakdownMap(off.breakdowns.status);
    byMode.all = { ...emptyModeCounts(), ...bm };
    byStatus.all = bs;
    totals.tasksTotal = Object.values(bs).reduce((a, b) => a + b, 0);
  } else {
    // Fallback (endpoint gagal): jumlah per-chain dari daftar tugas.
    for (const c of CHAINS) {
      for (const [k, v] of Object.entries(byMode[c])) byMode.all[k] = (byMode.all[k] || 0) + v;
      for (const [k, v] of Object.entries(byStatus[c])) byStatus.all[k] = (byStatus.all[k] || 0) + v;
    }
  }

  // Deret harian "all" dari platform-time-series resmi.
  const daily = [];
  if (Array.isArray(off.timeSeries) && off.timeSeries.length) {
    // Total dijumlah dari satuan terkecil dulu, baru dikonversi SEKALI —
    // pembulatan per hari lalu dijumlah bisa meleset beberapa sen.
    let putUpMinor = 0;
    let paidMinor = 0;
    for (const r of off.timeSeries) {
      const wad = walkAllDaily.get(r.bucket);
      daily.push({
        date: r.bucket,
        chain: "all",
        tasksPosted: Number(r.tasksCreated) || 0,
        rewardsPutUp: toDollars(r.rewardVolume),
        rewardsPaid: toDollars(r.paidVolume),
        submissions: wad ? wad.submissions : 0,
        activeAgents: Number(r.activeAgents) || 0,
        posters: wad ? wad.posters.size : 0,
      });
      putUpMinor += Number(r.rewardVolume) || 0;
      paidMinor += Number(r.paidVolume) || 0;
    }
    totals.rewardsPutUpTotal = toDollars(putUpMinor);
    totals.rewardsPaidTotal = toDollars(paidMinor);
  }
  // Baris per-chain dari daftar tugas (diurut tanggal naik).
  for (const r of [...dailyMap.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.chain.localeCompare(b.chain)))) {
    daily.push({
      date: r.date,
      chain: r.chain,
      tasksPosted: r.tasksPosted,
      rewardsPutUp: round2(r.rewardsPutUp),
      rewardsPaid: round2(r.rewardsPaid),
      submissions: r.submissions,
      activeAgents: r._agents.size,
      posters: r._posters.size,
    });
  }
  daily.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.chain.localeCompare(b.chain)));
  if (!Array.isArray(off.timeSeries) || !off.timeSeries.length) {
    // Fallback tanpa time-series: baris "all" = jumlah per-chain dari daftar tugas.
    const allRows = new Map();
    for (const r of [...dailyMap.values()]) {
      let ar = allRows.get(r.date);
      if (!ar) { ar = { ...emptyDailyRow(r.date, "all"), _agents: new Set(), _posters: new Set() }; allRows.set(r.date, ar); }
      ar.tasksPosted += r.tasksPosted;
      ar.rewardsPutUp = round2(ar.rewardsPutUp + r.rewardsPutUp);
      ar.rewardsPaid = round2(ar.rewardsPaid + r.rewardsPaid);
      ar.submissions += r.submissions;
      for (const a of r._agents) ar._agents.add(a);
      for (const p of r._posters) ar._posters.add(p);
    }
    for (const r of [...allRows.values()].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      daily.push({ date: r.date, chain: "all", tasksPosted: r.tasksPosted, rewardsPutUp: round2(r.rewardsPutUp), rewardsPaid: round2(r.rewardsPaid), submissions: r.submissions, activeAgents: r._agents.size, posters: r._posters.size });
    }
    daily.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.chain.localeCompare(b.chain)));
  }

  // Heatmap "all" resmi: event aktivitas; baris resmi 0=Minggu (getDay) ->
  // frontend 0=Senin: barisBaru[(r + 6) % 7] = barisResmi[r].
  if (off.heatmap && Array.isArray(off.heatmap.cells)) {
    const hmAll = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const c of off.heatmap.cells) {
      const r = Number(c.row);
      const col = Number(c.col);
      if (r >= 0 && r < 7 && col >= 0 && col < 24) hmAll[(r + 6) % 7][col] += Number(c.count) || 0;
    }
    heatmap.all = hmAll;
  } else {
    // Fallback: jumlah per-chain dari daftar tugas.
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) heatmap.all[d][h] = heatmap["4217"][d][h] + heatmap["8453"][d][h];
    }
  }

  // ---- postersWeekly: 8 minggu terakhir (minggu Senin), per chain + all ----
  const allWeekStarts = [...new Set([...weeklyMap.values()].map((b) => b.weekStart))].sort();
  const last8 = allWeekStarts.slice(-8);
  const postersWeekly = [];
  for (const ws of last8) {
    for (const scope of ["4217", "8453", "all"]) {
      const b = weeklyMap.get(ws + "|" + scope);
      if (!b) continue;
      const topPosters = [...b.byPoster.values()]
        .sort((x, y) => y.tasks - x.tasks || y.rewards - x.rewards)
        .slice(0, 5)
        .map((p) => ({ name: p.name, tasks: p.tasks, rewards: round2(p.rewards) }));
      postersWeekly.push({
        weekStart: ws,
        chain: scope,
        distinctPosters: b.posters.size,
        topPosters,
      });
    }
  }

  // ---- feed: event resmi diperkaya dari daftar tugas ----
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  let feed = null;
  if (off.feed && Array.isArray(off.feed.items)) {
    feed = buildFeedItems(off.feed.items, taskById);
  }
  if (!feed) {
    // Fallback: 20 tugas terbaru dari daftar tugas.
    feed = [...tasks]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 20)
      .map((t) => ({
        referenceCode: t.referenceCode,
        title: t.title,
        eventType: "task_created",
        event: "task created",
        mode: t.mode,
        status: t.status,
        chain: t.chainId,
        reward: toDollars(t.netReward),
        requesterDisplayName: t.requesterDisplayName,
        createdAt: t.createdAt,
        submissionCount: t.submissionCount,
        awardCount: t.awardCount,
      }));
  }

  const topWinners = [...winners.values()]
    .sort((a, b) => b.wins - a.wins || b.totalWon - a.totalWon)
    .slice(0, 10);

  return {
    dataAsOf: now,
    generatedAt: now,
    sources: {
      stats: "GET /api/market/stats?chainId=<id>",
      breakdowns: "GET /api/stats/breakdowns (platform-wide)",
      timeSeries: "GET /api/stats/platform-time-series?range=all&bucket=day (platform-wide)",
      heatmap: "GET /api/stats/activity-heatmap?range=all&dimension=hourOfWeek (platform-wide)",
      feed: "GET /api/stats/activity-feed?limit=20",
      tasks: "GET /api/tasks (cursor-paged; per-chain + posters + winners)",
    },
    chains: chainStats,
    headline,
    daily,
    byMode,
    byStatus,
    heatmap,
    feed,
    latestCompleted: latestCompletedItem(tasks),
    postersWeekly,
    topWinners,
    totals,
    totalsByChain,
  };
}
