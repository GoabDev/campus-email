const path = require("path");
const { serverRoot } = require("./env");

const uploadsPath = path.join(serverRoot, "uploads");
const avatarsUploadPath = path.join(uploadsPath, "avatars");
const clientDistPath = path.join(serverRoot, "../client/dist");

module.exports = {
  avatarsUploadPath,
  clientDistPath,
  uploadsPath,
};
