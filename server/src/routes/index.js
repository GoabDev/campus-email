const express = require("express");
const authRoutes = require("./auth.routes");
const emailRoutes = require("./email.routes");
const userRoutes = require("./user.routes");

const router = express.Router();

router.use("/", authRoutes);
router.use("/emails", emailRoutes);
router.use("/users", userRoutes);

module.exports = router;
