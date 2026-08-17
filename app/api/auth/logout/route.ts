import { clearSessionCookieHeader, destroySession, getSessionToken } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";

export const POST = withErrorHandling(async (request: Request) => {
  const token = getSessionToken(request);
  if (token) await destroySession(token);
  return json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } });
});
