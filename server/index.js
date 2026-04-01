const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./database");

const app = express();
const JWT_SECRET = "campus-mail-secret-key"; // In production, use environment variable
const MAX_VOICE_NOTE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VOICE_NOTE_DURATION_SECONDS = 300;
const ALLOWED_VOICE_NOTE_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
]);

// Ensure upload directories exist
const avatarUploadDir = path.join(__dirname, "uploads", "avatars");
const voiceNoteUploadDir = path.join(__dirname, "uploads", "voice-notes");
fs.mkdirSync(avatarUploadDir, { recursive: true });
fs.mkdirSync(voiceNoteUploadDir, { recursive: true });

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

function removeUploadedFile(file) {
  if (!file?.path) return;

  try {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  } catch (error) {
    console.error("Failed to remove uploaded file:", error);
  }
}

function parseVoiceNoteDuration(rawDuration) {
  if (rawDuration === undefined || rawDuration === null || rawDuration === "") {
    return null;
  }

  const parsed = Number.parseFloat(rawDuration);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function serializeEmail(email) {
  const {
    voice_note_file_name,
    voice_note_file_path,
    voice_note_mime_type,
    voice_note_size_bytes,
    voice_note_duration_seconds,
    ...rest
  } = email;

  return {
    ...rest,
    voice_note: voice_note_file_path
      ? {
          file_name: voice_note_file_name,
          url: `/uploads/${String(voice_note_file_path).replace(/\\/g, "/")}`,
          mime_type: voice_note_mime_type,
          size_bytes: voice_note_size_bytes,
          duration_seconds: voice_note_duration_seconds,
        }
      : null,
  };
}

function serializeEmails(emails) {
  return emails.map(serializeEmail);
}

const VOICE_NOTE_SELECT = `
           evn.file_name as voice_note_file_name,
           evn.file_path as voice_note_file_path,
           evn.mime_type as voice_note_mime_type,
           evn.size_bytes as voice_note_size_bytes,
           evn.duration_seconds as voice_note_duration_seconds`;

const EMAIL_VOICE_NOTE_JOIN =
  "LEFT JOIN email_voice_notes evn ON evn.email_id = emails.id";

// Multer configuration for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user.id}-${Date.now()}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /^image\/(jpeg|png|gif|webp)$/;
    if (allowedTypes.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image files (JPEG, PNG, GIF, WebP) are allowed"));
    }
  },
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Auth middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
}

// Helper: check if user is sender or recipient of an email
function getUserEmailRole(emailId, userId) {
  const email = db
    .prepare("SELECT from_user_id, to_user_id FROM emails WHERE id = ?")
    .get(emailId);
  if (!email) return null;
  if (email.from_user_id === userId) return "sender";
  if (email.to_user_id === userId) return "recipient";
  return null;
}

// ============ AUTH ROUTES ============

// Register
app.post("/api/register", (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: "All fields required" });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const stmt = db.prepare(
      "INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
    );
    const result = stmt.run(email, hashedPassword, name);
    res.json({ message: "User created", userId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: "Email already exists" });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.status(400).json({ error: "User not found" });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(400).json({ error: "Wrong password" });

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
  );
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar ? `/uploads/avatars/${user.avatar}` : null,
    },
  });
});

// ============ EMAIL ROUTES ============

