import { clearSessionCookieHeader, destroySession, getSessionToken } from "../../_lib/auth";

export async function POST(request: Request) {
  const token = getSessionToken(request);
  if (token) await destroySession(token);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
}
