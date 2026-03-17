const { runMigrations } = require("./migrations");
const { indexSql, schemaSql } = require("./schema");

function initializeDatabase(db) {
  db.pragma("journal_mode = WAL");
  db.exec(schemaSql);
  runMigrations(db);
  db.exec(indexSql);
  return db;
}

module.exports = {
  initializeDatabase,
};
