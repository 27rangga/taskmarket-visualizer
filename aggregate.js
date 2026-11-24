// aggregate.js — logika agregasi data TaskMarket (dipakai worker.js DAN test-pipeline.mjs).
// Satu-satunya sumber kebenaran untuk bentuk /api/data. Jangan duplikasi logika ini.
//
// FAKTA API (terverifikasi 25 Nov 2026 ~02:45 WIB):
// - Hanya ada GET /api/market/stats dan GET /api/tasks. TIDAK ADA endpoint
//   time-series / breakdown / heatmap / feed — semua dihitung di sini.
// - Reward dalam satuan terkecil 6 desimal: netReward "5000000" = $5,00.
// - Tempo (4217) = OUSD, Base (8453) = USDC. Jangan dijumlah lintas mata uang
//   tanpa catatan; angka gabungan "all" adalah penjumlahan nominal dolar.
// - primaryAward TIDAK membawa jumlah/tanggal, jadi "rewards paid" per hari =
//   netReward tugas berstatus completed menurut TANGGAL DIBUATNYA tugas.
// - "Daily active agents" TIDAK ADA di API: didefinisikan sebagai distinct
//   participants per hari dari /api/tasks (requester + primaryAward.workerAddress
//   + claimedBy). Lihat METHOD.md.

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

/**
 * Agregasi penuh.
 * @param {Array} tasks - task ringkas (compactTask), urutan apa pun.
 * @param {Object} statsAll - respons /api/market/stats tanpa chainId.
 * @param {Object} statsByChain - {"4217": {...}, "8453": {...}}.
 * @param {string} [asOfIso] - dataAsOf; default now.
 * @returns {Object} JSON persis kontrak /api/data (lihat DATA-CONTRACT.md).
 */
export function aggregate(tasks, statsAll, statsByChain, asOfIso) {
  const now = asOfIso || new Date().toISOString();
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

  // ---- akumulator ----
  const dailyMap = new Map(); // key `${date}|${chain}` -> row + Set peserta/poster
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

    for (const scope of [chain, "all"]) {
      const row = dailyRow(date, scope);
      row.tasksPosted += 1;
      row.rewardsPutUp = round2(row.rewardsPutUp + putUp);
      row.rewardsPaid = round2(row.rewardsPaid + paid);
      row.submissions += t.submissionCount;
      if (t.requester) { row._agents.add(t.requester); row._posters.add(t.requester); }
      if (t.winner) row._agents.add(t.winner);
      if (t.claimedBy) row._agents.add(t.claimedBy);
    }

    // byMode (mode tak dikenal tetap dicatat, bukan dibuang)
    for (const scope of [chain, "all"]) {
      if (!(t.mode in byMode[scope])) byMode[scope][t.mode] = 0;
      byMode[scope][t.mode] += 1;
    }
    // byStatus
    for (const scope of [chain, "all"]) {
      byStatus[scope][t.status] = (byStatus[scope][t.status] || 0) + 1;
    }

    // heatmap: baris 0 = Senin, kolom = jam UTC
    const wd = weekdayOf(t.createdAt);
    const hr = hourOf(t.createdAt);
    heatmap[chain][wd][hr] += 1;
    heatmap.all[wd][hr] += 1;

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

    // totals
    const tc = totalsByChain[chain];
    tc.tasksTotal += 1;
    tc.rewardsPutUpTotal = round2(tc.rewardsPutUpTotal + putUp);
    tc.rewardsPaidTotal = round2(tc.rewardsPaidTotal + paid);
  }

  // ---- daily: urut tanggal naik, "all" + per chain ----
  const daily = [...dailyMap.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.chain.localeCompare(b.chain)))
    .map((r) => ({
      date: r.date,
      chain: r.chain,
      tasksPosted: r.tasksPosted,
      rewardsPutUp: round2(r.rewardsPutUp),
      rewardsPaid: round2(r.rewardsPaid),
      submissions: r.submissions,
      activeAgents: r._agents.size,
      posters: r._posters.size,
    }));

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

  // ---- feed: 20 terbaru ----
  const feed = [...tasks]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20)
    .map((t) => ({
      referenceCode: t.referenceCode,
      title: t.title,
      mode: t.mode,
      status: t.status,
      chain: t.chainId,
      reward: toDollars(t.netReward),
      requesterDisplayName: t.requesterDisplayName,
      createdAt: t.createdAt,
      submissionCount: t.submissionCount,
      awardCount: t.awardCount,
    }));

  const topWinners = [...winners.values()]
    .sort((a, b) => b.wins - a.wins || b.totalWon - a.totalWon)
    .slice(0, 10);

  const totals = {
    tasksTotal: tasks.length,
    rewardsPutUpTotal: round2(CHAINS.reduce((a, c) => a + totalsByChain[c].rewardsPutUpTotal, 0)),
    rewardsPaidTotal: round2(CHAINS.reduce((a, c) => a + totalsByChain[c].rewardsPaidTotal, 0)),
  };

  return {
    dataAsOf: now,
    generatedAt: now,
    sources: {
      stats: "GET /api/market/stats?chainId=<id>",
      tasks: "GET /api/tasks (cursor-paged)",
    },
    chains: chainStats,
    headline,
    daily,
    byMode,
    byStatus,
    heatmap,
    feed,
    postersWeekly,
    topWinners,
    totals,
    totalsByChain,
  };
}
