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
// R3: field baru — newAgents/settlements dari time-series resmi, latestTasks 10 item,
// awaitingDecision = tugas open dengan expiryTime < dataAsOf (dihitung ulang independen).
checks.push([`daily.all[${lastTs.bucket}].newAgents`, lastDaily.newAgents, Number(lastTs.newAgents) || 0]);
checks.push([`daily.all[${lastTs.bucket}].settlements`, lastDaily.settlements, Number(lastTs.settlements) || 0]);
checks.push(["latestTasks length", data.latestTasks.length, 10]);
const newestTask = [...tasks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
checks.push(["latestTasks[0].referenceCode", data.latestTasks[0].referenceCode, newestTask.referenceCode]);
const expectAwaiting = tasks.filter((t) => t.status === "open" && t.expiryTime && t.expiryTime < data.dataAsOf).length;
checks.push(["totals.awaitingDecision", data.totals.awaitingDecision, expectAwaiting]);
for (const c of ["4217", "8453"]) {
  const expectChain = tasks.filter((t) => t.chainId === c && t.status === "open" && t.expiryTime && t.expiryTime < data.dataAsOf).length;
  checks.push([`totalsByChain[${c}].awaitingDecision`, data.totalsByChain[c].awaitingDecision, expectChain]);
}
const perChainRow = data.daily.find((d) => d.chain === "4217");
checks.push(["daily.4217.newAgents null", perChainRow.newAgents, null]);
checks.push(["daily.4217.settlements null", perChainRow.settlements, null]);
// R3c: "Right now" + konsentrasi poster — hitung ulang independen dari task
// mentah + time-series resmi + stats (bukan dari agregat itu sendiri).
const rn = data.rightNow;
const nowIso = data.dataAsOf;
const todayStr = nowIso.slice(0, 10);
const cutoff30 = new Date(new Date(nowIso).getTime() - 30 * 86400 * 1000).toISOString();
const nowPlus24 = new Date(new Date(nowIso).getTime() + 86400 * 1000).toISOString();
checks.push(["rightNow.openTasks", rn.openTasks, Number(statsAll.openTasks) || 0]);
checks.push(["rightNow.openEntries", rn.openEntries, tasks.filter((t) => t.status === "open" && t.submissionWindowOpen).reduce((a, t) => a + t.submissionCount, 0)]);
checks.push(["compactTask submissionWindowOpen ada", tasks.filter((t) => t.submissionWindowOpen !== undefined).length, tasks.length]);
checks.push(["rightNow.postedToday", rn.postedToday, tasks.filter((t) => t.createdAt.slice(0, 10) === todayStr).length]);
const todayBucket = timeSeries.find((r) => r.bucket === todayStr);
checks.push(["rightNow.paidToday", rn.paidToday, todayBucket ? toDollars(todayBucket.paidVolume) : null]);
checks.push(["rightNow.closing24h", rn.closing24h, tasks.filter((t) => t.status === "open" && t.expiryTime && t.expiryTime > nowIso && t.expiryTime <= nowPlus24).length]);
checks.push(["rightNow.awaitingCount", rn.awaitingCount, expectAwaiting]);
const expectAwaitingRewards = Math.round(tasks.filter((t) => t.status === "open" && t.expiryTime && t.expiryTime < nowIso).reduce((a, t) => a + toDollars(t.netReward), 0) * 100) / 100;
checks.push(["rightNow.awaitingRewards", rn.awaitingRewards, expectAwaitingRewards]);
const tasks30 = tasks.filter((t) => t.createdAt >= cutoff30 && t.requester);
const pMap = new Map();
for (const t of tasks30) pMap.set(t.requester, (pMap.get(t.requester) || 0) + 1);
const pSorted = [...pMap.values()].sort((a, b) => b - a);
checks.push(["concentration.tasks30d", data.concentration.tasks30d, tasks30.length]);
checks.push(["concentration.posters30d", data.concentration.posters30d, pMap.size]);
checks.push(["concentration.topShare", data.concentration.topShare, pSorted.length ? pSorted[0] / tasks30.length : null]);
let halfAcc = 0, halfWant = null;
for (let i = 0; i < pSorted.length; i++) { halfAcc += pSorted[i]; if (halfAcc >= tasks30.length / 2) { halfWant = i + 1; break; } }
checks.push(["concentration.postersToHalf", data.concentration.postersToHalf, halfWant]);
checks.push(["compactTask expiryTime ada", tasks.filter((t) => t.expiryTime).length > 0 ? 1 : 0, 1]);
// R3d: openTasksList — 25 tugas open terbaru yang jendela submission-nya
// masih terbuka (status open DAN submissionWindowOpen=true), urut createdAt desc.
const expectOpen = [...tasks]
  .filter((t) => t.status === "open" && t.submissionWindowOpen === true)
  .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
const openSet = new Set(expectOpen.map((t) => t.referenceCode));
checks.push(["openTasksList length", data.openTasksList.length, Math.min(25, expectOpen.length)]);
checks.push(["openTasksList[0].referenceCode", data.openTasksList[0]?.referenceCode, expectOpen[0]?.referenceCode]);
checks.push(["openTasksList semua open+windowOpen", data.openTasksList.filter((t) => openSet.has(t.referenceCode)).length, data.openTasksList.length]);
checks.push(["openTasksList urut createdAt desc", data.openTasksList.every((t, i) => i === 0 || t.createdAt <= data.openTasksList[i - 1].createdAt) ? 1 : 0, 1]);
checks.push(["openTasksList[0].submissionCount", data.openTasksList[0]?.submissionCount, expectOpen[0]?.submissionCount]);
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
console.log("\n== R3: awaitingDecision / latestTasks / newAgents+settlements ==");
console.log("awaitingDecision totals:", data.totals.awaitingDecision, "| per-chain:", JSON.stringify({ "4217": data.totalsByChain["4217"].awaitingDecision, "8453": data.totalsByChain["8453"].awaitingDecision }));
console.log("latestTasks:", data.latestTasks.length, "item; pertama:", JSON.stringify(data.latestTasks[0]));
console.log("daily all terakhir:", JSON.stringify(data.daily.filter((d) => d.chain === "all").slice(-1)[0]));
console.log("\n== R3c: rightNow / concentration ==");
console.log("rightNow:", JSON.stringify(data.rightNow));
console.log("concentration:", JSON.stringify(data.concentration));
console.log("\n== R3d: openTasksList (hero swarm memakai rightNow di atas) ==");
console.log("openTasksList:", data.openTasksList.length, "item; pertama:", JSON.stringify(data.openTasksList[0]));
console.log("hero line 1: " + data.rightNow.openEntries.toLocaleString("en-US") + " entries circling " + data.rightNow.openTasks + " open tasks");
console.log("hero line 2: $" + (data.rightNow.paidToday ?? "—") + " paid today · " + data.rightNow.closing24h + " closing in 24 hours");
console.log(`\nwaktu total: ${((Date.now() - t0) / 1000).toFixed(1)} dtk`);
if (fails > 0) process.exit(1);
