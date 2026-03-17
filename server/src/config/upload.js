const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { uploadMaxFileSize } = require("./env");
const { avatarsUploadPath } = require("./paths");

fs.mkdirSync(avatarsUploadPath, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsUploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: uploadMaxFileSize },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /^image\/(jpeg|png|gif|webp)$/;
    if (allowedTypes.test(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"));
  },
});

module.exports = {
  avatarUpload,
};
