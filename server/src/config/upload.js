const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { uploadMaxFileSize } = require("./env");
const {
  attachmentsUploadPath,
  avatarsUploadPath,
  voiceNotesUploadPath,
} = require("./paths");

const MAX_VOICE_NOTE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_VOICE_NOTE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
]);
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

fs.mkdirSync(avatarsUploadPath, { recursive: true });
fs.mkdirSync(attachmentsUploadPath, { recursive: true });
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

function getAttachmentExtensionFromMimeType(mimeType) {
  const mimeToExt = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      ".pptx",
    "text/plain": ".txt",
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

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, attachmentsUploadPath),
  filename: (req, file, cb) => {
    const extension =
      path.extname(file.originalname).toLowerCase() ||
      getAttachmentExtensionFromMimeType(file.mimetype);
    cb(
      null,
      `${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`,
    );
  },
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_ATTACHMENT_TYPES.has(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(
      new Error(
        "Only image, PDF, Word, Excel, PowerPoint, and TXT attachments are allowed",
      ),
    );
  },
});

module.exports = {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  avatarUpload,
  attachmentUpload,
  voiceNoteUpload,
  MAX_VOICE_NOTE_SIZE_BYTES,
};
