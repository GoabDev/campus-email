const Database = require("better-sqlite3");
const { initializeDatabase } = require("./init");

const db = initializeDatabase(new Database("mail.db"));

module.exports = db;
