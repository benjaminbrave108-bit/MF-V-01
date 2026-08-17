import { requireAdmin } from "../../../_lib/auth";
import { json, withErrorHandling } from "../../../_lib/http";
import { unblockIp } from "../../../_lib/security";

export const DELETE = withErrorHandling<{ params: Promise<{ ip: string }> }>(async (request, { params }) => {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const { ip } = await params;
  await unblockIp(decodeURIComponent(ip));
  return json({ ok: true });
});
