function runMigrations(db) {
  try {
    db.exec("ALTER TABLE users ADD COLUMN avatar TEXT");
  } catch (error) {
  }
}

module.exports = {
  runMigrations,
};
