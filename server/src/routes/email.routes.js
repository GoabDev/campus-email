const express = require("express");
const emailController = require("../controllers/email.controller");
const { authenticate } = require("../middlewares/auth.middleware");
const { validateRequest } = require("../middlewares/validation.middleware");
const {
  validateComposeRequest,
  validateEmailIdParam,
  validateReadStatusRequest,
  validateSearchRequest,
} = require("../validators/email.validator");

const router = express.Router();

router.use(authenticate);

router.post("/", validateRequest(validateComposeRequest), emailController.sendEmail);
router.get("/inbox", emailController.getInbox);
router.get("/sent", emailController.getSent);
router.get("/starred", emailController.getStarred);
router.get("/trash", emailController.getTrash);
router.get("/search", validateRequest(validateSearchRequest), emailController.searchEmails);
router.get("/unread-count", emailController.getUnreadCount);
router.get("/:id/thread", validateRequest(validateEmailIdParam), emailController.getEmailThread);
router.get("/:id", validateRequest(validateEmailIdParam), emailController.getEmailById);
router.patch("/:id/star", validateRequest(validateEmailIdParam), emailController.toggleStar);
router.patch("/:id/read", validateRequest(validateReadStatusRequest), emailController.updateReadStatus);
router.patch("/:id/restore", validateRequest(validateEmailIdParam), emailController.restoreEmail);
router.delete("/:id", validateRequest(validateEmailIdParam), emailController.moveToTrash);

module.exports = router;
