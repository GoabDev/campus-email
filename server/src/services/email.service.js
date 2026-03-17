const emailRepository = require("../repositories/email.repository");
const metadataRepository = require("../repositories/user-email-metadata.repository");
const userRepository = require("../repositories/user.repository");
const { createHttpError } = require("../utils/http-error");

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
  const { to_email, subject, body, reply_to_id } = payload;

  if (!to_email || !subject || !body) {
    throw createHttpError(400, "to_email, subject, and body are required");
  }

  const recipient = userRepository.findByEmail(to_email);

  if (!recipient) {
    throw createHttpError(400, "Recipient not found");
  }

  if (recipient.id === userId) {
    throw createHttpError(400, "Cannot send email to yourself");
  }

  if (reply_to_id && !getUserEmailRole(reply_to_id, userId)) {
    throw createHttpError(400, "Invalid reply_to_id");
  }

  const result = emailRepository.createEmail(
    userId,
    recipient.id,
    subject,
    body,
    reply_to_id || null,
  );

  return { message: "Email sent", emailId: result.lastInsertRowid };
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
