import { requireAdmin } from "../../_lib/auth";
import { json } from "../../_lib/http";
import { listBlockedIps } from "../../_lib/security";

export async function GET(request: Request) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const rows = await listBlockedIps();
  return json({ blockedIps: rows });
}
