import { onlineUserIds, requireSession } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";

// Kullanıcılar sayfasındaki çevrimiçi noktası için — sadece adminler tüm
// listeyi görür (bir kullanıcının kimlerin şu an aktif olduğunu görmesi bir
// yönetim bilgisi); sıradan bir kullanıcı yalnızca kendi id'sini alır.
export const GET = withErrorHandling(async (request: Request) => {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  if (!session.user.isAdmin) return json({ onlineUserIds: [session.user.id] });

  const ids = await onlineUserIds();
  return json({ onlineUserIds: ids });
});
