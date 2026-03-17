const db = require("../db");

function toggleStar(userId, emailId) {
  return db
    .prepare(
      `
    INSERT INTO user_email_metadata (user_id, email_id, is_starred)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, email_id)
    DO UPDATE SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END
  `,
    )
    .run(userId, emailId);
}

function getStarStatus(userId, emailId) {
  return db
    .prepare(
      "SELECT is_starred FROM user_email_metadata WHERE user_id = ? AND email_id = ?",
    )
    .get(userId, emailId);
}

function moveToTrash(userId, emailId) {
  return db
    .prepare(
      `
    INSERT INTO user_email_metadata (user_id, email_id, is_deleted, deleted_at)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, email_id)
    DO UPDATE SET is_deleted = 1, deleted_at = datetime('now')
  `,
    )
    .run(userId, emailId);
}

function restoreFromTrash(userId, emailId) {
  return db
    .prepare(
      `
    UPDATE user_email_metadata
    SET is_deleted = 0, deleted_at = NULL
    WHERE user_id = ? AND email_id = ?
  `,
    )
    .run(userId, emailId);
}

module.exports = {
  getStarStatus,
  moveToTrash,
  restoreFromTrash,
  toggleStar,
};
