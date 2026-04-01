const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { uploadMaxFileSize } = require("./env");
const { avatarsUploadPath, voiceNotesUploadPath } = require("./paths");

const MAX_VOICE_NOTE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_VOICE_NOTE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
]);

fs.mkdirSync(avatarsUploadPath, { recursive: true });
fs.mkdirSync(voiceNotesUploadPath, { recursive: true });

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

function getExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".mp4",
    "audio/x-m4a": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
  };

  return mimeToExt[mimeType] || "";
}

const voiceNoteStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, voiceNotesUploadPath),
  filename: (req, file, cb) => {
    const extension =
      path.extname(file.originalname).toLowerCase() ||
      getExtensionFromMimeType(file.mimetype);
    cb(
      null,
      `${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`,
    );
  },
});

const voiceNoteUpload = multer({
  storage: voiceNoteStorage,
  limits: { fileSize: MAX_VOICE_NOTE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VOICE_NOTE_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(
      new Error("Only audio files (WebM, OGG, MP3, MP4, M4A, WAV) are allowed"),
    );
  },
});

module.exports = {
  avatarUpload,
  voiceNoteUpload,
  MAX_VOICE_NOTE_SIZE_BYTES,
};
