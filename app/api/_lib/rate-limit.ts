// In-memory brute-force guard. Good enough for a single Node process (this
// app's deploy target); would need a shared store (Redis) behind a
// multi-instance/load-balanced deployment.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Bound memory: buckets are small and rare (only failed attempts), but
// sweep opportunistically so a long-running process doesn't accumulate
// entries for one-off attackers/typo'd usernames forever.
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function isRateLimited(key: string): number | null {
  const bucket = buckets.get(key);
  if (!bucket) return null;
  if (bucket.resetAt <= Date.now()) {
    buckets.delete(key);
    return null;
  }
  if (bucket.count >= MAX_ATTEMPTS) {
    return Math.ceil((bucket.resetAt - Date.now()) / 1000);
  }
  return null;
}

export function recordFailedAttempt(key: string): void {
  const now = Date.now();
  if (buckets.size > 10_000) sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  bucket.count += 1;
}

export function clearAttempts(key: string): void {
  buckets.delete(key);
}

function trustedProxyCount(): number {
  const n = Number(process.env.TRUSTED_PROXY_COUNT ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// Picks the real client IP: walks in from the right of X-Forwarded-For by
// TRUSTED_PROXY_COUNT hops (so a client can't just add a fake IP to the
// front of the header) — this is the path that matters in production,
// behind a reverse proxy with TRUSTED_PROXY_COUNT set. With no proxy
// configured (local dev, or a direct-exposed deployment we don't
// recommend), every request collapses to a shared "unknown" bucket;
// tests/api.test.mjs sets x-mfv01-remote-addr directly to get distinct
// per-test identities without needing a real proxy in front.
export function getClientIp(request: Request): string {
  const proxies = trustedProxyCount();
  if (proxies > 0) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const parts = forwardedFor.split(",").map((p) => p.trim()).filter(Boolean);
      const index = parts.length - proxies;
      if (index >= 0 && parts[index]) return parts[index];
    }
  }
  return request.headers.get("x-mfv01-remote-addr") || "unknown";
}
