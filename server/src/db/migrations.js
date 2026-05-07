function runMigrations(db) {
  try {
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
  } catch (error) {
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS email_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      original_size_bytes INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS attachment_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uploaded_by_user_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      original_size_bytes INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_email_attachments_email ON email_attachments(email_id);
    CREATE INDEX IF NOT EXISTS idx_attachment_uploads_user ON attachment_uploads(uploaded_by_user_id);
  `);
}

module.exports = {
  runMigrations,
};
