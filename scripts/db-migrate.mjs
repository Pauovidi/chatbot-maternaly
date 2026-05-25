#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "db", "migrations");

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const id = Number.parseInt(file.split("_")[0], 10);
    const existing = await pool.query(
      "SELECT 1 FROM hotel_schema_migrations WHERE id = $1",
      [id],
    ).catch(() => ({ rowCount: 0 }));

    if (existing.rowCount) {
      console.log(`[skip] ${file}`);
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO hotel_schema_migrations (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
        [id, file],
      );
      await client.query("COMMIT");
      console.log(`[ok] ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