// Send email
app.post("/api/emails", authenticate, (req, res) => {
  const toEmail = req.body.to_email?.trim();
  const subject = req.body.subject?.trim();
  const body = typeof req.body.body === "string" ? req.body.body : "";
  const hasBody = body.trim().length > 0;
  const replyToId = req.body.reply_to_id
    ? Number.parseInt(req.body.reply_to_id, 10)
    : null;
  const voiceNoteBase64 = req.body.voice_note_base64;
  const voiceNoteMimeType = req.body.voice_note_mime_type;
  const voiceNoteFileName = req.body.voice_note_file_name;
  const voiceNoteDuration = parseVoiceNoteDuration(
    req.body.voice_note_duration_seconds,
  );
  const hasVoiceNote =
    typeof voiceNoteBase64 === "string" && voiceNoteBase64.trim().length > 0;

  if (!toEmail || !subject || (!hasBody && !hasVoiceNote)) {
    return res.status(400).json({
      error: "to_email, subject, and either body or voice note are required",
    });
  }

  if (hasVoiceNote && !ALLOWED_VOICE_NOTE_TYPES.has(voiceNoteMimeType)) {
    return res.status(400).json({
      error: "Only audio files (WebM, OGG, MP3, MP4, M4A, WAV) are allowed",
    });
  }

  if (
    voiceNoteDuration !== null &&
    voiceNoteDuration > MAX_VOICE_NOTE_DURATION_SECONDS
  ) {
    return res.status(400).json({
      error: `Voice note cannot be longer than ${MAX_VOICE_NOTE_DURATION_SECONDS} seconds`,
    });
  }

  const recipient = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(toEmail);
  if (!recipient) return res.status(400).json({ error: "Recipient not found" });

  if (recipient.id === req.user.id) {
    return res.status(400).json({ error: "Cannot send email to yourself" });
  }

  if (replyToId) {
    const role = getUserEmailRole(replyToId, req.user.id);
    if (!role) {
      return res.status(400).json({ error: "Invalid reply_to_id" });
    }
  }

  let savedVoiceNotePath = null;
  let savedVoiceNoteName = null;
  let savedVoiceNoteSize = null;

  if (hasVoiceNote) {
    try {
      const audioBuffer = Buffer.from(voiceNoteBase64, "base64");
      if (!audioBuffer.length) {
        return res.status(400).json({ error: "Invalid voice note payload" });
      }

      if (audioBuffer.length > MAX_VOICE_NOTE_SIZE_BYTES) {
        return res.status(400).json({
          error: `Voice note file too large. Maximum size is ${Math.floor(MAX_VOICE_NOTE_SIZE_BYTES / (1024 * 1024))}MB`,
        });
      }

      const extension =
        path.extname(voiceNoteFileName || "").toLowerCase() ||
        getExtensionFromMimeType(voiceNoteMimeType);
      savedVoiceNoteName = `${req.user.id}-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
      savedVoiceNotePath = path.join(voiceNoteUploadDir, savedVoiceNoteName);
      fs.writeFileSync(savedVoiceNotePath, audioBuffer);
      savedVoiceNoteSize = audioBuffer.length;
    } catch (error) {
      removeUploadedFile(savedVoiceNotePath ? { path: savedVoiceNotePath } : null);
      return res.status(400).json({ error: "Invalid voice note payload" });
    }
  }

  try {
    const result = db.transaction(() => {
      const stmt = db.prepare(
        "INSERT INTO emails (from_user_id, to_user_id, subject, body, reply_to_id) VALUES (?, ?, ?, ?, ?)",
      );
      const emailResult = stmt.run(
        req.user.id,
        recipient.id,
        subject,
        body,
        replyToId || null,
      );

      if (savedVoiceNoteName && savedVoiceNotePath && voiceNoteMimeType) {
        db.prepare(
          `INSERT INTO email_voice_notes (
            email_id,
            file_name,
            file_path,
            mime_type,
            size_bytes,
            duration_seconds
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          emailResult.lastInsertRowid,
          voiceNoteFileName || savedVoiceNoteName,
          path.posix.join("voice-notes", savedVoiceNoteName),
          voiceNoteMimeType,
          savedVoiceNoteSize,
          voiceNoteDuration,
        );
      }

      return emailResult;
    })();

    res.json({ message: "Email sent", emailId: result.lastInsertRowid });
  } catch (error) {
    removeUploadedFile(savedVoiceNotePath ? { path: savedVoiceNotePath } : null);
    console.error("Failed to send email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// Get inbox (excludes deleted, includes starred)
app.get("/api/emails/inbox", authenticate, (req, res) => {
  const emails = db
    .prepare(
      `
    SELECT emails.*, users.name as from_name, users.email as from_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN users ON emails.from_user_id = users.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.to_user_id = ?
      AND COALESCE(uem.is_deleted, 0) = 0
    ORDER BY emails.created_at DESC
  `,
    )
    .all(req.user.id, req.user.id);

  res.json(serializeEmails(emails));
});

// Get sent emails (excludes deleted, includes starred)
app.get("/api/emails/sent", authenticate, (req, res) => {
  const emails = db
    .prepare(
      `
    SELECT emails.*, users.name as to_name, users.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN users ON emails.to_user_id = users.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.from_user_id = ?
      AND COALESCE(uem.is_deleted, 0) = 0
    ORDER BY emails.created_at DESC
  `,
    )
    .all(req.user.id, req.user.id);

  res.json(serializeEmails(emails));
});

// Get starred emails
app.get("/api/emails/starred", authenticate, (req, res) => {
  const emails = db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           1 as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE uem.is_starred = 1
      AND uem.is_deleted = 0
      AND (emails.from_user_id = ? OR emails.to_user_id = ?)
    ORDER BY emails.created_at DESC
  `,
    )
    .all(req.user.id, req.user.id, req.user.id);

  res.json(serializeEmails(emails));
});

// Get trash
app.get("/api/emails/trash", authenticate, (req, res) => {
  const emails = db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           uem.deleted_at,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE uem.is_deleted = 1
      AND (emails.from_user_id = ? OR emails.to_user_id = ?)
    ORDER BY uem.deleted_at DESC
  `,
    )
    .all(req.user.id, req.user.id, req.user.id);

  res.json(serializeEmails(emails));
});

// Search emails (paginated, server-side filtering)
app.get("/api/emails/search", authenticate, (req, res) => {
  const { q, folder = "all", page = 1, limit = 20 } = req.query;

  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: "Search query 'q' is required" });
  }

  const searchTerm = `%${q.trim()}%`;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  let folderCondition = "(emails.from_user_id = ? OR emails.to_user_id = ?)";
  let folderParams = [req.user.id, req.user.id];

  if (folder === "inbox") {
    folderCondition = "emails.to_user_id = ?";
    folderParams = [req.user.id];
  } else if (folder === "sent") {
    folderCondition = "emails.from_user_id = ?";
    folderParams = [req.user.id];
  }

  const countResult = db
    .prepare(
      `
    SELECT COUNT(*) as total
    FROM emails
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE ${folderCondition}
      AND COALESCE(uem.is_deleted, 0) = 0
      AND (emails.subject LIKE ? OR emails.body LIKE ? OR sender.name LIKE ? OR recipient.name LIKE ?)
  `,
    )
    .get(
      req.user.id,
      ...folderParams,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
    );

  const emails = db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE ${folderCondition}
      AND COALESCE(uem.is_deleted, 0) = 0
      AND (emails.subject LIKE ? OR emails.body LIKE ? OR sender.name LIKE ? OR recipient.name LIKE ?)
    ORDER BY emails.created_at DESC
    LIMIT ? OFFSET ?
  `,
    )
    .all(
      req.user.id,
      ...folderParams,
      searchTerm,
      searchTerm,
      searchTerm,
      searchTerm,
      limitNum,
      offset,
    );

  res.json({
    emails: serializeEmails(emails),
    total: countResult.total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(countResult.total / limitNum),
  });
});

// Get unread count
app.get("/api/emails/unread-count", authenticate, (req, res) => {
  const result = db
    .prepare(
      `
    SELECT COUNT(*) as count
    FROM emails
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    WHERE emails.to_user_id = ?
      AND emails.is_read = 0
      AND COALESCE(uem.is_deleted, 0) = 0
  `,
    )
    .get(req.user.id, req.user.id);

  res.json({ count: result.count });
});

// Get single email (includes starred status)
app.get("/api/emails/:id", authenticate, (req, res) => {
  const email = db
    .prepare(
      `
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM emails
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.id = ? AND (emails.to_user_id = ? OR emails.from_user_id = ?)
  `,
    )
    .get(req.user.id, req.params.id, req.user.id, req.user.id);

  if (!email) return res.status(404).json({ error: "Email not found" });

  // Mark as read if recipient
  if (email.to_user_id === req.user.id && !email.is_read) {
    db.prepare("UPDATE emails SET is_read = 1 WHERE id = ?").run(req.params.id);
    email.is_read = 1;
  }

  res.json(serializeEmail(email));
});

// Get email thread (full conversation chain via recursive CTE)
app.get("/api/emails/:id/thread", authenticate, (req, res) => {
  const emailId = parseInt(req.params.id);

  const role = getUserEmailRole(emailId, req.user.id);
  if (!role) return res.status(404).json({ error: "Email not found" });

  const emails = db
    .prepare(
      `
    WITH RECURSIVE
      ancestors AS (
        SELECT id, reply_to_id FROM emails WHERE id = ?
        UNION ALL
        SELECT e.id, e.reply_to_id FROM emails e
        JOIN ancestors a ON e.id = a.reply_to_id
      ),
      root AS (
        SELECT id FROM ancestors WHERE reply_to_id IS NULL
      ),
      thread AS (
        SELECT id FROM root
        UNION ALL
        SELECT e.id FROM emails e
        JOIN thread t ON e.reply_to_id = t.id
      )
    SELECT emails.*,
           sender.name as from_name, sender.email as from_email,
           recipient.name as to_name, recipient.email as to_email,
           COALESCE(uem.is_starred, 0) as is_starred,
           ${VOICE_NOTE_SELECT}
    FROM thread
    JOIN emails ON thread.id = emails.id
    JOIN users sender ON emails.from_user_id = sender.id
    JOIN users recipient ON emails.to_user_id = recipient.id
    LEFT JOIN user_email_metadata uem ON uem.email_id = emails.id AND uem.user_id = ?
    ${EMAIL_VOICE_NOTE_JOIN}
    WHERE emails.from_user_id = ? OR emails.to_user_id = ?
    ORDER BY emails.created_at ASC
  `,
    )
    .all(emailId, req.user.id, req.user.id, req.user.id);

  res.json(serializeEmails(emails));
});

// Toggle star
app.patch("/api/emails/:id/star", authenticate, (req, res) => {
  const emailId = parseInt(req.params.id);

  const role = getUserEmailRole(emailId, req.user.id);
  if (!role) return res.status(404).json({ error: "Email not found" });

  db.prepare(
    `
    INSERT INTO user_email_metadata (user_id, email_id, is_starred)
    VALUES (?, ?, 1)
    ON CONFLICT(user_id, email_id)
    DO UPDATE SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END
  `,
  ).run(req.user.id, emailId);

  const meta = db
    .prepare(
      "SELECT is_starred FROM user_email_metadata WHERE user_id = ? AND email_id = ?",
    )
    .get(req.user.id, emailId);

  res.json({ is_starred: meta.is_starred });
});

// Set read/unread status
app.patch("/api/emails/:id/read", authenticate, (req, res) => {
  const emailId = parseInt(req.params.id);
  const { is_read } = req.body;

  // Only recipient can mark as read/unread
  const email = db
    .prepare("SELECT to_user_id, is_read FROM emails WHERE id = ?")
    .get(emailId);

  if (!email) return res.status(404).json({ error: "Email not found" });
  if (email.to_user_id !== req.user.id) {
    return res
      .status(403)
      .json({ error: "Only the recipient can change read status" });
  }

  // Explicit set if provided, otherwise toggle
  const newReadStatus =
    is_read !== undefined ? (is_read ? 1 : 0) : email.is_read ? 0 : 1;

  db.prepare("UPDATE emails SET is_read = ? WHERE id = ?").run(
    newReadStatus,
    emailId,
  );

  res.json({ is_read: newReadStatus });
});

// Soft delete email (move to trash)
app.delete("/api/emails/:id", authenticate, (req, res) => {
  const emailId = parseInt(req.params.id);

  const role = getUserEmailRole(emailId, req.user.id);
  if (!role) return res.status(404).json({ error: "Email not found" });

  db.prepare(
    `
    INSERT INTO user_email_metadata (user_id, email_id, is_deleted, deleted_at)
    VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, email_id)
    DO UPDATE SET is_deleted = 1, deleted_at = datetime('now')
  `,
  ).run(req.user.id, emailId);

  res.json({ message: "Email moved to trash" });
});

// Restore email from trash
app.patch("/api/emails/:id/restore", authenticate, (req, res) => {
  const emailId = parseInt(req.params.id);

  const role = getUserEmailRole(emailId, req.user.id);
  if (!role) return res.status(404).json({ error: "Email not found" });

  db.prepare(
    `
    UPDATE user_email_metadata
    SET is_deleted = 0, deleted_at = NULL
    WHERE user_id = ? AND email_id = ?
  `,
  ).run(req.user.id, emailId);

  res.json({ message: "Email restored" });
});

// ============ USER ROUTES ============

// Get all users (for composing emails) - includes avatar
app.get("/api/users", authenticate, (req, res) => {
  const users = db
    .prepare("SELECT id, email, name, avatar FROM users WHERE id != ?")
    .all(req.user.id);

  users.forEach((user) => {
    user.avatar = user.avatar ? `/uploads/avatars/${user.avatar}` : null;
  });

  res.json(users);
});

// Get current user profile
app.get("/api/users/me", authenticate, (req, res) => {
  const user = db
    .prepare(
      "SELECT id, email, name, avatar, created_at FROM users WHERE id = ?",
    )
    .get(req.user.id);

  if (!user) return res.status(404).json({ error: "User not found" });
  user.avatar = user.avatar ? `/uploads/avatars/${user.avatar}` : null;

  res.json(user);
});

// Upload avatar
app.patch(
  "/api/users/avatar",
  authenticate,
  avatarUpload.single("avatar"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Delete old avatar file if exists
    const user = db
      .prepare("SELECT avatar FROM users WHERE id = ?")
      .get(req.user.id);
    if (user.avatar) {
      const oldPath = path.join(avatarUploadDir, user.avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update database
    db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(
      req.file.filename,
      req.user.id,
    );

    res.json({ avatar: `/uploads/avatars/${req.file.filename}` });
  },
);

// Remove avatar
app.delete("/api/users/avatar", authenticate, (req, res) => {
  const user = db
    .prepare("SELECT avatar FROM users WHERE id = ?")
    .get(req.user.id);

  if (user.avatar) {
    const avatarPath = path.join(avatarUploadDir, user.avatar);
    if (fs.existsSync(avatarPath)) {
      fs.unlinkSync(avatarPath);
    }
  }

  db.prepare("UPDATE users SET avatar = NULL WHERE id = ?").run(req.user.id);

  res.json({ message: "Avatar removed" });
});

// ============ ERROR HANDLING ============

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ error: "File too large. Maximum size is 5MB" });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes("Only image files")) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// ============= CATCH ALL React/Vite routing ========

// Serve static files
const distPath = path.join(__dirname, "../client/dist");

app.use(express.static(distPath));
// Catch-all for React/Vite routing
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// ============ START SERVER ============

const PORT = 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`LAN access: http://<your-ip>:${PORT}`);
});
