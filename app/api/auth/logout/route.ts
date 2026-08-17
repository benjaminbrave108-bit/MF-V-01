import { clearSessionCookieHeader, destroySession, getSessionToken } from "../../_lib/auth";
import { json } from "../../_lib/http";

export async function POST(request: Request) {
  const token = getSessionToken(request);
  if (token) await destroySession(token);
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
}
