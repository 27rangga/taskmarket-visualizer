// verify-live.mjs — verifikasi angka situs LIVE vs API TaskMarket langsung.
// Membandingkan 5+ angka acak dari keluarga berbeda (byStatus, byMode,
// time-series, heatmap, totals, feed) pada dataAsOf yang sama.
// Perbedaan kecil mungkin terjadi karena API bergerak antara dataAsOf situs
// dan saat pengecekan — script menampilkan selisih + stempel waktunya.
// Jalankan: node verify-live.mjs (exit 1 bila ada yang tidak cocok di luar
// toleransi drift yang dijelaskan).

const API_BASE = "https://api.taskmarket.dev";
const LIVE = "https://taskmarket-visualizer.moltify-bob.workers.dev/api/data";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`);
  return res.json();
}

const live = await getJson(LIVE);
console.log("live dataAsOf:", live.dataAsOf, "| dicek:", new Date().toISOString());

const [breakdowns, timeSeries, heatmap, stats] = await Promise.all([
  getJson(`${API_BASE}/api/stats/breakdowns`),
  getJson(`${API_BASE}/api/stats/platform-time-series?range=all&bucket=day`),
  getJson(`${API_BASE}/api/stats/activity-heatmap?range=all&dimension=hourOfWeek`),
  getJson(`${API_BASE}/api/market/stats`),
]);
await sleep(300);

const toDollars = (m) => Math.round((Number(m) / 1e6) * 100) / 100;
const sum = (arr, k) => (arr || []).reduce((a, r) => a + Number(r[k] || 0), 0);
const bdStatus = Object.fromEntries((breakdowns.status || []).map((s) => [s.status, s.count]));
const bdMode = Object.fromEntries((breakdowns.mode || []).map((s) => [s.mode, s.count]));
const lastTs = timeSeries[timeSeries.length - 1];
const lastDaily = live.daily.filter((d) => d.chain === "all").pop();
const hmTotal = heatmap.cells.reduce((a, c) => a + c.count, 0);
const hmLiveTotal = live.heatmap.all.flat().reduce((a, b) => a + b, 0);

const checks = [
  ["byStatus.all.completed", live.byStatus.all.completed, bdStatus.completed],
  ["byStatus.all.open", live.byStatus.all.open, bdStatus.open],
  ["byMode.all.bounty", live.byMode.all.bounty, bdMode.bounty],
  ["byMode.all.claim", live.byMode.all.claim, bdMode.claim],
  ["totals.tasksTotal", live.totals.tasksTotal, sum(breakdowns.status, "count")],
  ["totals.rewardsPutUpTotal", live.totals.rewardsPutUpTotal, toDollars(sum(timeSeries, "rewardVolume"))],
  ["totals.rewardsPaidTotal", live.totals.rewardsPaidTotal, toDollars(sum(timeSeries, "paidVolume"))],
  [`daily.all[${lastTs.bucket}].tasksPosted`, lastDaily.tasksPosted, lastTs.tasksCreated],
  [`daily.all[${lastTs.bucket}].activeAgents`, lastDaily.activeAgents, lastTs.activeAgents],
  [`daily.all[${lastTs.bucket}].rewardsPaid`, lastDaily.rewardsPaid, toDollars(lastTs.paidVolume)],
  ["heatmap.all total events", hmLiveTotal, hmTotal],
  ["headline.registeredWorkers", live.headline.registeredWorkers, stats.registeredWorkers],
  ["headline.openTasks", live.headline.openTasks, stats.openTasks],
];
let fails = 0;
for (const [name, got, want] of checks) {
  const ok = got === want;
  if (!ok) fails += 1;
  console.log(`  ${ok ? "✓" : "Δ DRIFT"} ${name}: live=${got} api=${want}${ok ? "" : ` (selisih ${got - want})`}`);
}
console.log(fails === 0
  ? `\nSEMUA ${checks.length} CEK COCOK PERSIS ✓`
  : `\n${fails} angka bergeser sejak dataAsOf (drift wajar bila kecil; angka bergerak karena tugas baru masuk antara dataAsOf dan pengecekan).`);
if (fails > 0) process.exit(1);
