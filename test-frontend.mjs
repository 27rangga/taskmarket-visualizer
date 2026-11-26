// test-frontend.mjs — uji render app.js dengan stub DOM (Node vm).
// Fokus R3c: (1) fallback platform-wide newAgents/settlements saat chain
// dipilih, (2) panel "Right now", (3) insights 8 butir incl. konsentrasi,
// (4) copy-link memakai ?view=, (5) scrollToHashView menghormati ?view=.
// Jalankan: node test-frontend.mjs  (exit 1 bila ada cek gagal)

import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("./public/app.js", import.meta.url), "utf-8");

function makeEl(id) {
  const el = {
    id,
    textContent: "—",
    innerHTML: "",
    hidden: false,
    value: "",
    style: {},
    _attrs: {},
    _listeners: {},
    _scrolled: 0,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k] ?? null; },
    addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
    querySelectorAll() { return []; },
    appendChild() {},
    removeChild() {},
    scrollIntoView() { this._scrolled += 1; },
    select() {},
  };
  return el;
}

const els = new Map();
function $(id) {
  if (!els.has(id)) els.set(id, makeEl(id));
  return els.get(id);
}

const winListeners = {};
const docListeners = {};
let clipboardText = null;
let replacedUrl = null;

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  URLSearchParams,
  location: {
    origin: "https://taskmarket-visualizer.moltify-bob.workers.dev",
    pathname: "/",
    hash: "",
    search: "",
  },
  history: {
    replaceState(_s, _t, url) { replacedUrl = url; },
  },
  navigator: {
    clipboard: { writeText: async (t) => { clipboardText = t; } },
  },
  window: {
    innerWidth: 800,
    addEventListener(type, fn) { (winListeners[type] ||= []).push(fn); },
  },
  document: {
    getElementById: (id) => $(id),
    querySelectorAll: () => [],
    querySelector: (sel) => {
      if (sel === ".chart-wrap") { const e = $("chart-wrap"); e.clientWidth = 720; return e; }
      return $("qs:" + sel);
    },
    createElement: () => makeEl("ta"),
    body: makeEl("body"),
    execCommand: () => true,
    addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
  },
  fetch: async () => ({
    ok: true,
    json: async () => SYNTH,
  }),
};
sandbox.window.window = sandbox.window;
sandbox.document.defaultView = sandbox.window;

