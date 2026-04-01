const emailRepository = require("../repositories/email.repository");
const metadataRepository = require("../repositories/user-email-metadata.repository");
const userRepository = require("../repositories/user.repository");
const { voiceNotesUploadPath } = require("../config/paths");
const { createHttpError } = require("../utils/http-error");
const fs = require("fs");
const path = require("path");
const MAX_BULK_RECIPIENTS = 50;
const MAX_VOICE_NOTE_DURATION_SECONDS = 300;
const VOICE_NOTE_UPLOAD_TTL_HOURS = 24;

fs.mkdirSync(voiceNotesUploadPath, { recursive: true });

function cleanupExpiredVoiceNoteUploads() {
  const expiredUploads =
    emailRepository.findExpiredVoiceNoteUploads(VOICE_NOTE_UPLOAD_TTL_HOURS);

  expiredUploads.forEach((upload) => {
    const fileName = path.basename(String(upload.file_path || ""));
    const absoluteFilePath = path.join(voiceNotesUploadPath, fileName);

    try {
      if (fileName && fs.existsSync(absoluteFilePath)) {
        fs.unlinkSync(absoluteFilePath);
      }
    } catch {}

    emailRepository.deleteVoiceNoteUpload(upload.id);
  });
}

function getUserEmailRole(emailId, userId) {
  const email = emailRepository.findOwnership(emailId);

  if (!email) {
    return null;
  }

  if (email.from_user_id === userId) {
    return "sender";
  }

  if (email.to_user_id === userId) {
    return "recipient";
  }

  return null;
}

function sendEmail(userId, payload) {
  cleanupExpiredVoiceNoteUploads();
  const { subject, reply_to_id } = payload;
  const body = typeof payload.body === "string" ? payload.body : "";
  const recipients = normalizeRecipients(payload);
  const voiceNoteUpload = getVoiceNoteUpload(payload, userId);

  if (!recipients.length || !subject || (!body.trim() && !voiceNoteUpload)) {
    throw createHttpError(
      400,
      "recipient, subject, and either body or voice note are required",
    );
  }

  if (recipients.length > MAX_BULK_RECIPIENTS) {
    throw createHttpError(
      400,
      `You can send to at most ${MAX_BULK_RECIPIENTS} recipients at once`,
    );
  }

  if (reply_to_id && recipients.length > 1) {
    throw createHttpError(400, "Bulk replies are not supported");
  }

  if (reply_to_id && !getUserEmailRole(reply_to_id, userId)) {
    throw createHttpError(400, "Invalid reply_to_id");
  }

  const matchedUsers = userRepository.findByEmails(recipients);
  const foundByEmail = new Map(matchedUsers.map((user) => [user.email.toLowerCase(), user]));
  const successfulRecipients = [];
  const failedRecipients = [];

  for (const email of recipients) {
    const recipient = foundByEmail.get(email);

    if (!recipient) {
      failedRecipients.push({ email, reason: "Recipient not found" });
      continue;
    }

    if (recipient.id === userId) {
      failedRecipients.push({ email, reason: "Cannot send email to yourself" });
      continue;
    }

    successfulRecipients.push(recipient);
  }

  if (!successfulRecipients.length) {
    throw createHttpError(400, "No valid recipients to send to");
  }

  const recipientIds = successfulRecipients.map((recipient) => recipient.id);

  try {
    const emailIds =
      recipientIds.length === 1
        ? [
            Number(
              emailRepository.createEmail(
                userId,
                recipientIds[0],
                subject,
                body,
                reply_to_id || null,
              ).lastInsertRowid,
            ),
          ]
        : emailRepository.createEmails(
            userId,
            recipientIds,
            subject,
            body,
            reply_to_id || null,
          );

    if (voiceNoteUpload) {
      emailRepository.createVoiceNotes(emailIds, {
        file_name: voiceNoteUpload.file_name,
        file_path: voiceNoteUpload.file_path,
        mime_type: voiceNoteUpload.mime_type,
        size_bytes: voiceNoteUpload.size_bytes,
        duration_seconds: voiceNoteUpload.duration_seconds,
      });
      emailRepository.deleteVoiceNoteUpload(voiceNoteUpload.id);
    }

    return {
      message:
        failedRecipients.length > 0
          ? "Email sent to available recipients"
          : "Email sent successfully",
      emailId: emailIds.length === 1 ? emailIds[0] : null,
      email_ids: emailIds,
      recipients: successfulRecipients.map((recipient) => recipient.email),
      failed_recipients: failedRecipients,
      sent_count: emailIds.length,
    };
  } catch (error) {
    if (error?.status) {
      throw error;
    }

    throw createHttpError(500, "Failed to send email");
  }
}

function normalizeRecipients(payload) {
  const recipients = [];

  if (payload.to_email) {
    recipients.push(payload.to_email.trim().toLowerCase());
  }

  if (Array.isArray(payload.to_emails)) {
    for (const email of payload.to_emails) {
      recipients.push(email.trim().toLowerCase());
    }
  }

  return [...new Set(recipients)];
}

