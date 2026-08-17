// Shared response/request helpers for app/api/**/route.ts.
// See MF-V-01-DUZELTME-PLANI-1.0.9.md 1.5 (no-store) and 1.6 (origin check).

export function json(data: unknown, init?: ResponseInit): Response {
  const response = Response.json(data, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Cheap CSRF hardening: browsers always send Origin on cross-origin
// state-changing fetches, and same-origin requests from our own frontend
// also carry it. If it's present and doesn't match our own origin, reject.
// If it's absent (older clients, some same-origin cases), let the session
// cookie's SameSite=Lax do the rest of the work.
export function assertSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return null;
  return json({ error: "Origin mismatch" }, { status: 403 });
}
