const fs = require("fs");
const path = require("path");
const { avatarsUploadPath } = require("../config/paths");
const userRepository = require("../repositories/user.repository");
const { createHttpError } = require("../utils/http-error");

function deleteAvatarFile(filename) {
  if (!filename) {
    return;
  }

  const avatarPath = path.join(avatarsUploadPath, filename);
  if (fs.existsSync(avatarPath)) {
    fs.unlinkSync(avatarPath);
  }
}

function uploadAvatar(userId, file) {
  if (!file) {
    throw createHttpError(400, "No file uploaded");
  }

  const user = userRepository.findAvatarById(userId);
  deleteAvatarFile(user.avatar);
  userRepository.updateAvatar(userId, file.filename);

  return { avatar: `/uploads/avatars/${file.filename}` };
}

function removeAvatar(userId) {
  const user = userRepository.findAvatarById(userId);
  deleteAvatarFile(user.avatar);
  userRepository.updateAvatar(userId, null);

  return { message: "Avatar removed" };
}

module.exports = {
  removeAvatar,
  uploadAvatar,
};
