import { getSessionUser } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";

export const GET = withErrorHandling(async (request: Request) => {
  const user = await getSessionUser(request);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  return json({
    profile: {
      name: user.name,
      username: user.username,
      role: user.roleLabel,
      isAdmin: user.isAdmin,
      permissions: user.permissions,
      avatar: user.avatar,
    },
  });
});
