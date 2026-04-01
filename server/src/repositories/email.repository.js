const db = require("../db");

const VOICE_NOTE_SELECT = `
           evn.file_name as voice_note_file_name,
           evn.file_path as voice_note_file_path,
           evn.mime_type as voice_note_mime_type,
           evn.size_bytes as voice_note_size_bytes,
           evn.duration_seconds as voice_note_duration_seconds`;

const EMAIL_VOICE_NOTE_JOIN =
  "LEFT JOIN email_voice_notes evn ON evn.email_id = emails.id";

function serializeEmail(email) {
  const {
    voice_note_file_name,
    voice_note_file_path,
    voice_note_mime_type,
    voice_note_size_bytes,
    voice_note_duration_seconds,
    ...rest
  } = email;

  return {
    ...rest,
    voice_note: voice_note_file_path
      ? {
          file_name: voice_note_file_name,
          url: `/uploads/${String(voice_note_file_path).replace(/\\/g, "/")}`,
          mime_type: voice_note_mime_type,
          size_bytes: voice_note_size_bytes,
          duration_seconds: voice_note_duration_seconds,
        }
      : null,
  };
}

function serializeEmails(emails) {
  return emails.map(serializeEmail);
}

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

function createEmails(fromUserId, recipientIds, subject, body, replyToId) {
  const insertEmail = db.prepare(
    "INSERT INTO emails (from_user_id, to_user_id, subject, body, reply_to_id) VALUES (?, ?, ?, ?, ?)",
  );

  const insertMany = db.transaction((ids) =>
    ids.map((recipientId) => {
      const result = insertEmail.run(
        fromUserId,
        recipientId,
        subject,
        body,
        replyToId,
      );

      return Number(result.lastInsertRowid);
    }),
  );

  return insertMany(recipientIds);
}

function createVoiceNotes(emailIds, voiceNote) {
  const insertVoiceNote = db.prepare(
    `INSERT INTO email_voice_notes (
      email_id,
      file_name,
      file_path,
      mime_type,
      size_bytes,
      duration_seconds
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const insertMany = db.transaction((ids) => {
    ids.forEach((emailId) => {
      insertVoiceNote.run(
        emailId,
        voiceNote.file_name,
        voiceNote.file_path,
        voiceNote.mime_type,
        voiceNote.size_bytes,
        voiceNote.duration_seconds,
      );
    });
  });

  insertMany(emailIds);
}

function createVoiceNoteUpload(userId, voiceNote) {
  return db
    .prepare(
      `INSERT INTO voice_note_uploads (
        uploaded_by_user_id,
        file_name,
        file_path,
        mime_type,
        size_bytes,
        duration_seconds
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      voiceNote.file_name,
      voiceNote.file_path,
      voiceNote.mime_type,
      voiceNote.size_bytes,
      voiceNote.duration_seconds,
    );
}

function findVoiceNoteUploadById(uploadId, userId) {
  return db
    .prepare(
      `SELECT *
       FROM voice_note_uploads
       WHERE id = ? AND uploaded_by_user_id = ?`,
    )
    .get(uploadId, userId);
}

function findExpiredVoiceNoteUploads(maxAgeHours) {
  return db
    .prepare(
      `SELECT *
       FROM voice_note_uploads
       WHERE created_at <= datetime('now', ?)`,
    )
    .all(`-${maxAgeHours} hours`);
}

function deleteVoiceNoteUpload(uploadId) {
  return db.prepare("DELETE FROM voice_note_uploads WHERE id = ?").run(uploadId);
}

function findInboxByUserId(userId) {
  return serializeEmails(
    db
      .prepare(
        `
    SELECT emails.*, users.name as from_name, users.email as from_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN users ON emails.from_user_id = users.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.to_user_id = ?
      AND COALESCE(uem.is_deleted, 0) = 0
    ORDER BY emails.created_at DESC
  `,
      )
      .all(userId, userId),
  );
}

function findSentByUserId(userId) {
  return serializeEmails(
    db
      .prepare(
        `
    SELECT emails.*, users.name as to_name, users.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN users ON emails.to_user_id = users.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.from_user_id = ?
      AND COALESCE(uem.is_deleted, 0) = 0
    ORDER BY emails.created_at DESC
  `,
      )
      .all(userId, userId),
  );
}

function findStarredByUserId(userId) {
  return serializeEmails(
    db
      .prepare(
        `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           1 as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE uem.is_starred = 1
      AND uem.is_deleted = 0
      AND (emails.from_user_id = ? OR emails.to_user_id = ?)
    ORDER BY emails.created_at DESC
  `,
      )
      .all(userId, userId, userId),
  );
}

function findTrashByUserId(userId) {
  return serializeEmails(
    db
      .prepare(
        `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           uem.deleted_at,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE uem.is_deleted = 1
      AND (emails.from_user_id = ? OR emails.to_user_id = ?)
    ORDER BY uem.deleted_at DESC
  `,
      )
      .all(userId, userId, userId),
  );
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
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
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

  return { emails: serializeEmails(emails), total: total.total };
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
  const email = db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.id = ? AND (emails.to_user_id = ? OR emails.from_user_id = ?)
  `,
    )
    .get(userId, emailId, userId, userId);

  return email ? serializeEmail(email) : null;
}

function markAsRead(emailId) {
  return db.prepare("UPDATE emails SET is_read = 1 WHERE id = ?").run(emailId);
}

function findThreadForUser(emailId, userId) {
  return serializeEmails(
    db
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
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM thread
    JOIN emails ON thread.id = emails.id
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.from_user_id = ? OR emails.to_user_id = ?
    ORDER BY emails.created_at ASC
  `,
      )
      .all(emailId, userId, userId, userId),
  );
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
  createEmails,
  createVoiceNoteUpload,
  createVoiceNotes,
  deleteVoiceNoteUpload,
  findByIdForUser,
  findInboxByUserId,
  findOwnership,
  findRecipientReadStatus,
  findSentByUserId,
  findStarredByUserId,
  findThreadForUser,
  findTrashByUserId,
  findExpiredVoiceNoteUploads,
  findVoiceNoteUploadById,
  markAsRead,
  searchByUserId,
  updateReadStatus,
};