function uploadVoiceNote(userId, file, payload) {
  cleanupExpiredVoiceNoteUploads();
  if (!file) {
    throw createHttpError(400, "voice_note file is required");
  }

  const duration = normalizeVoiceNoteDuration(payload.voice_note_duration_seconds);
  const relativeFilePath = path.posix.join("voice-notes", file.filename);
  const result = emailRepository.createVoiceNoteUpload(userId, {
    file_name: file.originalname || file.filename,
    file_path: relativeFilePath,
    mime_type: file.mimetype,
    size_bytes: file.size,
    duration_seconds: duration,
  });

  return {
    id: Number(result.lastInsertRowid),
    file_name: file.originalname || file.filename,
    url: `/uploads/${relativeFilePath}`,
    mime_type: file.mimetype,
    size_bytes: file.size,
    duration_seconds: duration,
  };
}

function getVoiceNoteUpload(payload, userId) {
  if (
    payload.voice_note_upload_id === undefined ||
    payload.voice_note_upload_id === null ||
    payload.voice_note_upload_id === ""
  ) {
    return null;
  }

  const uploadId = Number(payload.voice_note_upload_id);
  if (!Number.isInteger(uploadId) || uploadId <= 0) {
    throw createHttpError(400, "voice_note_upload_id must be a positive integer");
  }

  const upload = emailRepository.findVoiceNoteUploadById(uploadId, userId);
  if (!upload) {
    throw createHttpError(400, "Invalid voice_note_upload_id");
  }

  return upload;
}

function normalizeVoiceNoteDuration(rawDuration) {
  if (rawDuration === undefined || rawDuration === null || rawDuration === "") {
    return null;
  }

  const duration = Number(rawDuration);

  if (!Number.isFinite(duration) || duration < 0) {
    throw createHttpError(400, "voice_note_duration_seconds must be valid");
  }

  if (duration > MAX_VOICE_NOTE_DURATION_SECONDS) {
    throw createHttpError(
      400,
      `Voice note cannot be longer than ${MAX_VOICE_NOTE_DURATION_SECONDS} seconds`,
    );
  }

  return duration;
}

function getInbox(userId) {
  return emailRepository.findInboxByUserId(userId);
}

function getSent(userId) {
  return emailRepository.findSentByUserId(userId);
}

function getStarred(userId) {
  return emailRepository.findStarredByUserId(userId);
}

function getTrash(userId) {
  return emailRepository.findTrashByUserId(userId);
}

function searchEmails(userId, query) {
  const { q, folder = "all", page = 1, limit = 20 } = query;

  if (!q || q.trim().length === 0) {
    throw createHttpError(400, "Search query 'q' is required");
  }

  const searchTerm = `%${q.trim()}%`;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;
  const result = emailRepository.searchByUserId(
    userId,
    folder,
    searchTerm,
    limitNum,
    offset,
  );

  return {
    emails: result.emails,
    total: result.total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(result.total / limitNum),
  };
}

function getUnreadCount(userId) {
  const result = emailRepository.countUnreadByUserId(userId);
  return { count: result.count };
}

function getEmailById(userId, emailId) {
  const email = emailRepository.findByIdForUser(emailId, userId);

  if (!email) {
    throw createHttpError(404, "Email not found");
  }

  if (email.to_user_id === userId && !email.is_read) {
    emailRepository.markAsRead(emailId);
    email.is_read = 1;
  }

  return email;
}

function getThread(userId, emailId) {
  if (!getUserEmailRole(emailId, userId)) {
    throw createHttpError(404, "Email not found");
  }

  return emailRepository.findThreadForUser(emailId, userId);
}

function toggleStar(userId, emailId) {
  if (!getUserEmailRole(emailId, userId)) {
    throw createHttpError(404, "Email not found");
  }

  metadataRepository.toggleStar(userId, emailId);
  const meta = metadataRepository.getStarStatus(userId, emailId);

  return { is_starred: meta.is_starred };
}

function updateReadStatus(userId, emailId, payload) {
  const email = emailRepository.findRecipientReadStatus(emailId);

  if (!email) {
    throw createHttpError(404, "Email not found");
  }

  if (email.to_user_id !== userId) {
    throw createHttpError(403, "Only the recipient can change read status");
  }

  const newReadStatus =
    payload.is_read !== undefined ? (payload.is_read ? 1 : 0) : email.is_read ? 0 : 1;

  emailRepository.updateReadStatus(emailId, newReadStatus);
  return { is_read: newReadStatus };
}

function moveToTrash(userId, emailId) {
  if (!getUserEmailRole(emailId, userId)) {
    throw createHttpError(404, "Email not found");
  }

  metadataRepository.moveToTrash(userId, emailId);
  return { message: "Email moved to trash" };
}

function restoreEmail(userId, emailId) {
  if (!getUserEmailRole(emailId, userId)) {
    throw createHttpError(404, "Email not found");
  }

  metadataRepository.restoreFromTrash(userId, emailId);
  return { message: "Email restored" };
}

module.exports = {
  getEmailById,
  getInbox,
  getSent,
  getStarred,
  getThread,
  getTrash,
  getUnreadCount,
  moveToTrash,
  restoreEmail,
  searchEmails,
  sendEmail,
  toggleStar,
  uploadVoiceNote,
  updateReadStatus,
};
