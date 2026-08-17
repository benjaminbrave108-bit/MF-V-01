import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { users } from "../../../../db/schema";
import { verifyPassword } from "../../../../db/passwords";
import { createSession, sessionCookieHeader } from "../../_lib/auth";
import { json, withErrorHandling } from "../../_lib/http";
import { clearAttempts, getClientIp, isRateLimited, recordFailedAttempt } from "../../_lib/rate-limit";
import { blockIp, isIpBlocked, lockUserAccount } from "../../_lib/security";
import type { Page } from "../../_lib/types";

const LOCK_REASON = "5 ardışık başarısız giriş denemesi";

export const POST = withErrorHandling(async (request: Request) => {
  const ip = getClientIp(request);
  if (await isIpBlocked(ip)) {
    return json(
      { error: "Bu IP adresinden erişim engellendi. Yöneticinizle iletişime geçin.", code: "ip_blocked" },
      { status: 403 },
    );
  }

  let payload: { username?: string; password?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request body" }, { status: 400 });
  }
  const username = payload.username?.trim() ?? "";
  const password = payload.password ?? "";
  if (!username || !password) {
    return json({ error: "Username and password are required" }, { status: 400 });
  }

  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const account = rows[0];

  if (account?.locked) {
    return json(
      { error: "Hesabınız güvenlik nedeniyle kilitlendi. Yönetici onayı bekleniyor.", code: "account_locked" },
      { status: 403 },
    );
  }

  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    // Tracked separately: the IP counter catches an attacker spraying many
    // usernames from one address, the account counter catches one account
    // being attacked from many/rotating addresses.
    const ipKey = `login-ip:${ip}`;
    const acctKey = `login-acct:${username.toLowerCase()}`;
    recordFailedAttempt(ipKey);
    recordFailedAttempt(acctKey);

    if (isRateLimited(ipKey) !== null) {
      await blockIp(ip, LOCK_REASON);
      return json(
        { error: "Bu IP adresinden çok fazla başarısız deneme yapıldı. Erişim engellendi.", code: "ip_blocked" },
        { status: 403 },
      );
    }
    if (account && isRateLimited(acctKey) !== null) {
      await lockUserAccount(account.id, LOCK_REASON);
      return json(
        { error: "Hesabınız güvenlik nedeniyle kilitlendi. Yönetici onayı bekleniyor.", code: "account_locked" },
        { status: 403 },
      );
    }

    return json({ error: "Kullanıcı adı veya şifre hatalı" }, { status: 401 });
  }

  clearAttempts(`login-ip:${ip}`);
  clearAttempts(`login-acct:${username.toLowerCase()}`);

  const { token, expiresAt } = await createSession(account.id);

  return json(
    {
      profile: {
        name: account.name,
        username: account.username,
        role: account.roleLabel,
        isAdmin: account.isAdmin,
        permissions: (account.permissions as Page[]) ?? [],
        avatar: account.avatar,
      },
    },
    { status: 200, headers: { "Set-Cookie": sessionCookieHeader(token, expiresAt) } },
  );
});
