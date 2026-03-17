const { createHttpError } = require("../utils/http-error");
const {
  parsePositiveInt,
  validateEmailAddress,
  validateRequiredString,
} = require("../utils/validation");

function validateComposeRequest(req) {
  req.body.to_email = validateEmailAddress(req.body.to_email, "to_email");
  req.body.subject = validateRequiredString(req.body.subject, "subject");
  req.body.body = validateRequiredString(req.body.body, "body");

  if (req.body.reply_to_id !== undefined && req.body.reply_to_id !== null && req.body.reply_to_id !== "") {
    req.body.reply_to_id = parsePositiveInt(req.body.reply_to_id, "reply_to_id");
  } else {
    req.body.reply_to_id = null;
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
