const db = require("../db");

function createUser(email, password, name) {
  return db
    .prepare("INSERT INTO users (email, password, name) VALUES (?, ?, ?)")
    .run(email, password, name);
}

function findByEmail(email) {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email);
}

function findById(id) {
  return db
    .prepare("SELECT id, email, name, avatar, created_at FROM users WHERE id = ?")
    .get(id);
}

function findAvatarById(id) {
  return db.prepare("SELECT avatar FROM users WHERE id = ?").get(id);
}

function findAllExceptUserId(userId) {
  return db
    .prepare("SELECT id, email, name, avatar FROM users WHERE id != ?")
    .all(userId);
}

function updateAvatar(userId, avatar) {
  return db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(avatar, userId);
}

module.exports = {
  createUser,
  findAllExceptUserId,
  findAvatarById,
  findByEmail,
  findById,
  updateAvatar,
};
