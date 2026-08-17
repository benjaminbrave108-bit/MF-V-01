import { requireAdmin } from "../../../_lib/auth";
import { json } from "../../../_lib/http";
import { unblockIp } from "../../../_lib/security";

export async function DELETE(request: Request, { params }: { params: Promise<{ ip: string }> }) {
  const session = await requireAdmin(request);
  if ("response" in session) return session.response;

  const { ip } = await params;
  await unblockIp(decodeURIComponent(ip));
  return json({ ok: true });
}
