const { createHttpError } = require("../utils/http-error");
const {
  isNonEmptyString,
  parsePositiveInt,
  validateEmailAddress,
  validateRequiredString,
} = require("../utils/validation");

function validateComposeRequest(req) {
  req.body.subject = validateRequiredString(req.body.subject, "subject");
  req.body.body = typeof req.body.body === "string" ? req.body.body.trim() : "";

  const hasSingleRecipient = req.body.to_email !== undefined && req.body.to_email !== null && req.body.to_email !== "";
  const hasManyRecipients = Array.isArray(req.body.to_emails);
  const hasVoiceNote = isNonEmptyString(req.body.voice_note_base64);

  if (!hasSingleRecipient && !hasManyRecipients) {
    throw createHttpError(400, "to_email or to_emails is required");
  }

  if (!req.body.body && !hasVoiceNote) {
    throw createHttpError(400, "body or voice_note_base64 is required");
  }

  if (hasSingleRecipient) {
    req.body.to_email = validateEmailAddress(req.body.to_email, "to_email");
  }

  if (hasManyRecipients) {
    if (req.body.to_emails.length === 0) {
      throw createHttpError(400, "to_emails must contain at least one recipient");
    }

    req.body.to_emails = req.body.to_emails.map((email, index) =>
      validateEmailAddress(email, `to_emails[${index}]`),
    );
  }

  if (req.body.reply_to_id !== undefined && req.body.reply_to_id !== null && req.body.reply_to_id !== "") {
    req.body.reply_to_id = parsePositiveInt(req.body.reply_to_id, "reply_to_id");
  } else {
    req.body.reply_to_id = null;
  }

  if (req.body.voice_note_duration_seconds !== undefined && req.body.voice_note_duration_seconds !== null && req.body.voice_note_duration_seconds !== "") {
    const duration = Number(req.body.voice_note_duration_seconds);
    if (!Number.isFinite(duration) || duration < 0) {
      throw createHttpError(400, "voice_note_duration_seconds must be a valid number");
    }
    req.body.voice_note_duration_seconds = duration;
  } else {
    req.body.voice_note_duration_seconds = null;
  }
}

function validateEmailIdParam(req) {
  req.params.id = String(parsePositiveInt(req.params.id, "id"));
}

function validateSearchRequest(req) {
  req.query.q = validateRequiredString(req.query.q, "q");

  if (req.query.page !== undefined) {
    req.query.page = String(parsePositiveInt(req.query.page, "page"));
  }

  if (req.query.limit !== undefined) {
    req.query.limit = String(parsePositiveInt(req.query.limit, "limit"));
  }

  if (req.query.folder !== undefined) {
    const allowedFolders = new Set(["all", "inbox", "sent"]);
    if (!allowedFolders.has(req.query.folder)) {
      throw createHttpError(400, "folder must be one of: all, inbox, sent");
    }
  }
}

function validateReadStatusRequest(req) {
  validateEmailIdParam(req);

  if (req.body.is_read !== undefined && typeof req.body.is_read !== "boolean") {
    throw createHttpError(400, "is_read must be a boolean");
  }
}

module.exports = {
  validateComposeRequest,
  validateEmailIdParam,
  validateReadStatusRequest,
  validateSearchRequest,
};
