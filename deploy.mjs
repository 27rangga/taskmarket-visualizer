// deploy.mjs — Deploy taskmarket-visualizer via Cloudflare API (konektor CLI).
// Alur: (1) buat assets-upload-session, (2) upload file aset (base64),
// (3) PUT script worker.js + aggregate.js + metadata (KV binding, assets JWT),
// (4) setel ulang cron + cek subdomain workers.dev.
// Jalankan: node deploy.mjs
// TIDAK memakai wrangler (tidak ada token API di tangan; konektor CLI adalah
// jalur resmi yang tersedia). Repo tetap memakai wrangler.toml + `npx wrangler deploy`
// untuk one-command deploy dari clone baru.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CF = "/opt/hatch/bin/cloudflare";
const ACCOUNT = "c939fdfcd4e347be1916807e152781d4";
const SCRIPT = "taskmarket-visualizer";
const KV_ID = "26a60de5fdbf4b278fe33035350201b5";

const ASSETS = [
  { path: "/index.html", file: "public/index.html", type: "text/html" },
  { path: "/styles.css", file: "public/styles.css", type: "text/css" },
  { path: "/app.js", file: "public/app.js", type: "text/javascript" },
];

function cfExecute(code) {
  const out = execFileSync(CF, ["execute", "--arguments-json", JSON.stringify({ code })], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  const text = parsed?.content?.[0]?.text ?? "";
  if (/^Error:/.test(text) || parsed.isError) throw new Error(`cloudflare execute gagal: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 32); // wrangler: 32 hex chars

// 1. Manifest aset
const files = ASSETS.map((a) => {
  const buf = readFileSync(join(DIR, a.file));
  return { ...a, buf, hash: sha256hex(buf), size: buf.length, b64: buf.toString("base64") };
});
const manifest = {};
for (const f of files) manifest[f.path] = { hash: f.hash, size: f.size };
console.log("Manifest:", JSON.stringify(manifest, null, 1));

// 2. Buat upload session
const session = await cfExecute(`async () => {
  const r = await cloudflare.request({method: "POST", path: \`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/assets-upload-session\`, body: {manifest: ${JSON.stringify(manifest)}}});
  return r.result;
}`);
console.log("Session buckets:", JSON.stringify(session.buckets));
const jwt = session.jwt;
if (!jwt) throw new Error("tidak ada JWT dari session");

// 3. Upload tiap bucket (hash -> base64 string, content-type = tipe file)
let completionJwt = null;
for (const bucket of session.buckets || []) {
  // Upload aset memakai fetch langsung dengan JWT sesi sebagai Bearer —
  // endpoint ini menolak token akun konektor (401); JWT sesi adalah auth-nya.
  const form = new FormData();
  for (const hash of bucket) {
    const f = files.find((x) => x.hash === hash);
    if (!f) throw new Error(`hash tak dikenal di bucket: ${hash}`);
    form.append(hash, new Blob([f.b64], { type: f.type }));
  }
  const upRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/assets/upload?base64=true`,
    { method: "POST", headers: { Authorization: `Bearer ${jwt}` }, body: form }
  );
  const upText = await upRes.text();
  console.log("Upload bucket HTTP", upRes.status, upText.slice(0, 300));
  if (!upRes.ok) throw new Error(`upload aset gagal HTTP ${upRes.status}: ${upText.slice(0, 300)}`);
  try {
    const j = JSON.parse(upText);
    if (j?.result?.jwt) completionJwt = j.result.jwt; // JWT akhir, dipakai di metadata script
  } catch { /* abaikan */ }
}

// 4. PUT script (worker.js + aggregate.js) + metadata (KV binding, assets binding, JWT)
const workerJs = readFileSync(join(DIR, "worker.js"), "utf8");
const aggregateJs = readFileSync(join(DIR, "aggregate.js"), "utf8");
const metadata = {
  main_module: "worker.js",
  compatibility_date: "2026-11-24",
  bindings: [{ type: "kv_namespace", name: "DATA", namespace_id: KV_ID }],
  assets: {
    config: { html_handling: "auto-trailing-slash", not_found_handling: "none" },
    jwt: completionJwt || jwt,
  },
};
const up = await cfExecute(`async () => {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(${JSON.stringify(metadata)})], {type: "application/json"}));
  form.append("worker.js", new Blob([${JSON.stringify(workerJs)}], {type: "application/javascript+module"}));
  form.append("aggregate.js", new Blob([${JSON.stringify(aggregateJs)}], {type: "application/javascript+module"}));
  const r = await cloudflare.request({method: "PUT", path: \`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}\`, body: form});
  return r;
}`);
console.log("Script upload:", JSON.stringify(up?.result ?? up).slice(0, 600));
if (!up?.success) throw new Error(`upload script gagal: ${JSON.stringify(up).slice(0, 500)}`);

// 5. Setel ulang cron + cek subdomain
const sched = await cfExecute(`async () => {
  const r = await cloudflare.request({method: "PUT", path: \`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/schedules\`, body: [{cron: "0 * * * *"}, {cron: "*/15 * * * *"}]});
  return r.result;
}`);
console.log("Schedules:", JSON.stringify(sched));
const sub = await cfExecute(`async () => {
  const r = await cloudflare.request({method: "GET", path: \`/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/subdomain\`});
  return r.result;
}`);
console.log("Subdomain:", JSON.stringify(sub));
console.log("DEPLOY SELESAI — https://taskmarket-visualizer.moltify-bob.workers.dev/");
