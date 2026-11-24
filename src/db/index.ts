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
      parent_id TEXT,
      labels TEXT NOT NULL DEFAULT '[]',
      due_date TEXT,
      custom_fields TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

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
}

export async function ensureDbReady() {
  if (!globalThis.__keelInitialized) {
    globalThis.__keelInitialized = (async () => {
      await initTables();
      const { seedIfEmpty } = await import("./seed");
      await seedIfEmpty();
    })();
  }
  await globalThis.__keelInitialized;
  await client.execute("PRAGMA foreign_keys = ON;");
}
