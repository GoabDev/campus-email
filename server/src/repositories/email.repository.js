const db = require("../db");

function findOwnership(emailId) {
  return db
    .prepare("SELECT from_user_id, to_user_id FROM emails WHERE id = ?")
    .get(emailId);
}

function createEmail(fromUserId, toUserId, subject, body, replyToId) {
  return db
    .prepare(
      "INSERT INTO emails (from_user_id, to_user_id, subject, body, reply_to_id) VALUES (?, ?, ?, ?, ?)",
    )
    .run(fromUserId, toUserId, subject, body, replyToId);
}

function findInboxByUserId(userId) {
  return db
    .prepare(
      `
    SELECT emails.*, users.name as from_name, users.email as from_email,
           COALESCE(uem.is_starred, 0) as is_starred
    FROM emails
    JOIN users ON emails.from_user_id = users.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE emails.to_user_id = ?
      AND COALESCE(uem.is_deleted, 0) = 0
    ORDER BY emails.created_at DESC
  `,
    )
    .all(userId, userId);
}

function findSentByUserId(userId) {
  return db
    .prepare(
      `
    SELECT emails.*, users.name as to_name, users.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred
    FROM emails
    JOIN users ON emails.to_user_id = users.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE emails.from_user_id = ?
      AND COALESCE(uem.is_deleted, 0) = 0
    ORDER BY emails.created_at DESC
  `,
    )
    .all(userId, userId);
}

function findStarredByUserId(userId) {
  return db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           1 as is_starred
    FROM emails
    JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    WHERE uem.is_starred = 1
      AND uem.is_deleted = 0
      AND (emails.from_user_id = ? OR emails.to_user_id = ?)
    ORDER BY emails.created_at DESC
  `,
    )
    .all(userId, userId, userId);
}

function findTrashByUserId(userId) {
  return db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           uem.deleted_at
    FROM emails
    JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    WHERE uem.is_deleted = 1
      AND (emails.from_user_id = ? OR emails.to_user_id = ?)
    ORDER BY uem.deleted_at DESC
  `,
    )
    .all(userId, userId, userId);
}

function searchByUserId(userId, folder, searchTerm, limit, offset) {
  let folderCondition = "(emails.from_user_id = ? OR emails.to_user_id = ?)";
  let folderParams = [userId, userId];

  if (folder === "inbox") {
    folderCondition = "emails.to_user_id = ?";
    folderParams = [userId];
  } else if (folder === "sent") {
    folderCondition = "emails.from_user_id = ?";
    folderParams = [userId];
  }

  const total = db
    .prepare(
      `
    SELECT COUNT(*) as total
    FROM emails
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE ${folderCondition}
      AND COALESCE(uem.is_deleted, 0) = 0
      AND (emails.subject LIKE ? OR emails.body LIKE ? OR sender.name LIKE ? OR recipient.name LIKE ?)
  `,
    )
    .get(
      userId,
      ...folderParams,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
    );

  const emails = db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred
    FROM emails
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE ${folderCondition}
      AND COALESCE(uem.is_deleted, 0) = 0
      AND (emails.subject LIKE ? OR emails.body LIKE ? OR sender.name LIKE ? OR recipient.name LIKE ?)
    ORDER BY emails.created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(
      userId,
      ...folderParams,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      limit,
      offset,
    );

  return { emails, total: total.total };
}

function countUnreadByUserId(userId) {
  return db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM emails
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE emails.to_user_id = ?
      AND emails.is_read = 0
      AND COALESCE(uem.is_deleted, 0) = 0
  `,
    )
    .get(userId, userId);
}

function findByIdForUser(emailId, userId) {
  return db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred
    FROM emails
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    WHERE emails.id = ? AND (emails.to_user_id = ? OR emails.from_user_id = ?)
  `,
    )
    .get(userId, emailId, userId, userId);
}

function markAsRead(emailId) {
  return db.prepare("UPDATE emails SET is_read = 1 WHERE id = ?").run(emailId);
}

function findThreadForUser(emailId, userId) {
  return db
    .prepare(
      `
    WITH RECURSIVE
      ancestors AS (
        SELECT id, reply_to_id FROM emails WHERE id = ?
        UNION ALL
        SELECT e.id, e.reply_to_id FROM emails e
        JOIN ancestors a ON e.id = a.reply_to_id
      ),
      root AS (
        SELECT id FROM ancestors WHERE reply_to_id IS NULL
      ),
      thread AS (
        SELECT id FROM root
        UNION ALL
        SELECT e.id FROM emails e
        JOIN thread t ON e.reply_to_id = t.id
      )
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred
    FROM thread
    JOIN emails ON thread.id = emails.id
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE emails.from_user_id = ? OR emails.to_user_id = ?
    ORDER BY emails.created_at ASC
  `,
    )
    .all(emailId, userId, userId, userId);
}

function findRecipientReadStatus(emailId) {
  return db
    .prepare("SELECT to_user_id, is_read FROM emails WHERE id = ?")
    .get(emailId);
}

function updateReadStatus(emailId, isRead) {
  return db.prepare("UPDATE emails SET is_read = ? WHERE id = ?").run(isRead, emailId);
}

module.exports = {
  countUnreadByUserId,
  createEmail,
  findByIdForUser,
  findInboxByUserId,
  findOwnership,
  findRecipientReadStatus,
  findSentByUserId,
  findStarredByUserId,
  findThreadForUser,
  findTrashByUserId,
  markAsRead,
  searchByUserId,
  updateReadStatus,
};
