# SAM Read-Only Query Agent

Lets SAM answer **arbitrary** data questions ("how many fuel requests are pending in TSD?")
by writing one `SELECT`, guarding it, and running it as a **SELECT-only** MySQL user.
It is the only component that issues free-form SQL, and it **cannot write**. Writes go
through the separate, whitelisted action agent (`samActions.js`).

## Two layers of protection
1. **Structural (primary):** a MySQL user granted only `SELECT`. Even a bug or
   prompt-injection cannot delete/update — the database refuses it.
2. **Code (defense-in-depth):** `sqlReadGuard.js` rejects anything that isn't a single
   `SELECT`/`WITH` before it reaches the DB (blocks stacked queries, `INTO OUTFILE`, DDL).

## One-time server setup — create the read-only user
Run once on the MySQL server (192.168.1.99). Use a strong password.

```sql
CREATE USER 'sam_ro'@'%' IDENTIFIED BY 'CHANGE_ME_STRONG';
GRANT SELECT ON it_program.* TO 'sam_ro'@'%';
GRANT SELECT ON messenger.*  TO 'sam_ro'@'%';
FLUSH PRIVILEGES;
```

Then set in `backend/.env`:
```
DB_RO_USER=sam_ro
DB_RO_PASS=CHANGE_ME_STRONG
# DB_RO_HOST / DB_RO_PORT default to the main DB_HOST / DB_PORT
```

Verify it truly can't write:
```sql
-- as sam_ro this MUST fail with "command denied":
DELETE FROM it_program.usertb LIMIT 1;
```

If `DB_RO_USER` is unset, the agent falls back to the main creds and logs a warning —
the code guard still applies, but you lose the DB-level guarantee. **Set it in production.**

## Files
- `src/services/ai/sqlReadGuard.js` — single-SELECT guard (`assertReadOnly`)
- `src/services/ai/queryAgent.js` — NL → SELECT → guard → `db.readQuery`
- `src/config/database.js` — `createReadPool()` / `readQuery()` (read-only pool)
- Check: `node src/services/ai/queryAgent.selfcheck.js` (offline; allow/deny + injection)

## Not yet done
- Wire `queryAgent.answer()` into the chat route as a fallback when a message isn't a
  fixed report/action (inject `llmCall` = providers.callConfiguredAI, `runReadQuery` = db.readQuery).
- Add more tables to `SCHEMA_HINT` as questions demand (wrong guesses fail safely — read-only).
