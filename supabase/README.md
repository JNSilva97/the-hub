# Private workspace preparation

**Not active yet.** The website still uses browser storage. This directory prepares the database; it does not provide login or device sync by itself. No personal data has been uploaded.

## Database contract

`hub_documents` stores each account's checklist definitions (`routines`), saved ticks and optional choices (`progress`), and individual notes (`note/<UUID>`). Bodies are JSON objects, limited to 1 MiB. Existing checklist validation and note limits must also run in the client before importing or rendering data.

Authenticated accounts can read their own rows. Anonymous access and direct client writes are denied. `save_hub_document(p_key, p_body, p_expected_revision)` sets the owner from the verified login, creates at revision `0`, and updates only when the expected revision matches. A stale save returns SQLSTATE `40001` without changing the stored document. Clients must keep their pending edit and resolve the conflict; they must not retry by blindly overwriting the latest revision.

Deletion uses a note body containing `deleted: true`, without note text. Keep this tombstone so another device cannot bring back an old note. Restoring creates a fresh note ID, matching the existing Undo behavior.

## Connect and verify

1. Connect the Supabase integration to the account that will own the project. Use a development project first; confirm any paid plan or charge before proceeding.
2. Apply `migrations/202610220001_private_documents.sql`. It creates new Hub objects and does not modify existing app data. Run it once, without wrapping it in another transaction.
3. Run `tests/private_documents.sql` as the project administrator. It uses two fictional accounts in one rolled-back transaction and checks isolation, denied anonymous access, invalid input, conflict handling and deletion metadata. Run the complete file; a failed run must be rolled back before continuing.
4. Configure the real sign-in method, then connect the app and verify login, logout and two-device synchronization. Publish only the project URL and publishable key; service-role, secret and database credentials stay out of browser code and Git.
5. Import personal checklists and existing progress explicitly from the PC after login works. Keep the original local data intact. Public demo data must remain separate from every account's workspace.

Login and synchronization are still pending. Do not change the current public UI to claim that data is private or synchronized before these checks pass. The database operator can access stored documents; this is account isolation, not end-to-end encryption.

Official references: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [API keys](https://supabase.com/docs/guides/getting-started/api-keys).

## Check locally

`tests/database.cjs` runs the real migration and SQL checks using PGlite, with a minimal substitute for Supabase's Auth schema. Like the existing Playwright suite, its test dependency is external to the app; install `@electric-sql/pglite` in a scratch directory and point `NODE_PATH` at that directory's `node_modules`, then run:

```sh
node --test tests/database.cjs
```

The check verifies row access and write rules inside PostgreSQL and confirms that the fixtures roll back. It does not verify Supabase Auth, hosted role configuration, REST access or synchronization; those require the connected project and separate device checks.
