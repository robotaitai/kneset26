#!/usr/bin/env node
// Minimal static file server for local development (no dependencies).
// Usage: node scripts/serve.mjs [port]   (default 8126, or $PORT)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8126);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = resolve(ROOT, "." + path);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) throw Object.assign(new Error("forbidden"), { code: "EACCES" });
    if ((await stat(file)).isDirectory()) file = resolve(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === "EACCES" ? 403 : 404, { "content-type": "text/plain" });
    res.end(e.code === "EACCES" ? "forbidden" : "not found");
  }
}).listen(PORT, () => console.log(`serving ${ROOT} at http://localhost:${PORT}`));
