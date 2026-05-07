# Campus Mail

A full-stack internal email platform for campus communication. Users can register, send and receive emails, manage conversations with threading, star important messages, search across mailboxes, send voice notes and file attachments, and upload profile avatars.

Built with React + TypeScript on the frontend and Express + SQLite on the backend.

> **Note:** This project is under active development. See [Known Limitations](#known-limitations) for areas planned for improvement.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Authentication](#authentication)
- [Environment & Configuration](#environment--configuration)
- [Production Build](#production-build)
- [Known Limitations](#known-limitations)
- [Contributing](#contributing)

---

## Features

- **Authentication** -- Register and log in with email and password (JWT-based)
- **Inbox & Sent** -- View received and sent emails separately
- **Compose & Reply** -- Send new emails to any registered user; reply to create threaded conversations
- **Attachments** -- Send up to 5 attachments per email with support for images, PDF, Word, Excel, PowerPoint, and TXT files
- **Voice Notes** -- Record and send voice notes up to 1 minute long, with a live countdown and a 10-second warning near the limit
- **Email Threading** -- View full conversation history in a single thread view
- **Star & Unstar** -- Mark important emails for quick access from the Starred folder
- **Trash & Restore** -- Soft-delete emails to trash; restore them at any time
- **Search** -- Full-text search across subject, body, and sender/recipient names with folder filtering and pagination
- **Unread Count** -- Live unread badge on the inbox (polls every 30 seconds)
- **User Avatars** -- Upload a profile picture (JPEG, PNG, GIF, or WebP, 5 MB max)
- **Upload Limits & Cleanup** -- Attachments are capped at 10 MB per file and 25 MB per email; expired temporary uploads are cleaned up automatically
- **Responsive UI** -- Mobile-friendly layout with sidebar navigation and hamburger menu

---

## Tech Stack

### Client

| Category         | Technology                        |
| ---------------- | --------------------------------- |
| Framework        | React 19                          |
| Language         | TypeScript 5.9                    |
| Build Tool       | Vite 7                            |
| Styling          | Tailwind CSS 4                    |
| State (Auth)     | Zustand                           |
| Server State     | TanStack React Query              |
| Forms            | React Hook Form + Zod             |
| Routing          | React Router DOM 7                |
| HTTP Client      | Axios                             |
| UI Components    | Radix UI primitives, Lucide icons |
| Notifications    | Sonner (toast)                    |

### Server

| Category      | Technology                     |
| ------------- | ------------------------------ |
| Runtime       | Node.js                        |
| Framework     | Express 5                      |
| Database      | SQLite via better-sqlite3      |
| Auth          | JSON Web Tokens (jsonwebtoken) |
| Password Hash | bcryptjs                       |
| File Uploads  | Multer                         |

---

## Folder Structure

```text
campus-mail/
|-- client/                     # React frontend
|   |-- public/                 # Static assets
|   |-- src/
|   |   |-- components/
|   |   |   |-- ui/             # Reusable UI primitives
|   |   |   `-- Layout.tsx      # App shell with sidebar, header, and navigation
|   |   |-- hooks/
|   |   |   `-- useAuth.ts      # Zustand auth store
|   |   |-- lib/
|   |   |   |-- api/
|   |   |   |   `-- index.ts    # Axios instance with auth token interceptor
|   |   |   |-- query.ts        # TanStack React Query client setup
|   |   |   `-- utils.ts        # Utility helpers
|   |   |-- pages/
|   |   |   |-- Compose.tsx     # New email / reply composition
|   |   |   |-- Inbox.tsx       # Received emails list
|   |   |   |-- Login.tsx       # Login form
|   |   |   |-- Register.tsx    # Registration form
|   |   |   |-- Search.tsx      # Search with filters and pagination
|   |   |   |-- Sent.tsx        # Sent emails list
|   |   |   |-- Starred.tsx     # Starred emails list
|   |   |   |-- Trash.tsx       # Deleted emails with restore option
|   |   |   `-- ViewEmail.tsx   # Single email view with thread
|   |   |-- App.tsx             # Route definitions and auth guard
|   |   |-- main.tsx            # Application entry point
|   |   `-- types.ts            # Shared TypeScript interfaces
|   |-- package.json
|   `-- vite.config.ts
|-- server/                     # Express backend
|   |-- src/
|   |   |-- app.js              # Express app setup
|   |   |-- config/             # Environment, paths, and upload configuration
|   |   |-- controllers/        # Request handlers
|   |   |-- db/                 # SQLite schema, init, and migrations
|   |   |-- middlewares/        # Auth, errors, validation
|   |   |-- repositories/       # Database access layer
|   |   |-- routes/             # API route definitions
|   |   |-- services/           # Business logic
|   |   `-- validators/         # Request validation
|   |-- uploads/
|   |   |-- attachments/        # Uploaded email attachments
|   |   |-- avatars/            # User-uploaded avatar images
|   |   `-- voice-notes/        # Uploaded voice notes
|   |-- index.js                # Server entry point
|   |-- mail.db                 # SQLite database file
|   `-- package.json
`-- README.md
```

---

## Prerequisites

- **Node.js** >= 18
- **npm** (comes with Node.js)

No external database server is needed. SQLite runs as an embedded file (`server/mail.db`) that is created automatically on first startup.

---

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd campus-mail
```

### 2. Install dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 3. Start the development servers

Open **two terminals**:

**Terminal 1 -- Backend (port 5000)**

```bash
cd server
npm start
```

**Terminal 2 -- Frontend (port 5173)**

```bash
cd client
npm run dev
```

### 4. Open the app

Navigate to **http://localhost:5173** in your browser. The Vite dev server proxies all `/api` requests to the backend at port 5000.

---

## Usage Guide

### For Users

1. **Register** -- Go to `/register` and create an account with your name, email, and a password (minimum 6 characters).
2. **Log in** -- Use your credentials at `/login`.
3. **Compose** -- Click the "Compose" button in the sidebar. Select a recipient from the user directory, enter a subject and message body, then send.
4. **Add attachments** -- Attach up to 5 files per email. Each file can be up to 10 MB, with a 25 MB total cap across the email. Supported types include images, PDF, Word, Excel, PowerPoint, and TXT.
5. **Record a voice note** -- Record a voice note up to 1 minute long. The composer shows the remaining time live and highlights the last 10 seconds before auto-stop.
6. **Inbox** -- View emails others have sent you. Unread messages appear bold. Click an email to read it (it gets marked as read automatically).
7. **Reply** -- Inside an email, click "Reply" to continue the conversation. Replies are threaded together.
8. **Star** -- Click the star icon on any email to bookmark it. View all starred emails from the Starred section in the sidebar.
9. **Delete** -- Click the delete/trash icon to move an email to Trash. Emails are soft-deleted and can be restored.
10. **Restore** -- Open Trash and click Restore on any email to move it back.
11. **Search** -- Use the search bar in the header. Filter by folder (All Mail, Inbox, Sent) and page through results.
12. **Avatar** -- Upload a profile picture from your user profile area.

### For Developers

**Client routing** is defined in `client/src/App.tsx`. All authenticated routes are wrapped in a `PrivateRoute` guard that redirects to `/login` when no token is present.

| Route        | Page Component | Description              |
| ------------ | -------------- | ------------------------ |
| `/login`     | Login          | Public -- sign in        |
| `/register`  | Register       | Public -- create account |
| `/inbox`     | Inbox          | Received emails          |
| `/sent`      | Sent           | Sent emails              |
| `/compose`   | Compose        | New email or reply       |
| `/email/:id` | ViewEmail      | Single email with thread |
| `/starred`   | Starred        | Starred emails           |
| `/trash`     | Trash          | Deleted emails           |
| `/search`    | Search         | Search with pagination   |

**API calls** go through the Axios instance at `client/src/lib/api/index.ts`, which automatically attaches the JWT token from the Zustand auth store to every request header.

**Server state** is managed with TanStack React Query. Mutations invalidate relevant query keys so the UI stays in sync after actions like sending an email or starring a message.

---

## API Reference

Base URL: `http://localhost:5000/api`

All endpoints except Register and Login require an `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint    | Body                        | Description                    |
| ------ | ----------- | --------------------------- | ------------------------------ |
| POST   | `/register` | `{ email, password, name }` | Create a new user account      |
| POST   | `/login`    | `{ email, password }`       | Authenticate and receive a JWT |

### Emails

| Method | Endpoint                    | Body / Query                                                                                      | Description                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| POST   | `/emails`                   | `{ to_email?, to_emails?, subject, body, reply_to_id?, voice_note_upload_id?, attachment_upload_ids? }` | Send a new email or reply with optional voice note and attachments |
| POST   | `/emails/voice-note-upload` | `multipart/form-data` (field: `voice_note`)                                                       | Upload a temporary voice note (10 MB max, 1 minute max)         |
| POST   | `/emails/attachment-upload` | `multipart/form-data` (field: `attachment`)                                                       | Upload a temporary attachment (10 MB per file max)              |
| GET    | `/emails/inbox`             | --                                                                                                | List received emails (excludes deleted)                         |
| GET    | `/emails/sent`              | --                                                                                                | List sent emails (excludes deleted)                             |
| GET    | `/emails/starred`           | --                                                                                                | List all starred emails                                         |
| GET    | `/emails/trash`             | --                                                                                                | List deleted emails                                             |
| GET    | `/emails/search`            | `?q=<term>&folder=all|inbox|sent&page=1&limit=20`                                                 | Search emails (paginated, max 50 per page)                      |
| GET    | `/emails/unread-count`      | --                                                                                                | Get count of unread inbox emails                                |
| GET    | `/emails/:id`               | --                                                                                                | Get a single email (auto-marks as read)                         |
| GET    | `/emails/:id/thread`        | --                                                                                                | Get full conversation thread                                    |
| PATCH  | `/emails/:id/star`          | --                                                                                                | Toggle star status                                              |
| PATCH  | `/emails/:id/read`          | `{ is_read: boolean }`                                                                            | Set read/unread status (recipient only)                         |
| DELETE | `/emails/:id`               | --                                                                                                | Soft-delete (move to trash)                                     |
| PATCH  | `/emails/:id/restore`       | --                                                                                                | Restore email from trash                                        |

### Users

| Method | Endpoint        | Body                                  | Description                            |
| ------ | --------------- | ------------------------------------- | -------------------------------------- |
| GET    | `/users`        | --                                    | List all users except the current user |
| GET    | `/users/me`     | --                                    | Get the authenticated user's profile   |
| PATCH  | `/users/avatar` | `multipart/form-data` (field: avatar) | Upload a profile avatar (5 MB max)     |
| DELETE | `/users/avatar` | --                                    | Remove the current avatar              |

### Response Format

**Success** -- JSON object with data (e.g., `{ token, user }`, `[ ...emails ]`, `{ message }`)

**Error** -- JSON with an error message and appropriate HTTP status:

```json
{ "error": "Description of what went wrong" }
```

---

## Database Schema

The SQLite database (`server/mail.db`) contains the following main tables:

### `users`

| Column     | Type     | Constraints            |
| ---------- | -------- | ---------------------- |
| id         | INTEGER  | Primary key, auto-inc  |
| email      | TEXT     | Unique, not null       |
| password   | TEXT     | Not null (bcrypt hash) |
| name       | TEXT     | Not null               |
| avatar     | TEXT     | Nullable (filename)    |
| created_at | DATETIME | Default: current time  |

### `emails`

| Column       | Type     | Constraints                               |
| ------------ | -------- | ----------------------------------------- |
| id           | INTEGER  | Primary key, auto-inc                     |
| from_user_id | INTEGER  | FK -> users.id                            |
| to_user_id   | INTEGER  | FK -> users.id                            |
| subject      | TEXT     | Not null                                  |
| body         | TEXT     | Not null                                  |
| is_read      | INTEGER  | Default: 0                                |
| reply_to_id  | INTEGER  | FK -> emails.id (nullable, for threading) |
| created_at   | DATETIME | Default: current time                     |

### `email_voice_notes`

Stores an optional voice note for an email.

| Column           | Type     | Constraints           |
| ---------------- | -------- | --------------------- |
| id               | INTEGER  | Primary key, auto-inc |
| email_id         | INTEGER  | Unique, FK -> emails.id |
| file_name        | TEXT     | Not null              |
| file_path        | TEXT     | Not null              |
| mime_type        | TEXT     | Not null              |
| size_bytes       | INTEGER  | Not null              |
| duration_seconds | REAL     | Nullable              |
| created_at       | DATETIME | Default: current time |

### `email_attachments`

Stores one or more attachments for an email.

| Column              | Type     | Constraints           |
| ------------------- | -------- | --------------------- |
| id                  | INTEGER  | Primary key, auto-inc |
| email_id            | INTEGER  | FK -> emails.id       |
| file_name           | TEXT     | Not null              |
| file_path           | TEXT     | Not null              |
| mime_type           | TEXT     | Not null              |
| size_bytes          | INTEGER  | Not null              |
| original_size_bytes | INTEGER  | Nullable              |
| created_at          | DATETIME | Default: current time |

### `voice_note_uploads`

Temporary upload staging table for voice notes before an email is sent.

### `attachment_uploads`

Temporary upload staging table for attachments before an email is sent.

### `user_email_metadata`

Per-user flags for each email, enabling independent star/delete status per user.

| Column     | Type     | Constraints                     |
| ---------- | -------- | ------------------------------- |
| user_id    | INTEGER  | PK (composite), FK -> users.id  |
| email_id   | INTEGER  | PK (composite), FK -> emails.id |
| is_starred | INTEGER  | Default: 0                      |
| is_deleted | INTEGER  | Default: 0                      |
| deleted_at | DATETIME | Nullable                        |

Database features: WAL mode enabled for concurrent read performance, foreign keys enforced, indexes on frequently queried columns, and temporary upload tables for staged file handling before send.

---

## Authentication

The app uses JWT (JSON Web Token) authentication:

1. User registers with name, email, and password.
2. Password is hashed with bcryptjs (10 salt rounds) before storage.
3. On login, credentials are verified and a JWT is issued.
4. The client stores the token in `localStorage` via the Zustand auth store.
5. Every API request includes the token in the `Authorization: Bearer <token>` header (handled automatically by the Axios interceptor).
6. The server's `authenticate` middleware verifies the token and attaches the decoded user to `req.user`.

---

## Environment & Configuration

### Vite Dev Proxy

During development, the Vite dev server proxies API requests to the backend:

```text
/api/* -> http://localhost:5000
```

This is configured in `client/vite.config.ts`. No CORS issues occur in development because both client and API appear to be on the same origin from the browser's perspective.

### Port Configuration

| Service  | Default Port |
| -------- | ------------ |
| Backend  | 5000         |
| Frontend | 5173 (Vite)  |

### Upload Limits

| Upload Type             | Limit            |
| ----------------------- | ---------------- |
| Avatar                  | 5 MB             |
| Voice note              | 10 MB            |
| Attachment              | 10 MB per file   |
| Email attachments total | 25 MB per email  |

Voice notes are limited to 1 minute. Attachments are limited to 5 files per email. Image attachments may be compressed client-side before upload to reduce storage usage.

### Path Aliases

The client uses `@/` as an import alias for `client/src/`:

```ts
import { useAuth } from "@/hooks/useAuth";
```

---

## Production Build

### 1. Build the client

```bash
cd client
npm run build
```

This runs TypeScript compilation followed by the Vite build, producing optimized assets in `client/dist/`.

### 2. Serve everything from the backend

```bash
cd server
npm start
```

The Express server serves the built client assets from `../client/dist` and handles SPA routing with a catch-all route. Access the full application at **http://localhost:5000**.

---

## Known Limitations

These are areas identified for future improvement:

- **No background job scheduler.** Expired temporary uploads are cleaned up during relevant email and upload requests rather than by a dedicated scheduled job.
- **Tokens do not expire.** The JWT has no `expiresIn` option set, and there is no refresh token mechanism.
- **No input sanitization** on email body content (potential XSS if rendering raw HTML).
- **No rate limiting** on authentication or email endpoints.
- **No tests.** Neither the client nor server has automated tests.
- **SQLite scaling.** Works well for small-to-medium workloads but would need migration to PostgreSQL or MySQL for large-scale deployments.
- **Local file storage** is used for avatars, attachments, and voice notes. Production deployments would likely need object storage (S3, GCS, etc.).
- **No email notifications.** There are no push notifications or real-time updates beyond polling for unread count.

---

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Make your changes and test them locally.
4. Commit with a descriptive message: `git commit -m "feat: add your feature"`.
5. Push your branch: `git push origin feature/your-feature`.
6. Open a pull request describing what you changed and why.

When contributing, keep in mind the [known limitations](#known-limitations) above -- pull requests addressing any of those items are welcome.
