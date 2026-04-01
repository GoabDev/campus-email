const userRepository = require("../repositories/user.repository");
const { createHttpError } = require("../utils/http-error");

function mapAvatar(user) {
  return {
    ...user,
    avatar: user.avatar ? `/uploads/avatars/${user.avatar}` : null,
  };
}

function getUsers(userId) {
  return userRepository.findAllExceptUserId(userId).map(mapAvatar);
}

function getCurrentUser(userId) {
  const user = userRepository.findById(userId);

  if (!user) {
    throw createHttpError(404, "User not found");
  }

  return mapAvatar(user);
}

module.exports = {
  getCurrentUser,
  getUsers,
};