const SYNTH = {
  dataAsOf: "2026-11-26T06:40:00.000Z",
  headline: { registeredWorkers: 1000, activeWorkers7d: 500, activeAgents7d: 510, openTasks: 80, paidWorkers: 645, activeWallets: 4532 },
  chains: {
    "4217": { registeredWorkers: 400, activeWorkers7d: 200, activeAgents7d: 210, openTasks: 30, paidWorkers: 175, activeWallets: 986 },
    "8453": { registeredWorkers: 600, activeWorkers7d: 300, activeAgents7d: 300, openTasks: 50, paidWorkers: 470, activeWallets: 3546 },
  },
  daily: [
    { date: "2026-11-24", chain: "all", tasksPosted: 89, rewardsPutUp: 237, rewardsPaid: 100, submissions: 186, activeAgents: 50, posters: 30, newAgents: 12, settlements: 5 },
    { date: "2026-11-25", chain: "all", tasksPosted: 91, rewardsPutUp: 103.27, rewardsPaid: 80, submissions: 149, activeAgents: 55, posters: 32, newAgents: 10, settlements: 4 },
    { date: "2026-11-24", chain: "4217", tasksPosted: 40, rewardsPutUp: 100, rewardsPaid: 50, submissions: 90, activeAgents: 20, posters: 10, newAgents: null, settlements: null },
    { date: "2026-11-25", chain: "4217", tasksPosted: 45, rewardsPutUp: 60, rewardsPaid: 40, submissions: 70, activeAgents: 22, posters: 11, newAgents: null, settlements: null },
  ],
  byMode: {
    all: { bounty: 100, claim: 5, pitch: 2, benchmark: 1, auction: 1 },
    "4217": { bounty: 50, claim: 2, pitch: 1, benchmark: 0, auction: 0 },
    "8453": { bounty: 50, claim: 3, pitch: 1, benchmark: 1, auction: 1 },
  },
  byStatus: {
    all: { open: 80, completed: 1000, cancelled: 50, expired: 40 },
    "4217": { open: 30, completed: 400, cancelled: 20, expired: 15 },
    "8453": { open: 50, completed: 600, cancelled: 30, expired: 25 },
  },
  heatmap: {
    all: Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h === 6 ? 788 : 10))),
    "4217": Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h === 6 ? 40 : 2))),
    "8453": Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => (d === 2 && h === 6 ? 48 : 3))),
  },
  feed: [],
  latestCompleted: { referenceCode: "ABC123", title: "Test task", reward: 5, requesterDisplayName: "Tester", createdAt: "2026-11-25T10:00:00Z" },
  latestTasks: [],
  openTasksList: [
    { referenceCode: "OPEN1", title: "First open task", mode: "bounty", status: "open", chain: "4217", reward: 6.5, createdAt: "2026-11-26T05:00:00Z", expiryTime: "2026-11-27T05:00:00Z", requesterDisplayName: "Alice", submissionCount: 31 },
    { referenceCode: "OPEN2", title: "Second open task", mode: "claim", status: "open", chain: "8453", reward: 5, createdAt: "2026-11-26T04:00:00Z", expiryTime: "2026-11-27T04:00:00Z", requesterDisplayName: "Bob", submissionCount: 12 },
    { referenceCode: "OPEN3", title: "Third open task", mode: "pitch", status: "open", chain: "4217", reward: 10, createdAt: "2026-11-26T03:00:00Z", expiryTime: "2026-11-28T03:00:00Z", requesterDisplayName: null, submissionCount: 0 },
  ],
  postersWeekly: [],
  topWinners: [],
  totals: { tasksTotal: 1170, rewardsPutUpTotal: 5000, rewardsPaidTotal: 4000, awaitingDecision: 3 },
  totalsByChain: {
    "4217": { tasksTotal: 500, rewardsPutUpTotal: 2000, rewardsPaidTotal: 1500, awaitingDecision: 2 },
    "8453": { tasksTotal: 670, rewardsPutUpTotal: 3000, rewardsPaidTotal: 2500, awaitingDecision: 1 },
  },
  rightNow: { openTasks: 80, openEntries: 3861, postedToday: 212, paidToday: 98.91, closing24h: 20, awaitingCount: 144, awaitingRewards: 688.9 },
  concentration: { tasks30d: 1311, posters30d: 222, topShare: 0.25, top3Share: 0.54, postersToHalf: 3 },
};

vm.createContext(sandbox);
vm.runInContext(src, sandbox);

// Boot fetch bersifat async — tunggu render selesai.
await new Promise((r) => setTimeout(r, 200));

const checks = [];
function check(name, got, want) {
  const ok = typeof want === "function" ? want(got) : got === want;
  checks.push([name, got, ok]);
  console.log(`  ${ok ? "✓" : "✗ FAIL"} ${name}: ${JSON.stringify(got)}`);
}

function segClick(segId, attr, value) {
  const seg = $(segId);
  const btn = makeEl("btn-" + value);
  btn.setAttribute(attr, value);
  const handler = seg._listeners.click[0];
  handler({ target: { closest: () => btn } });
}

