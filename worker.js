// worker.js — TaskMarket Visualizer (bounty TSK-BRK611AN, $50).
// ES module, compatibility_date 2026-11-24.
// Fetch: layani /api/data dari KV. Selain itu teruskan ke Static Assets (public/);
//   kalau aset belum ada, kembalikan JSON status ok.
// Scheduled: cron "0 * * * *" = refresh penuh (stats + endpoint /api/stats/...
//   resmi + paging SEMUA task, agregasi, simpan KV); cron "*/15 * * * *" =
//   refresh feed saja (activity-feed resmi).
//
// PENTING: data diambil DI SERVER (Worker), bukan di browser — API TaskMarket
// menolak fetch browser (CORS). Halaman TIDAK PERNAH memanggil api.taskmarket.dev.
// Rate limit API: "Too many requests; retry after 2 seconds" -> jeda antar
// halaman + backoff 429 wajib (lihat fetchJsonWithRetry).
//
// KOREKSI 25 Nov 2026: endpoint resmi ADA di /api/stats/... (breakdowns,
// platform-time-series, activity-heatmap, activity-feed) — klaim lama bahwa
// keempatnya 404 SALAH (path yang dicoba saat build awal adalah /api/market/...).
// Angka scope "all" kini dari endpoint resmi; angka per-chain tetap dari
// /api/tasks karena endpoint resmi mengabaikan chainId (selalu platform-wide).

import { aggregate, compactTask, buildFeedItems, CHAINS } from "./aggregate.js";

