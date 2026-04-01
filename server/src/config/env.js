const path = require("path");

const SERVER_ROOT = path.resolve(__dirname, "../..");

require("dotenv").config({ path: path.join(SERVER_ROOT, ".env"), quiet: true });

const DEFAULT_PORT = 5000;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_UPLOAD_MAX_FILE_SIZE = 5 * 1024 * 1024;

function parsePort(value) {
  if (!value) {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function requireJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    return process.env.JWT_SECRET.trim();
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }

  return "campus-mail-secret-key";
}

module.exports = {
  host: process.env.HOST || DEFAULT_HOST,
  jwtSecret: requireJwtSecret(),
  port: parsePort(process.env.PORT),
  serverRoot: SERVER_ROOT,
  uploadMaxFileSize: DEFAULT_UPLOAD_MAX_FILE_SIZE,
};
