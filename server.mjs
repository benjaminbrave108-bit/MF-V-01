// Production entry point for running MF-V-01 on a self-hosted Node server
// (systemd, pm2, a plain `node server.mjs`, etc). Independent of the Electron
// desktop app in desktop/main.cjs — this is the one that actually listens on
// a network-reachable port and talks to Postgres.
//
// Usage:
//   npm run build
//   node --env-file=.env.local server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "127.0.0.1";
const CLIENT_ROOT = path.resolve(__dirname, "dist", "client");
const SERVER_ENTRY = path.resolve(__dirname, "dist", "server", "index.js");
const MIGRATIONS_FOLDER = path.resolve(__dirname, "drizzle");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveClientAsset(urlValue) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlValue, "http://127.0.0.1").pathname);
  } catch {
    return null;
  }
  if (pathname === "/") return null;
  const candidate = path.resolve(CLIENT_ROOT, `.${pathname}`);
  if (candidate !== CLIENT_ROOT && !candidate.startsWith(`${CLIENT_ROOT}${path.sep}`)) return null;
  try {
    return fs.statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function fileResponse(filePath) {
  const body = fs.readFileSync(filePath);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    },
  });
}

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

function sendResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!res.getHeader(key)) res.setHeader(key, value);
  }
  if (process.env.TRUST_TLS_PROXY === "true" && !res.getHeader("Strict-Transport-Security")) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
  }
  return response.arrayBuffer().then((body) => res.end(Buffer.from(body)));
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Cheap CSRF hardening: reject cross-origin state-changing requests. Browsers
// always send Origin on cross-origin fetches; same-origin requests from our
// own frontend send it too, so this only blocks requests that don't match.
function originMismatch(req, expectedOrigin) {
  if (!MUTATING_METHODS.has(req.method || "GET")) return false;
  const origin = req.headers.origin;
  if (!origin) return false;
  return origin !== expectedOrigin;
}

// 1 MB request body cap — see MF-V-01-DUZELTME-PLANI-1.0.9.md 1.7.
const MAX_BODY_BYTES = 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const err = new Error("Payload too large");
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set.");
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("[migrate] up to date");
  } finally {
    await pool.end();
  }
}

async function main() {
  await runMigrations();

  const { default: worker } = await import(pathToFileURL(SERVER_ENTRY).href);

  const server = http.createServer(async (req, res) => {
    try {
      const origin = process.env.PUBLIC_ORIGIN || `http://${HOST}:${PORT}`;
      const staticFile = resolveClientAsset(req.url || "/");
      if (staticFile) {
        await sendResponse(res, fileResponse(staticFile));
        return;
      }
      if (originMismatch(req, origin)) {
        await sendResponse(res, Response.json({ error: "Origin mismatch" }, { status: 403 }));
        return;
      }
      const method = req.method || "GET";
      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
      const headers = new Headers(req.headers);
      // Fetch's Request has no notion of the raw TCP peer; carry it through
      // as a header so route handlers (rate limiting) can find the real
      // client IP without blindly trusting a spoofable X-Forwarded-For.
      headers.set("x-mfv01-remote-addr", req.socket.remoteAddress || "");
      const request = new Request(new URL(req.url || "/", origin), {
        method,
        headers,
        body,
        duplex: body === undefined ? undefined : "half",
      });
      const backgroundTasks = [];
      const executionContext = {
        waitUntil(promise) {
          backgroundTasks.push(Promise.resolve(promise).catch((error) => {
            console.error("[server] background task error", error);
          }));
        },
        passThroughOnException() {},
      };
      const assets = {
        fetch(assetRequest) {
          const file = resolveClientAsset(assetRequest.url);
          return Promise.resolve(file ? fileResponse(file) : new Response("Not found", { status: 404 }));
        },
      };
      const response = await worker.fetch(request, { ASSETS: assets }, executionContext);
      await sendResponse(res, response);
    } catch (error) {
      console.error("[server] request error", error);
      res.statusCode = error?.statusCode === 413 ? 413 : 500;
      res.end(error?.statusCode === 413 ? "Payload too large" : "MF-V-01 could not load.");
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[server] MF-V-01 listening on http://${HOST}:${PORT}`);
  });

  // The app's own DB pool lives inside the bundled dist/server/index.js
  // module (created lazily by db/index.ts on first query) and closes with
  // the process; closing the HTTP server first just stops new requests
  // from being accepted while in-flight ones finish.
  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] received ${signal}, shutting down`);
    await new Promise((resolve) => server.close(resolve));
    process.exit(0);
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  console.error("[server] failed to start", error);
  process.exit(1);
});
