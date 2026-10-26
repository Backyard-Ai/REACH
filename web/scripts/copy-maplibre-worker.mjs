/**
 * Copies MapLibre's self-contained worker into /public so it is served
 * with a correct JS MIME type at a stable URL. Turbopack does not
 * rewrite the worker URL inside node_modules (import.meta.url relative),
 * so the map sets config.WORKER_URL to this file instead.
 *
 * Runs automatically via the predev/prebuild npm lifecycle (Vercel runs
 * prebuild on `npm run build`). Re-runs are no-ops.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const destDir = join(here, "..", "public", "maplibre");
const dest = join(destDir, "maplibre-gl-worker.mjs");

if (!existsSync(src)) {
  console.error(`maplibre-gl worker not found at ${src} — is maplibre-gl installed?`);
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`maplibre worker → public/maplibre/maplibre-gl-worker.mjs`);
