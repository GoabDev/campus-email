const Database = require("better-sqlite3");
const db = new Database("mail.db");

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    reply_to_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id),
    FOREIGN KEY (to_user_id) REFERENCES users(id),
    FOREIGN KEY (reply_to_id) REFERENCES emails(id)
  );

  CREATE TABLE IF NOT EXISTS email_voice_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id INTEGER NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_seconds REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_email_metadata (
    user_id INTEGER NOT NULL,
    email_id INTEGER NOT NULL,
    is_starred INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    deleted_at DATETIME,
    PRIMARY KEY (user_id, email_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
  );
`);

// Migrate: add avatar column if missing (for existing databases)
try {
  db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
} catch (e) {
  // Column already exists
}

// Create indexes for query performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_emails_to_user ON emails(to_user_id);
  CREATE INDEX IF NOT EXISTS idx_emails_from_user ON emails(from_user_id);
  CREATE INDEX IF NOT EXISTS idx_emails_reply_to ON emails(reply_to_id);
  CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at);
  CREATE INDEX IF NOT EXISTS idx_emails_subject ON emails(subject);
  CREATE INDEX IF NOT EXISTS idx_uem_user ON user_email_metadata(user_id);
  CREATE INDEX IF NOT EXISTS idx_uem_starred ON user_email_metadata(user_id, is_starred);
  CREATE INDEX IF NOT EXISTS idx_uem_deleted ON user_email_metadata(user_id, is_deleted);
  CREATE INDEX IF NOT EXISTS idx_voice_notes_email ON email_voice_notes(email_id);
`);

module.exports = db;
