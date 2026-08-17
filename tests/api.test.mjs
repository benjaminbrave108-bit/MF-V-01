// API integration tests: exercise app/api/** by calling the built worker's
// fetch() directly with real Request objects (same pattern as
// rendered-html.test.mjs / desktop-assets.test.mjs), against the real dev
// Postgres database configured by DATABASE_URL. There is no separate
// DATABASE_URL_TEST instance in this environment (the app's DB role has no
// CREATEDB privilege here) — every test creates clearly-marked rows of its
// own and removes them in an `after` hook instead of relying on database
// isolation. Requires the app to have already been built (`npm run build`)
// and the default seeded accounts (admin/admin123 etc.) to exist —
// `npm test` handles both.
import assert from "node:assert/strict";
import test from "node:test";
import { callWorker } from "./helpers/call-worker.mjs";

// Distinct from any real client IP so the login rate-limit test can trip
// (and clean up) its own IP block without touching unrelated traffic.
const TEST_IP = "203.0.113.250";
const RUN_TAG = `apitest_${Date.now()}`;

let worker;
async function loadWorker() {
  if (worker) return worker;
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("api-test", `${process.pid}-${Date.now()}`);
  ({ default: worker } = await import(workerUrl.href));
  return worker;
}

const ctx = { waitUntil() {}, passThroughOnException() {} };
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };

function cookieFromSetCookie(setCookieHeader) {
  return setCookieHeader ? setCookieHeader.split(";")[0] : null;
}

