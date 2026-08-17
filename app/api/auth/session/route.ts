import { getSessionUser } from "../../_lib/auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    profile: {
      name: user.name,
      username: user.username,
      role: user.roleLabel,
      isAdmin: user.isAdmin,
      permissions: user.permissions,
      avatar: user.avatar,
    },
  });
}
