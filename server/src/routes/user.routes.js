const express = require("express");
const userController = require("../controllers/user.controller");
const { avatarUpload } = require("../config/upload");
const { authenticate } = require("../middlewares/auth.middleware");
const { validateRequest } = require("../middlewares/validation.middleware");
const { validateAvatarUploadRequest } = require("../validators/user.validator");

const router = express.Router();

router.use(authenticate);

router.get("/", userController.getUsers);
router.get("/me", userController.getCurrentUser);
router.patch(
  "/avatar",
  validateRequest(validateAvatarUploadRequest),
  avatarUpload.single("avatar"),
  userController.uploadAvatar,
);
router.delete("/avatar", userController.removeAvatar);

module.exports = router;
