# Scalability Notes

Items that have been addressed or are worth monitoring.

## Unread count badge (sidebar) - RESOLVED

**Previous approach:** Client-side counting from the full inbox fetch.

**Current approach:** Uses the dedicated `GET /api/emails/unread-count` endpoint which returns `{ count: number }` from a lightweight database query. Polls every 30 seconds via `refetchInterval`. This scales well.
