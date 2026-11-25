import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const legacyDbPath = path.join(dataDir, "notjira.db");
const targetDbPath = path.join(dataDir, "keel.db");
if (!fs.existsSync(targetDbPath) && fs.existsSync(legacyDbPath)) {
  fs.renameSync(legacyDbPath, targetDbPath);
}

const dbPath = targetDbPath.replace(/\\/g, "/");

declare global {
  var __keelClient: Client | undefined;
  var __keelInitialized: Promise<void> | undefined;
}

const client =
  globalThis.__keelClient ??
  createClient({
    url: `file:${dbPath}`,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__keelClient = client;
}

export const db = drizzle(client, { schema });

async function initTables() {
  await client.execute("PRAGMA journal_mode = WAL;");
  await client.execute("PRAGMA busy_timeout = 5000;");
  await client.execute("PRAGMA foreign_keys = ON;");

  await client.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Layers',
      color TEXT NOT NULL DEFAULT '#3b82f6',
      item_counter INTEGER NOT NULL DEFAULT 0,
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS item_types (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      plural_name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'CheckSquare',
      color TEXT NOT NULL DEFAULT '#3b82f6',
      level INTEGER NOT NULL DEFAULT 2,
      position INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Safe migration for existing databases created before item_types.level existed
  try {
    await client.execute(
      `ALTER TABLE item_types ADD COLUMN level INTEGER NOT NULL DEFAULT 2;`
    );
    // Assign sensible default levels to seeded types
    await client.execute(
      `UPDATE item_types SET level = 1 WHERE lower(name) IN ('initiative', 'epic', 'goal', 'objective');`
    );
    await client.execute(
      `UPDATE item_types SET level = 2 WHERE lower(name) IN ('feature', 'story', 'idea', 'experiment');`
    );
    await client.execute(
      `UPDATE item_types SET level = 3 WHERE lower(name) IN ('task', 'defect', 'bug');`
    );
    await client.execute(
      `UPDATE item_types SET level = 4 WHERE lower(name) IN ('subtask', 'sub-task', 'subitem');`
    );
  } catch {
    // Column already exists
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS statuses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'todo',
      color TEXT NOT NULL DEFAULT '#64748b',
      position INTEGER NOT NULL DEFAULT 0,
      wip_limit INTEGER
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS custom_fields (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      options TEXT NOT NULL DEFAULT '[]',
      applicable_type_ids TEXT NOT NULL DEFAULT '[]',
      show_on_card INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type_id TEXT NOT NULL REFERENCES item_types(id),
      status_id TEXT NOT NULL REFERENCES statuses(id),
      priority TEXT NOT NULL DEFAULT 'medium',
      owner_id TEXT,
      parent_id TEXT,
      labels TEXT NOT NULL DEFAULT '[]',
      due_date TEXT,
      custom_fields TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Safe migration for existing databases created before items.owner_id existed
  try {
    await client.execute(`ALTER TABLE items ADD COLUMN owner_id TEXT;`);
  } catch {
    // Column already exists
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      author TEXT NOT NULL DEFAULT 'You',
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS views (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      layout TEXT NOT NULL DEFAULT 'board',
      query TEXT NOT NULL DEFAULT '',
      filters TEXT NOT NULL DEFAULT '{}',
      hidden_status_ids TEXT NOT NULL DEFAULT '[]',
      swimlane_by TEXT NOT NULL DEFAULT 'none',
      compact INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_master_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // Safe migration for existing databases created before users.is_master_admin existed
  try {
    await client.execute(
      `ALTER TABLE users ADD COLUMN is_master_admin INTEGER NOT NULL DEFAULT 0;`
    );
  } catch {
    // Column already exists
  }

  // Ensure at least one master admin exists if users already exist
  const adminCheck = await client.execute(
    `SELECT COUNT(*) AS cnt FROM users WHERE is_master_admin = 1;`
  );
  const adminCount = Number(adminCheck.rows[0]?.cnt ?? 0);
  if (adminCount === 0) {
    await client.execute(`
      UPDATE users
      SET is_master_admin = 1
      WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1);
    `);
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS passkeys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT NOT NULL DEFAULT '[]',
      device_name TEXT NOT NULL DEFAULT 'Passkey',
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS webauthn_challenges (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      user_id TEXT,
      purpose TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      UNIQUE(project_id, user_id)
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS project_invitations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      token TEXT NOT NULL UNIQUE,
      invited_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      accepted_at TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

export async function ensureDbReady() {
  if (!globalThis.__keelInitialized) {
    globalThis.__keelInitialized = (async () => {
      await initTables();
    })();
  }
  await globalThis.__keelInitialized;
  await client.execute("PRAGMA foreign_keys = ON;");
}
