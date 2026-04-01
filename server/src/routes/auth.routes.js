const express = require("express");
const authController = require("../controllers/auth.controller");
const { validateRequest } = require("../middlewares/validation.middleware");
const {
  validateLoginRequest,
  validateRegisterRequest,
} = require("../validators/auth.validator");

const router = express.Router();

router.post("/register", validateRequest(validateRegisterRequest), authController.register);
router.post("/login", validateRequest(validateLoginRequest), authController.login);

module.exports = router;
