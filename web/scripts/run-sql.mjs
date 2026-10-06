/**
 * One-shot SQL runner for the Supabase pooler, where long psql -f
 * sessions have been observed to stall mid-file. Executes each file as a
 * single simple-protocol query on one connection, with a watchdog.
 *
 *   node scripts/run-sql.mjs file1.sql [file2.sql ...]
 *
 * Reads DATABASE_URL from .env.local (or the environment).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/run-sql.mjs file.sql [...]");
  process.exit(1);
}

let url = process.env.DATABASE_URL;
if (!url) {
  const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  url = raw.match(/^DATABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^["']|["']$/g, "");
}
if (!url) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

const watchdog = setTimeout(() => {
  console.error("WATCHDOG: query did not finish in 6 minutes — exiting");
  process.exit(2);
}, 360_000);
watchdog.unref();

function makeClient() {
  return new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
    statement_timeout: 120_000,
    query_timeout: 120_000,
  });
}

let client;
for (let attempt = 1; ; attempt++) {
  try {
    client = makeClient();
    await client.connect();
    break;
  } catch (e) {
    if (attempt >= 6) throw e;
    console.error(`connect failed (attempt ${attempt}): ${e.message} — retrying`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}
console.log("connected");

for (const file of files) {
  const sql = readFileSync(resolve(process.cwd(), file), "utf8");
  process.stdout.write(`running ${file} (${sql.length} bytes) ... `);
  const started = Date.now();
  const result = await client.query(sql);
  const n = Array.isArray(result) ? result.length : 1;
  console.log(`ok — ${n} statement group(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

await client.end();
clearTimeout(watchdog);
console.log("done");
