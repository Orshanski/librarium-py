#!/usr/bin/env node
/**
 * Post-build script: injects the list of built assets into sw.js for pre-caching.
 * Replaces __PRECACHE_ASSETS__ with an array of asset paths and
 * __CACHE_VERSION__ with a hash-based cache name.
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

const DIST = join(import.meta.dirname, "../dist");
const SW_PATH = join(DIST, "sw.js");

// Collect all files to pre-cache
const assets = [];

// Root files
for (const f of ["index.html", "manifest.json", "favicon.png"]) {
  assets.push(`/${f}`);
}
assets.push("/");

// JS/CSS chunks
for (const f of readdirSync(join(DIST, "assets"))) {
  if (f.endsWith(".js") || f.endsWith(".css")) {
    assets.push(`/assets/${f}`);
  }
}

// pdfjs files (skip directories and source maps)
try {
  for (const f of readdirSync(join(DIST, "pdfjs"), { withFileTypes: true })) {
    if (f.isFile() && !f.name.endsWith(".map")) {
      assets.push(`/pdfjs/${f.name}`);
    }
  }
} catch {}

// Generate cache version from asset list (changes when build output changes)
const hash = createHash("md5").update(assets.join(",")).digest("hex").slice(0, 8);
const cacheName = `librarium-v${hash}`;

// Read and patch sw.js
let sw = readFileSync(SW_PATH, "utf-8");
sw = sw.replace('"__PRECACHE_ASSETS__"', JSON.stringify(assets));
sw = sw.replace('"__CACHE_VERSION__"', JSON.stringify(cacheName));
writeFileSync(SW_PATH, sw);

// Write version.txt for update detection (fetched by client on navigation)
writeFileSync(join(DIST, "version.txt"), hash);

console.log(`SW precache: ${assets.length} assets, cache=${cacheName}`);