console.log("== RENDER AWAL (scope all) ==");
check("hero-swarm menyebut 3,861 entries circling 80 open tasks", $("hero-swarm").innerHTML, (v) => v.includes("3,861") && v.includes("80") && v.includes("entries circling") && v.includes("open tasks"));
check("hero-swarm-sub menyebut $98.91 paid today + 20 closing", $("hero-swarm-sub").textContent, (v) => v.includes("98.91") && v.includes("20"));
check("open-tasks-count menyebut 3 of 80", $("open-tasks-count").textContent, (v) => v.includes("3 of 80"));
check("latest-tasks menampilkan 3 open tasks (bukan latestTasks kosong)", $("latest-tasks").innerHTML, (v) => (v.match(/<li/g) || []).length === 3 && v.includes("OPEN1") && v.includes("31 submissions"));
check("rn-open = 80", $("rn-open").textContent, "80");
check("rn-entries = 3,861", $("rn-entries").textContent, (v) => v === "3,861" || v === "3861");
check("rn-posted = 212", $("rn-posted").textContent, "212");
check("rn-paid = $98.91", $("rn-paid").textContent, (v) => v.includes("98.91"));
check("rn-closing = 20", $("rn-closing").textContent, "20");
check("rn-awaiting = $688.90", $("rn-awaiting").textContent, (v) => v.includes("688.90"));
check("rn-awaiting-sub menyebut 144 tasks", $("rn-awaiting-sub").textContent, (v) => v.includes("144"));
const insightsHtml = $("insights-list").innerHTML;
check("insights 8 butir", (insightsHtml.match(/<li/g) || []).length, 8);
check("insights menyebut busiest hour", insightsHtml, (v) => v.includes("busiest hour"));
check("insights menyebut biggest poster", insightsHtml, (v) => v.includes("biggest poster"));

console.log("== METRIK newAgents, SCOPE all ==");
segClick("metric-seg", "data-metric", "newAgents");
check("scope-note tetap hidden (scope all)", $("daily-scope-note").hidden, true);
// Catatan: renderDaily menulis innerHTML (bukan textContent); stub DOM tidak
// menyinkronkan keduanya seperti DOM asli, jadi cek innerHTML.
check("daily-total total newAgents 22", $("daily-total").innerHTML, (v) => v.includes("22"));

console.log("== METRIK newAgents, SCOPE 4217 (fallback platform-wide) ==");
segClick("chain-seg", "data-chain", "4217");
check("scope-note tampil", $("daily-scope-note").hidden, false);
check("scope-note berlabel Platform-wide (all chains)", $("daily-scope-note").textContent, (v) => v.includes("Platform-wide (all chains)"));
check("daily-total tetap 22 (deret all) + label platform-wide", $("daily-total").innerHTML, (v) => v.includes("22") && v.includes("platform-wide (all chains)"));
check("chart SVG terisi (deret all dirender)", $("daily-chart").outerHTML || "", (v) => v.length > 100 && v.includes("<path"));

console.log("== METRIK tasksPosted, SCOPE 4217 (kembali per-chain) ==");
segClick("metric-seg", "data-metric", "tasksPosted");
check("scope-note kembali hidden", $("daily-scope-note").hidden, true);
check("daily-total 85 (40+45, per-chain)", $("daily-total").innerHTML, (v) => v.includes("85") && !v.includes("platform-wide"));

console.log("== COPY LINK ?view= ==");
{
  const btn = makeEl("copy-flow");
  btn.setAttribute("data-view", "flow");
  btn.textContent = "Copy link";
  const handler = docListeners.click[0];
  handler({ target: { closest: () => btn } });
  await new Promise((r) => setTimeout(r, 50));
  check("clipboard berisi ?view=flow", clipboardText, "https://taskmarket-visualizer.moltify-bob.workers.dev/?view=flow");
  check("history.replaceState ke ?view=flow#/flow", replacedUrl, "?view=flow#/flow");
}

console.log("== scrollToHashView menghormati ?view= ==");
{
  sandbox.location.search = "?view=heatmap";
  sandbox.location.hash = "";
  const before = $("heatmap")._scrolled;
  for (const fn of winListeners.hashchange || []) fn();
  check("heatmap di-scroll (via ?view=)", $("heatmap")._scrolled > before, true);
}

const fails = checks.filter((c) => !c[2]).length;
console.log(fails === 0 ? `\nSEMUA ${checks.length} CEK COCOK ✓` : `\n${fails} CEK GAGAL ✗`);
process.exit(fails ? 1 : 0);