const API_BASE = "https://api.taskmarket.dev";
const PAGE_LIMIT = 100;
const PAGE_DELAY_MS = 350; // jeda antar halaman (rate limit)
const MAX_RETRIES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fetch JSON dengan backoff saat 429 (pakai Retry-After bila ada, else 2 dtk). */
async function fetchJsonWithRetry(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = res.headers.get("Retry-After");
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : 2000;
    await sleep(waitMs + 500);
    return fetchJsonWithRetry(url, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} dari ${url}`);
  }
  return res.json();
}

async function fetchStats() {
  const [all, c4217, c8453] = await Promise.all([
    fetchJsonWithRetry(`${API_BASE}/api/market/stats`),
    fetchJsonWithRetry(`${API_BASE}/api/market/stats?chainId=4217`),
    fetchJsonWithRetry(`${API_BASE}/api/market/stats?chainId=8453`),
  ]);
  return { all, byChain: { "4217": c4217, "8453": c8453 } };
}

/**
 * Fetch endpoint /api/stats/... resmi (platform-wide; chainId diabaikan API).
 * Dipanggil berurutan dengan jeda 350 ms (rate limit).
 * @returns {{breakdowns, timeSeries, heatmap, feed}} — bagian yang gagal = null.
 */
async function fetchOfficial() {
  const out = { breakdowns: null, timeSeries: null, heatmap: null, feed: null };
  const errors = [];
  const calls = [
    ["breakdowns", `${API_BASE}/api/stats/breakdowns`],
    ["timeSeries", `${API_BASE}/api/stats/platform-time-series?range=all&bucket=day`],
    ["heatmap", `${API_BASE}/api/stats/activity-heatmap?range=all&dimension=hourOfWeek`],
    ["feed", `${API_BASE}/api/stats/activity-feed?limit=20`],
  ];
  for (const [key, url] of calls) {
    try {
      out[key] = await fetchJsonWithRetry(url);
    } catch (e) {
      errors.push(`${key} gagal: ${e.message}`);
    }
    await sleep(PAGE_DELAY_MS);
  }
  return { out, errors };
}

/**
 * Paging /api/tasks sampai habis.
 * @param {Set<string>|null} knownIds - bila diisi, berhenti begitu bertemu task
 *   yang id-nya sudah dikenal (refresh inkremental; API mengembalikan task
 *   terbaru dulu). Bila null, paging penuh (backfill).
 * @returns {{tasks: Array, pagesFetched: number, stoppedEarly: boolean}}
 */
async function fetchTasksIncremental(knownIds) {
  const tasks = [];
  let cursor = null;
  let pagesFetched = 0;
  let stoppedEarly = false;

  for (;;) {
    const url = new URL(`${API_BASE}/api/tasks`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);
    const data = await fetchJsonWithRetry(url.toString());
    pagesFetched += 1;
    const page = data.tasks || [];
    for (const t of page) {
      if (knownIds && knownIds.has(t.id)) {
        stoppedEarly = true;
        break;
      }
      tasks.push(compactTask(t));
    }
    if (stoppedEarly) break;
    if (!data.hasMore || !data.nextCursor) break;
    cursor = data.nextCursor;
    await sleep(PAGE_DELAY_MS);
  }
  return { tasks, pagesFetched, stoppedEarly };
}

async function fullRefresh(env) {
  const errors = [];
  const startedAt = new Date().toISOString();
  let pagesFetched = 0;

  // 1. Index tugas yang sudah dikenal (inkremental bila ada).
  let knownTasks = [];
  let knownIds = null;
  try {
    const raw = await env.DATA.get("tasks:index");
    if (raw) {
      knownTasks = JSON.parse(raw);
      knownIds = new Set(knownTasks.map((t) => t.id));
    }
  } catch (e) {
    errors.push(`baca tasks:index gagal: ${e.message}`);
  }

  // 2. Stats + endpoint resmi + task baru (paging penuh hanya bila index kosong).
  let stats;
  try {
    stats = await fetchStats();
  } catch (e) {
    errors.push(`stats gagal: ${e.message}`);
    stats = { all: {}, byChain: { "4217": {}, "8453": {} } };
  }

  // 2b. Endpoint /api/stats/... resmi (angka platform-wide "all").
  let official = { breakdowns: null, timeSeries: null, heatmap: null, feed: null };
  try {
    const { out, errors: offErrors } = await fetchOfficial();
    official = out;
    errors.push(...offErrors);
  } catch (e) {
    errors.push(`official gagal: ${e.message}`);
  }

  let allTasks = knownTasks;
  let isBackfill = !knownIds;
  try {
    const { tasks: fresh, pagesFetched: n } = await fetchTasksIncremental(knownIds);
    pagesFetched = n;
    if (knownIds) {
      // Inkremental: task baru di depan, gabung dengan index lama.
      // (API mengembalikan terbaru dulu; paging berhenti di id yang dikenal.)
      const seen = new Set(fresh.map((t) => t.id));
      allTasks = [...fresh, ...knownTasks.filter((t) => !seen.has(t.id))];
    } else {
      allTasks = fresh;
    }
  } catch (e) {
    errors.push(`tasks gagal: ${e.message}`);
    // Tetap agregasi dari index lama bila ada, supaya halaman tidak kosong.
  }

  // 3. Agregasi + simpan.
  const now = new Date().toISOString();
  const data = aggregate(allTasks, stats.all, stats.byChain, official, now);
  await env.DATA.put("data:latest", JSON.stringify(data));
  await env.DATA.put("tasks:index", JSON.stringify(allTasks));
  await env.DATA.put(
    "data:meta",
    JSON.stringify({
      lastFullRefresh: now,
      taskCount: allTasks.length,
      pagesFetched,
      backfill: isBackfill,
      breakdownsTotal: official.breakdowns
        ? (official.breakdowns.status || []).reduce((a, s) => a + (Number(s.count) || 0), 0)
        : null,
      timeSeriesBuckets: Array.isArray(official.timeSeries) ? official.timeSeries.length : null,
      heatmapEvents: official.heatmap && Array.isArray(official.heatmap.cells)
        ? official.heatmap.cells.reduce((a, c) => a + (Number(c.count) || 0), 0)
        : null,
      feedItems: official.feed && Array.isArray(official.feed.items) ? official.feed.items.length : null,
      errors,
    })
  );
  return { taskCount: allTasks.length, pagesFetched, errors, startedAt };
}

async function feedRefresh(env) {
  const errors = [];
  const now = new Date().toISOString();
  try {
    const feedRes = await fetchJsonWithRetry(`${API_BASE}/api/stats/activity-feed?limit=20`);
    const raw = await env.DATA.get("data:latest");
    if (!raw) {
      // Belum ada data penuh: jangan buat data palsu, tunggu refresh jam-an.
      return { skipped: true, reason: "data:latest belum ada" };
    }
    // Perkuat event dengan detail tugas dari index (bila dikenal).
    let taskById = new Map();
    try {
      const idxRaw = await env.DATA.get("tasks:index");
      if (idxRaw) {
        for (const t of JSON.parse(idxRaw)) taskById.set(t.id, t);
      }
    } catch (e) {
      errors.push(`baca tasks:index gagal: ${e.message}`);
    }
    const data = JSON.parse(raw);
    data.feed = buildFeedItems(feedRes.items || [], taskById);
    data.dataAsOf = now;
    await env.DATA.put("data:latest", JSON.stringify(data));
    const metaRaw = await env.DATA.get("data:meta");
    const meta = metaRaw ? JSON.parse(metaRaw) : {};
    meta.lastFeedRefresh = now;
    await env.DATA.put("data:meta", JSON.stringify(meta));
    return { updated: true, feedItems: data.feed.length };
  } catch (e) {
    errors.push(`feed refresh gagal: ${e.message}`);
    return { updated: false, errors };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/data") {
      const raw = await env.DATA.get("data:latest");
      if (!raw) {
        return new Response(JSON.stringify({ error: "data not ready yet" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(raw, {
        headers: {
          "content-type": "application/json",
          // QA 1.4: cache minimal 60 detik (dipakai 300).
          "cache-control": "public, max-age=300",
        },
      });
    }

    // Aset statis (frontend di public/ via Workers Static Assets).
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    // Fallback: aset belum ada (mis. deploy worker-only).
    return new Response(
      JSON.stringify({ ok: true, service: "taskmarket-visualizer", data: "/api/data" }),
      { headers: { "content-type": "application/json" } }
    );
  },

  async scheduled(event, env, ctx) {
    if (event.cron === "0 * * * *") {
      ctx.waitUntil(fullRefresh(env));
    } else if (event.cron === "*/15 * * * *") {
      ctx.waitUntil(feedRefresh(env));
    }
  },
};
