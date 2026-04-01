const { createHttpError } = require("./http-error");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function parsePositiveInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, `${fieldName} must be a positive integer`);
  }

  return parsed;
}

function validateEmailAddress(value, fieldName = "email") {
  if (!isNonEmptyString(value)) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  const email = value.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw createHttpError(400, `${fieldName} must be a valid email address`);
  }

  return email;
}

function validateRequiredString(value, fieldName) {
  if (!isNonEmptyString(value)) {
    throw createHttpError(400, `${fieldName} is required`);
  }

  return value.trim();
}

module.exports = {
  isNonEmptyString,
  parsePositiveInt,
  validateEmailAddress,
  validateRequiredString,
};
