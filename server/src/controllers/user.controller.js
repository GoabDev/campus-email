const avatarService = require("../services/avatar.service");
const userService = require("../services/user.service");

function getUsers(req, res, next) {
  try {
    return res.json(userService.getUsers(req.user.id));
  } catch (error) {
    return next(error);
  }
}

function getCurrentUser(req, res, next) {
  try {
    return res.json(userService.getCurrentUser(req.user.id));
  } catch (error) {
    return next(error);
  }
}

function uploadAvatar(req, res, next) {
  try {
    return res.json(avatarService.uploadAvatar(req.user.id, req.file));
  } catch (error) {
    return next(error);
  }
}

function removeAvatar(req, res, next) {
  try {
    return res.json(avatarService.removeAvatar(req.user.id));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCurrentUser,
  getUsers,
  removeAvatar,
  uploadAvatar,
};
