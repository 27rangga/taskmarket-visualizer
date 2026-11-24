// seed-kv.mjs — Isi KV data:latest + data:meta dari sample-data.json (hasil
// test-pipeline.mjs, data nyata dari API). Dipakai sekali saat deploy awal;
// sesudahnya cron Worker yang memperbarui.
// Jalankan: node seed-kv.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const CF = "/opt/hatch/bin/cloudflare";
const ACCOUNT = "c939fdfcd4e347be1916807e152781d4";
const KV_ID = "26a60de5fdbf4b278fe33035350201b5";

function cfExecute(code) {
  const out = execFileSync(CF, ["execute", "--arguments-json", JSON.stringify({ code })], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  const text = parsed?.content?.[0]?.text ?? "";
  if (/^Error:/.test(text) || parsed.isError) throw new Error(`cloudflare execute gagal: ${text.slice(0, 500)}`);
  return text;
}

const data = readFileSync(join(DIR, "sample-data.json"), "utf8");
const parsedData = JSON.parse(data);
const meta = JSON.stringify({
  lastFullRefresh: parsedData.generatedAt,
  taskCount: parsedData.totals.tasksTotal,
  pagesFetched: 16,
  backfill: true,
  errors: [],
  seededManually: true,
  seededAt: new Date().toISOString(),
});

for (const [key, value] of [
  ["data:latest", data],
  ["data:meta", meta],
]) {
  const code = `async () => { const r = await cloudflare.request({method: "PUT", path: \`/accounts/${ACCOUNT}/storage/kv/namespaces/${KV_ID}/values/${key}\`, body: ${JSON.stringify(value)}, contentType: "application/json"}); return r; }`;
  const res = cfExecute(code);
  console.log(key, "->", res.slice(0, 200));
}
console.log("SEED SELESAI");
