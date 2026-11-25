import crypto from "node:crypto";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createClient } from "@libsql/client";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

async function main() {
  const dbPath = path.join(process.cwd(), "data", "keel.db").replace(/\\/g, "/");
  const client = createClient({ url: `file:${dbPath}` });

  const rl = readline.createInterface({ input, output });
  try {
    let email = process.argv[2]?.trim().toLowerCase() ?? "";
    if (!email) {
      email = (await rl.question("User email: ")).trim().toLowerCase();
    }

    const existing = await client.execute({
      sql: "SELECT id, name, email FROM users WHERE email = ?",
      args: [email],
    });

    if (existing.rows.length === 0) {
      console.error(`No user found with email: ${email}`);
      process.exitCode = 1;
      return;
    }

    let password = process.argv[3] ?? "";
    if (!password) {
      password = await rl.question("New password (min 8 chars): ");
    }

    if (password.length < 8) {
      console.error("Password must be at least 8 characters.");
      process.exitCode = 1;
      return;
    }

    const hash = hashPassword(password);
    const userId = String(existing.rows[0].id);

    await client.execute({
      sql: "UPDATE users SET password_hash = ? WHERE id = ?",
      args: [hash, userId],
    });
    await client.execute({
      sql: "DELETE FROM sessions WHERE user_id = ?",
      args: [userId],
    });

    console.log(`Password updated and old sessions revoked for ${email}.`);
  } finally {
    rl.close();
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
