// One-off script: seeds the default accounts into Postgres with hashed
// passwords read from env (never hardcoded). Run manually after Stage 0/1 setup:
//   node --env-file=.env.local scripts/seed-users.mjs
// Safe to re-run: existing usernames are updated (upsert), not duplicated.
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scryptAsync = promisify(scrypt);

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

const defaultAccounts = [
  { username: "admin", passwordEnv: "SEED_ADMIN_PASSWORD", name: "Admin", roleLabel: "Yönetici", isAdmin: true, permissions: [] },
  { username: "manager", passwordEnv: "SEED_MANAGER_PASSWORD", name: "Finans Müdürü", roleLabel: "Yönetici", isAdmin: true, permissions: [] },
  { username: "user", passwordEnv: "SEED_USER_PASSWORD", name: "Veri Girişi", roleLabel: "Kullanıcı", isAdmin: false, permissions: ["cash", "income", "expense"] },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run with --env-file=.env.local.");
    process.exit(1);
  }

  const accounts = [];
  for (const account of defaultAccounts) {
    const password = process.env[account.passwordEnv];
    if (!password || password.length < 10) {
      console.error(
        `${account.passwordEnv} is not set (or shorter than 10 characters). ` +
        `Set it in .env.local before seeding the "${account.username}" account.`,
      );
      process.exit(1);
    }
    accounts.push({ ...account, password });
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const account of accounts) {
      const passwordHash = await hashPassword(account.password);
      await client.query(
        `INSERT INTO users (username, password_hash, name, role_label, is_admin, permissions)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (username) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           name = EXCLUDED.name,
           role_label = EXCLUDED.role_label,
           is_admin = EXCLUDED.is_admin,
           permissions = EXCLUDED.permissions,
           updated_at = now()`,
        [account.username, passwordHash, account.name, account.roleLabel, account.isAdmin, JSON.stringify(account.permissions)],
      );
      console.log(`Seeded user: ${account.username}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
