const multer = require("multer");

function notFound(req, res, next) {
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "Route not found" });
  }

  next();
}

function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      if (err.field === "voice_note") {
        return res
          .status(400)
          .json({ error: "Voice note file too large. Maximum size is 10MB" });
      }

      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 5MB" });
    }

    return res.status(400).json({ error: err.message });
  }

  if (
    err.message &&
    (err.message.includes("Only image files") ||
      err.message.includes("Only audio files"))
  ) {
    return res.status(400).json({ error: err.message });
  }

  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  if (res.headersSent) {
    return next(err);
  }

  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

module.exports = {
  errorHandler,
  notFound,
};
