// test-pipeline.mjs — uji logika agregasi LOKAL (bukan deploy).
// Fetch API TaskMarket langsung dengan jeda + backoff 429, lalu hitung agregat
// memakai aggregate.js yang SAMA dengan yang dipakai worker.js.
// Jalankan: node test-pipeline.mjs
// Hasil agregat lengkap disimpan ke sample-data.json (untuk agen frontend)
// dan daftar tugas ringkas ke tasks-index.json (untuk seed-kv.mjs).

import { writeFileSync } from "node:fs";
import { aggregate, compactTask, toDollars, CHAINS } from "./aggregate.js";

const API_BASE = "https://api.taskmarket.dev";
const PAGE_LIMIT = 100;
const PAGE_DELAY_MS = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJsonWithRetry(url, attempt = 0) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 429 && attempt < 5) {
    const retryAfter = res.headers.get("Retry-After");
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : 2000;
    console.log(`  429 di ${url} — tunggu ${waitMs}ms, ulang (percobaan ${attempt + 1})`);
    await sleep(waitMs + 500);
    return fetchJsonWithRetry(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`);
  return res.json();
}

const t0 = Date.now();
console.log("== TEST PIPELINE TaskMarket (backfill penuh + endpoint resmi) ==");

// 1. Stats
const statsAll = await fetchJsonWithRetry(`${API_BASE}/api/market/stats`);
await sleep(PAGE_DELAY_MS);
const stats4217 = await fetchJsonWithRetry(`${API_BASE}/api/market/stats?chainId=4217`);
await sleep(PAGE_DELAY_MS);
const stats8453 = await fetchJsonWithRetry(`${API_BASE}/api/market/stats?chainId=8453`);
console.log("stats (tanpa chain):", JSON.stringify(statsAll));

// 2. Endpoint /api/stats/... resmi (platform-wide; chainId diabaikan API)
const breakdowns = await fetchJsonWithRetry(`${API_BASE}/api/stats/breakdowns`);
await sleep(PAGE_DELAY_MS);
const timeSeries = await fetchJsonWithRetry(`${API_BASE}/api/stats/platform-time-series?range=all&bucket=day`);
await sleep(PAGE_DELAY_MS);
const heatmap = await fetchJsonWithRetry(`${API_BASE}/api/stats/activity-heatmap?range=all&dimension=hourOfWeek`);
await sleep(PAGE_DELAY_MS);
const feed = await fetchJsonWithRetry(`${API_BASE}/api/stats/activity-feed?limit=20`);
console.log("breakdowns status total:", (breakdowns.status || []).reduce((a, s) => a + s.count, 0));
console.log("time-series buckets:", timeSeries.length, "rentang:", timeSeries[0]?.bucket, "s.d.", timeSeries[timeSeries.length - 1]?.bucket);
console.log("heatmap cells:", heatmap.cells.length, "total events:", heatmap.cells.reduce((a, c) => a + c.count, 0));
console.log("feed items:", (feed.items || []).length);

// 3. Paging semua task
const tasks = [];
let cursor = null;
let pages = 0;
for (;;) {
  const url = new URL(`${API_BASE}/api/tasks`);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  if (cursor) url.searchParams.set("cursor", cursor);
  const data = await fetchJsonWithRetry(url.toString());
  pages += 1;
  const page = data.tasks || [];
  for (const t of page) tasks.push(compactTask(t));
  if (pages % 10 === 0 || !data.hasMore) {
    console.log(`  halaman ${pages}: ${tasks.length} task sejauh ini (hasMore=${data.hasMore})`);
  }
  if (!data.hasMore || !data.nextCursor) break;
  cursor = data.nextCursor;
  await sleep(PAGE_DELAY_MS);
}
const backfillMs = Date.now() - t0;

// 4. Cek urutan + cakupan
const dates = tasks.map((t) => t.createdAt).sort();
const modes = [...new Set(tasks.map((t) => t.mode))].sort();
const statuses = [...new Set(tasks.map((t) => t.status))].sort();
console.log("\n== RINGKASAN ==");
console.log(`total task (walk) : ${tasks.length}`);
console.log(`halaman (limit ${PAGE_LIMIT}) : ${pages}`);
console.log(`waktu backfill    : ${(backfillMs / 1000).toFixed(1)} dtk`);
console.log(`rentang createdAt : ${dates[0]} s.d. ${dates[dates.length - 1]}`);
console.log(`mode teramati     : ${modes.join(", ")}`);
console.log(`status teramati   : ${statuses.join(", ")}`);
console.log(`chain teramati    : ${[...new Set(tasks.map((t) => t.chainId))].sort().join(", ")}`);
console.log(`task terbaru dulu : ${tasks[0].createdAt >= tasks[tasks.length - 1].createdAt}`);

// 5. Agregasi (logika yang sama dengan Worker)
const official = { breakdowns, timeSeries, heatmap, feed };
const data = aggregate(tasks, statsAll, { "4217": stats4217, "8453": stats8453 }, official);
writeFileSync(new URL("./sample-data.json", import.meta.url), JSON.stringify(data, null, 2));
writeFileSync(new URL("./tasks-index.json", import.meta.url), JSON.stringify(tasks));
console.log("\nagregat lengkap disimpan ke sample-data.json; index tugas ke tasks-index.json");

// 6. VERIFIKASI: agregat vs API langsung (harus cocok persis)
console.log("\n== VERIFIKASI agregat vs API langsung ==");
const sum = (arr, k) => (arr || []).reduce((a, r) => a + Number(r[k] || 0), 0);
const checks = [];
const bdStatus = Object.fromEntries((breakdowns.status || []).map((s) => [s.status, s.count]));
const bdMode = Object.fromEntries((breakdowns.mode || []).map((s) => [s.mode, s.count]));
checks.push(["byStatus.all.completed", data.byStatus.all.completed, bdStatus.completed]);
checks.push(["byStatus.all.open", data.byStatus.all.open, bdStatus.open]);
checks.push(["byStatus.all.cancelled", data.byStatus.all.cancelled, bdStatus.cancelled]);
checks.push(["byMode.all.bounty", data.byMode.all.bounty, bdMode.bounty]);
checks.push(["byMode.all.claim", data.byMode.all.claim, bdMode.claim]);
checks.push(["totals.tasksTotal", data.totals.tasksTotal, sum(breakdowns.status, "count")]);
checks.push(["totals.rewardsPutUpTotal", data.totals.rewardsPutUpTotal, toDollars(sum(timeSeries, "rewardVolume"))]);
checks.push(["totals.rewardsPaidTotal", data.totals.rewardsPaidTotal, toDollars(sum(timeSeries, "paidVolume"))]);
const lastTs = timeSeries[timeSeries.length - 1];
const lastDaily = data.daily.filter((d) => d.chain === "all").pop();
checks.push([`daily.all[${lastTs.bucket}].tasksPosted`, lastDaily.tasksPosted, lastTs.tasksCreated]);
checks.push([`daily.all[${lastTs.bucket}].activeAgents`, lastDaily.activeAgents, lastTs.activeAgents]);
checks.push([`daily.all[${lastTs.bucket}].rewardsPaid`, lastDaily.rewardsPaid, toDollars(lastTs.paidVolume)]);
const hmTotal = heatmap.cells.reduce((a, c) => a + c.count, 0);
const hmAllTotal = data.heatmap.all.flat().reduce((a, b) => a + b, 0);
checks.push(["heatmap.all total events", hmAllTotal, hmTotal]);
checks.push(["feed items", data.feed.length, (feed.items || []).length]);
let fails = 0;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) fails += 1;
  console.log(`  ${ok ? "✓" : "✗ FAIL"} ${name}: agregat=${got} api=${want}`);
}
console.log(fails === 0 ? `\nSEMUA ${checks.length} CEK COCOK ✓` : `\n${fails} CEK GAGAL ✗`);

console.log("\n== CONTOH daily (3 baris terakhir, chain=all) ==");
for (const row of data.daily.filter((d) => d.chain === "all").slice(-3)) console.log(JSON.stringify(row));
console.log("\n== byMode ==", JSON.stringify(data.byMode));
console.log("== byStatus ==", JSON.stringify(data.byStatus));
console.log("== headline ==", JSON.stringify(data.headline));
console.log("== totals ==", JSON.stringify(data.totals));
console.log("== totalsByChain ==", JSON.stringify(data.totalsByChain));
console.log("\n== heatmap all (baris 0=Senin, kolom jam 0-23) ==");
for (let i = 0; i < 7; i++) console.log(`  hari ${i}: [${data.heatmap.all[i].join(", ")}]`);
console.log("\n== feed (2 item pertama) ==");
console.log(JSON.stringify(data.feed.slice(0, 2), null, 2));
console.log("\n== latestCompleted ==");
console.log(JSON.stringify(data.latestCompleted, null, 2));
console.log(`\nwaktu total: ${((Date.now() - t0) / 1000).toFixed(1)} dtk`);
if (fails > 0) process.exit(1);
