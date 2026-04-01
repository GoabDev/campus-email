const emailRepository = require("../repositories/email.repository");
const metadataRepository = require("../repositories/user-email-metadata.repository");
const userRepository = require("../repositories/user.repository");
const { voiceNotesUploadPath } = require("../config/paths");
const { createHttpError } = require("../utils/http-error");
const fs = require("fs");
const path = require("path");
const MAX_BULK_RECIPIENTS = 50;
const MAX_VOICE_NOTE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_NOTE_DURATION_SECONDS = 300;
const ALLOWED_VOICE_NOTE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
]);

fs.mkdirSync(voiceNotesUploadPath, { recursive: true });

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
  const { subject, reply_to_id } = payload;
  const body = typeof payload.body === "string" ? payload.body : "";
  const recipients = normalizeRecipients(payload);
  const voiceNote = normalizeVoiceNote(payload);

  if (!recipients.length || !subject || (!body.trim() && !voiceNote)) {
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
  let savedVoiceNotePath = null;

  try {
    if (voiceNote) {
      savedVoiceNotePath = path.join(voiceNotesUploadPath, voiceNote.stored_file_name);
      fs.writeFileSync(savedVoiceNotePath, voiceNote.buffer);
    }

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

    if (voiceNote) {
      emailRepository.createVoiceNotes(emailIds, {
        file_name: voiceNote.file_name,
        file_path: path.posix.join("voice-notes", voiceNote.stored_file_name),
        mime_type: voiceNote.mime_type,
        size_bytes: voiceNote.size_bytes,
        duration_seconds: voiceNote.duration_seconds,
      });
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
    if (savedVoiceNotePath && fs.existsSync(savedVoiceNotePath)) {
      fs.unlinkSync(savedVoiceNotePath);
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

function normalizeVoiceNote(payload) {
  const base64 = typeof payload.voice_note_base64 === "string"
    ? payload.voice_note_base64.trim()
    : "";

  if (!base64) {
    return null;
  }

  if (!ALLOWED_VOICE_NOTE_TYPES.has(payload.voice_note_mime_type)) {
    throw createHttpError(
      400,
      "Only audio files (WebM, OGG, MP3, MP4, M4A, WAV) are allowed",
    );
  }

  const duration =
    payload.voice_note_duration_seconds === undefined ||
    payload.voice_note_duration_seconds === null
      ? null
      : Number(payload.voice_note_duration_seconds);

  if (
    duration !== null &&
    (!Number.isFinite(duration) || duration < 0)
  ) {
    throw createHttpError(400, "voice_note_duration_seconds must be valid");
  }

  if (duration !== null && duration > MAX_VOICE_NOTE_DURATION_SECONDS) {
    throw createHttpError(
      400,
      `Voice note cannot be longer than ${MAX_VOICE_NOTE_DURATION_SECONDS} seconds`,
    );
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw createHttpError(400, "Invalid voice note payload");
  }

  if (!buffer.length) {
    throw createHttpError(400, "Invalid voice note payload");
  }

  if (buffer.length > MAX_VOICE_NOTE_SIZE_BYTES) {
    throw createHttpError(
      400,
      `Voice note file too large. Maximum size is ${Math.floor(MAX_VOICE_NOTE_SIZE_BYTES / (1024 * 1024))}MB`,
    );
  }

  const extension =
    path.extname(payload.voice_note_file_name || "").toLowerCase() ||
    getExtensionFromMimeType(payload.voice_note_mime_type);

  return {
    buffer,
    file_name: payload.voice_note_file_name || `voice-note${extension}`,
    mime_type: payload.voice_note_mime_type,
    size_bytes: buffer.length,
    duration_seconds: duration,
    stored_file_name: `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`,
  };
}

function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".mp4",
    "audio/x-m4a": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
  };

  return mimeToExt[mimeType] || "";
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
  updateReadStatus,
};