async function call(method, path, { body, cookie, headers, ip = TEST_IP } = {}) {
  const w = await loadWorker();
  const request = new Request(`http://127.0.0.1${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-mfv01-remote-addr": ip,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const response = await callWorker(w, request, env, ctx);
  let json = null;
  try {
    json = await response.json();
  } catch {}
  return { status: response.status, json, cookie: cookieFromSetCookie(response.headers.get("set-cookie")) };
}

let adminCookie;
let testUserId;
let testUsername;
let testUserCookie;
const createdRecordIds = [];

test("auth: rejects a wrong password", async () => {
  const res = await call("POST", "/api/auth/login", { body: { username: "admin", password: "definitely-wrong" } });
  assert.equal(res.status, 401);
});

test("auth: accepts the seeded admin account", async () => {
  const res = await call("POST", "/api/auth/login", { body: { username: "admin", password: "admin123" } });
  assert.equal(res.status, 200);
  assert.equal(res.json.profile.username, "admin");
  assert.equal(res.json.profile.isAdmin, true);
  adminCookie = res.cookie;
  assert.ok(adminCookie);
});

test("auth: /api/auth/session reflects the logged-in user", async () => {
  const res = await call("GET", "/api/auth/session", { cookie: adminCookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.profile.username, "admin");
});

test("auth: an unauthenticated request is rejected", async () => {
  const res = await call("GET", "/api/records");
  assert.equal(res.status, 401);
});

test("users: admin can create a permission-scoped account", async () => {
  testUsername = `${RUN_TAG}_user`;
  const res = await call("POST", "/api/users", {
    cookie: adminCookie,
    body: {
      username: testUsername,
      password: "ApiTest1234",
      name: "API Test User",
      roleLabel: "Test",
      isAdmin: false,
      permissions: ["cash"],
    },
  });
  assert.equal(res.status, 201);
  testUserId = res.json.user.id;
  assert.deepEqual(res.json.user.permissions, ["cash"]);
});

test("permission matrix: scoped user can reach a permitted page, not an unpermitted one", async () => {
  const login = await call("POST", "/api/auth/login", { body: { username: testUsername, password: "ApiTest1234" } });
  assert.equal(login.status, 200);
  testUserCookie = login.cookie;

  const allowed = await call("GET", "/api/records?kind=cash", { cookie: testUserCookie });
  assert.equal(allowed.status, 200);

  const forbiddenKind = await call("GET", "/api/records?kind=income", { cookie: testUserCookie });
  assert.equal(forbiddenKind.status, 403);

  const forbiddenPage = await call("GET", "/api/notes", { cookie: testUserCookie });
  assert.equal(forbiddenPage.status, 403);

  const forbiddenAdmin = await call("GET", "/api/users", { cookie: testUserCookie });
  assert.equal(forbiddenAdmin.status, 403);
});

test("records: create, partial update, archive, delete", async () => {
  const create = await call("POST", "/api/records", {
    cookie: adminCookie,
    body: { kind: "income", date: "2026-01-15", source: `${RUN_TAG}_income`, amount: 123, currency: "USD" },
  });
  assert.equal(create.status, 201);
  const record = create.json.record;
  createdRecordIds.push(record.id);
  // Not cleaned up: the auto-created "Diğer" cash bucket is normal,
  // expected app state (created on demand for any income/expense record
  // without an explicit cash account), not test-specific pollution — and
  // other real records may come to depend on it existing.
  assert.equal(record.cashAccount, "Diğer", "income records fall back to the shared 'Diğer' cash bucket");

  // Partial update: only amount changes, source must survive untouched.
  const update = await call("PUT", `/api/records/${record.id}`, {
    cookie: adminCookie,
    body: { amount: 456, updatedAt: record.updatedAt },
  });
  assert.equal(update.status, 200);
  assert.equal(update.json.record.amount, 456);
  assert.equal(update.json.record.source, `${RUN_TAG}_income`);
  assert.equal(update.json.archiveEntry.action, "Düzenlendi");

  // Optimistic lock: reusing the now-stale updatedAt must be rejected.
  const staleUpdate = await call("PUT", `/api/records/${record.id}`, {
    cookie: adminCookie,
    body: { amount: 789, updatedAt: record.updatedAt },
  });
  assert.equal(staleUpdate.status, 409);

  const remove = await call("DELETE", `/api/records/${record.id}`, { cookie: adminCookie });
  assert.equal(remove.status, 200);
  assert.equal(remove.json.archiveEntry.action, "Silindi");
  createdRecordIds.splice(createdRecordIds.indexOf(record.id), 1);
});

test("records: invalid kind and negative amount are rejected", async () => {
  const badKind = await call("POST", "/api/records", {
    cookie: adminCookie,
    body: { kind: "bogus", date: "2026-01-15", source: "x", amount: 1 },
  });
  assert.equal(badKind.status, 400);

  const badAmount = await call("POST", "/api/records", {
    cookie: adminCookie,
    body: { kind: "income", date: "2026-01-15", source: "x", amount: -1 },
  });
  assert.equal(badAmount.status, 400);
});

test("import: assigns a fallback cash account and enforces the row limit", async () => {
  const res = await call("POST", "/api/records/import", {
    cookie: adminCookie,
    body: { items: [{ kind: "expense", date: "2026-01-16", source: `${RUN_TAG}_import`, amount: 10, currency: "USD" }] },
  });
  assert.equal(res.status, 201);
  const [imported] = res.json.records;
  createdRecordIds.push(imported.id);
  assert.equal(imported.cashAccount, "Diğer Giderler");

  const tooMany = await call("POST", "/api/records/import", {
    cookie: adminCookie,
    body: { items: Array.from({ length: 2001 }, (_, i) => ({ kind: "expense", date: "2026-01-16", source: `row${i}`, amount: 1 })) },
  });
  assert.equal(tooMany.status, 400);

  const badDate = await call("POST", "/api/records/import", {
    cookie: adminCookie,
    body: { items: [{ kind: "expense", date: "16-01-2026", source: "x", amount: 1 }] },
  });
  assert.equal(badDate.status, 400);
});

test("auth: repeated failed logins block the offending IP", async () => {
  const rateLimitIp = "203.0.113.251";
  const attempts = [];
  for (let i = 0; i < 5; i++) {
    const res = await call("POST", "/api/auth/login", {
      ip: rateLimitIp,
      body: { username: `${RUN_TAG}_nonexistent`, password: `wrong${i}` },
    });
    attempts.push(res.status);
  }
  assert.deepEqual(attempts.slice(0, 4), [401, 401, 401, 401]);
  assert.equal(attempts[4], 403);

  // Even a correct login from the now-blocked IP must be rejected.
  const stillBlocked = await call("POST", "/api/auth/login", {
    ip: rateLimitIp,
    body: { username: "admin", password: "admin123" },
  });
  assert.equal(stillBlocked.status, 403);

  const unblock = await call("DELETE", `/api/admin/blocked-ips/${encodeURIComponent(rateLimitIp)}`, { cookie: adminCookie });
  assert.equal(unblock.status, 200);
});

test.after(async () => {
  for (const id of createdRecordIds) {
    await call("DELETE", `/api/records/${id}`, { cookie: adminCookie }).catch(() => {});
  }
  if (testUserId) {
    await call("DELETE", `/api/users/${testUserId}`, { cookie: adminCookie }).catch(() => {});
  }
  await call("DELETE", `/api/admin/blocked-ips/${encodeURIComponent(TEST_IP)}`, { cookie: adminCookie }).catch(() => {});
});
