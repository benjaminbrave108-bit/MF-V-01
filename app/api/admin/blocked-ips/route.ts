import { requireAdmin } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { listBlockedIps } from "../../_lib/security";

export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const rows = await listBlockedIps();
  return json({ blockedIps: rows });
});
