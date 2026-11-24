// test-pipeline.mjs — uji logika agregasi LOKAL (bukan deploy).
// Fetch API TaskMarket langsung dengan jeda + backoff 429, lalu hitung agregat
// memakai aggregate.js yang SAMA dengan yang dipakai worker.js.
// Jalankan: node test-pipeline.mjs
// Hasil agregat lengkap disimpan ke sample-data.json (untuk agen frontend).

import { writeFileSync } from "node:fs";
import { aggregate, compactTask, CHAINS } from "./aggregate.js";

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
console.log("== TEST PIPELINE TaskMarket (backfill penuh) ==");

// 1. Stats
const statsAll = await fetchJsonWithRetry(`${API_BASE}/api/market/stats`);
await sleep(PAGE_DELAY_MS);
const stats4217 = await fetchJsonWithRetry(`${API_BASE}/api/market/stats?chainId=4217`);
await sleep(PAGE_DELAY_MS);
const stats8453 = await fetchJsonWithRetry(`${API_BASE}/api/market/stats?chainId=8453`);
console.log("stats (tanpa chain):", JSON.stringify(statsAll));
console.log("stats 4217:", JSON.stringify(stats4217));
console.log("stats 8453:", JSON.stringify(stats8453));

// 2. Paging semua task
const tasks = [];
let cursor = null;
let pages = 0;
let retries429 = 0;
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

// 3. Cek urutan + cakupan
const dates = tasks.map((t) => t.createdAt).sort();
const modes = [...new Set(tasks.map((t) => t.mode))].sort();
const statuses = [...new Set(tasks.map((t) => t.status))].sort();
const phases = [...new Set(tasks.map((t) => t.status))].sort();
console.log("\n== RINGKASAN ==");
console.log(`total task        : ${tasks.length}`);
console.log(`halaman (limit ${PAGE_LIMIT}) : ${pages}`);
console.log(`waktu backfill    : ${(backfillMs / 1000).toFixed(1)} dtk`);
console.log(`rentang createdAt : ${dates[0]} s.d. ${dates[dates.length - 1]}`);
console.log(`mode teramati     : ${modes.join(", ")}`);
console.log(`status teramati   : ${statuses.join(", ")}`);
console.log(`chain teramati    : ${[...new Set(tasks.map((t) => t.chainId))].sort().join(", ")}`);
console.log(`task terbaru dulu : ${tasks[0].createdAt >= tasks[tasks.length - 1].createdAt}`);

// 4. Agregasi (logika yang sama dengan Worker)
const data = aggregate(tasks, statsAll, { "4217": stats4217, "8453": stats8453 });
writeFileSync(new URL("./sample-data.json", import.meta.url), JSON.stringify(data, null, 2));
console.log("\nagregat lengkap disimpan ke sample-data.json");

console.log("\n== CONTOH daily (3 baris terakhir, chain=all) ==");
for (const row of data.daily.filter((d) => d.chain === "all").slice(-3)) console.log(JSON.stringify(row));

console.log("\n== CONTOH daily (3 baris terakhir, chain=4217) ==");
for (const row of data.daily.filter((d) => d.chain === "4217").slice(-3)) console.log(JSON.stringify(row));

console.log("\n== byMode ==", JSON.stringify(data.byMode));
console.log("== byStatus ==", JSON.stringify(data.byStatus));
console.log("== headline ==", JSON.stringify(data.headline));
console.log("== totals ==", JSON.stringify(data.totals));
console.log("== totalsByChain ==", JSON.stringify(data.totalsByChain));
console.log("\n== heatmap all (baris 0=Senin, kolom jam 0-23) ==");
for (let i = 0; i < 7; i++) console.log(`  hari ${i}: [${data.heatmap.all[i].join(", ")}]`);
console.log("\n== postersWeekly (2 entri terakhir) ==");
console.log(JSON.stringify(data.postersWeekly.slice(-2), null, 2));
console.log("\n== topWinners (top 3) ==");
console.log(JSON.stringify(data.topWinners.slice(0, 3), null, 2));
console.log("\n== feed (item pertama) ==");
console.log(JSON.stringify(data.feed[0], null, 2));
console.log(`\nwaktu total: ${((Date.now() - t0) / 1000).toFixed(1)} dtk`);
