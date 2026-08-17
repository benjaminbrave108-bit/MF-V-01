// One-off script: seeds the default accounts into Postgres with hashed
// passwords. Run manually after Stage 0/1 setup:
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
  { username: "admin", password: "admin123", name: "Admin", roleLabel: "Yönetici", isAdmin: true, permissions: [] },
  { username: "manager", password: "manager123", name: "Finans Müdürü", roleLabel: "Yönetici", isAdmin: true, permissions: [] },
  { username: "user", password: "user123", name: "Veri Girişi", roleLabel: "Kullanıcı", isAdmin: false, permissions: ["cash", "income", "expense"] },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run with --env-file=.env.local.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const account of defaultAccounts) {
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
