import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import config from "../config.js";

sqlite3.verbose();

let db;

export function getDb() {
  if (!db) {
    db = new sqlite3.Database(config.dbPath);
  }
  return db;
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

export async function initDb() {
  await run(
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      created_at TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      install_token TEXT UNIQUE,
      agent_api_token TEXT UNIQUE,
      last_hostname TEXT,
      last_ip TEXT,
      last_seen_at TEXT,
      last_run_at TEXT,
      last_status TEXT,
      last_exit_code INTEGER,
      last_duration_seconds INTEGER,
      schedule_enabled INTEGER,
      schedule_daily_time TEXT,
      agent_version TEXT,
      created_at TEXT
    )`
  );

  const agentColumns = await all("PRAGMA table_info(agents)");
  const agentColumnNames = new Set(agentColumns.map((col) => col.name));
  if (!agentColumnNames.has("pending_poll_interval_seconds")) {
    await run("ALTER TABLE agents ADD COLUMN pending_poll_interval_seconds INTEGER");
  }
  if (!agentColumnNames.has("last_info_json")) {
    await run("ALTER TABLE agents ADD COLUMN last_info_json TEXT");
  }
  if (!agentColumnNames.has("last_info_updated_at")) {
    await run("ALTER TABLE agents ADD COLUMN last_info_updated_at TEXT");
  }
  if (!agentColumnNames.has("uptime_seconds")) {
    await run("ALTER TABLE agents ADD COLUMN uptime_seconds INTEGER");
  }
  if (!agentColumnNames.has("reboot_required")) {
    await run("ALTER TABLE agents ADD COLUMN reboot_required INTEGER");
  }
  // Per-agent local web interface settings
  if (!agentColumnNames.has("local_web_enabled")) {
    await run("ALTER TABLE agents ADD COLUMN local_web_enabled INTEGER DEFAULT 0");
  }
  if (!agentColumnNames.has("local_web_port")) {
    await run("ALTER TABLE agents ADD COLUMN local_web_port INTEGER DEFAULT 8180");
  }

  await run(
    `CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      agent_id TEXT,
      type TEXT,
      payload_json TEXT,
      status TEXT,
      result_json TEXT,
      error_message TEXT,
      created_at TEXT,
      updated_at TEXT
    )`
  );

  await run(
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`
  );

  const existing = await get("SELECT COUNT(*) AS count FROM users");
  if (!existing || existing.count === 0) {
    const now = new Date().toISOString();
    const hash = await bcrypt.hash("admin", 10);
    await run(
      "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
      ["admin", hash, now]
    );
  }
}

export const dbOps = { run, get, all };
