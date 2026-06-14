// Initialize SQLite database from schema.sql
// MVP uses SQLite. DATABASE_URL is reserved for future Postgres migration.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH =
  process.env.SQLITE_PATH ||
  process.env.DB_PATH ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')
    ? process.env.DATABASE_URL.replace(/^file:/, '')
    : null) ||
  path.join(__dirname, '..', '..', 'database', 'nibs.db');

function init() {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('file:') && !process.env.DATABASE_URL.startsWith('sqlite:')) {
    console.warn('[db] DATABASE_URL is set but is not SQLite; MVP runs on SQLite. Set DATABASE_URL=file:/data/nibs.db for a custom path, or unset it.');
  }
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  // Idempotent migrations: add columns that might be missing in an older DB.
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('must_change_password')) {
    try { db.exec("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
  }
  db.close();
  console.log('[db] Initialized at', DB_PATH);
}

if (require.main === module) init();
module.exports = { init };
