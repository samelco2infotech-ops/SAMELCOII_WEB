# AUTO SYNC NOTES — Node-only

The offline subsystem now runs through the Express API and the shared browser client.
PHP endpoints are retired.

## Active files

- `assets/js/offline-sync.js` — detects connectivity, queues writes, and triggers sync.
- `backend/src/routes/offline.js` — authenticated HTTP endpoints.
- `backend/src/services/offlineCacheService.js` — SQLite cache and queue logic.
- `backend/src/config/sqlite.js` — local SQLite connection/schema.

## Endpoints

| URL | Method | Purpose |
|---|---|---|
| `/api/offline/status` | GET | MySQL state, pending count, last sync |
| `/api/offline/sync` | POST | Flush pending writes and refresh cache |
| `/api/offline/add-to-queue` | POST | Queue an eligible write |
| `/api/offline/pending-queue` | GET | List queued writes |

Use `samelciiPost(endpoint, data)` for writes that must survive a temporary database
outage. The helper sends the JWT and queues only endpoints accepted by the Node route.

When adding a cached module, update the fixed table/endpoint allowlists in
`backend/src/services/offlineCacheService.js` and leave one focused self-check.
