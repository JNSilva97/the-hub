# Checklist sync: activation

The integration is configured for project **the-hub-16a6d**. Google sign-in and an explicit **Sync PC checklists** action are required before personal lists are uploaded. Existing local notes stay local until **Copy local notes** is confirmed. The setup steps below also document how to connect another project.

To disable the Firebase connection, set `firebaseConfig` to `null` and bump the module query versions described below. This does not delete cloud data or copy later cloud edits back to the original PC file. Export current cloud lists and progress before removing the service; a cloud-to-file export button is not implemented.

Activation checks on 2026-10-22: all 57 automated tests passed with the real project isolated from test traffic. The published rules were inspected in Console. Rules Playground allowed the owner's read and valid progress creation; it denied anonymous reads/writes, another account's reads/writes, malformed progress, definition updates and deletion. These simulations did not create or delete database records. Real Google login, personal import and synchronization across devices still require the user's verification.

## 1. Create the free project

Open [Firebase Console](https://console.firebase.google.com/) with the Google account that will own the project. Create a project on the **Spark** plan. Skip Google Analytics and keep billing disabled. Only Authentication and Firestore are needed. No Firebase CLI, emulator or desktop program is required for this setup.

Register a **Web** app and copy its Firebase configuration. These web configuration values are public connection information, not administrative credentials. Never copy a service-account key, private key or Google login credential into the project or chat.

## 2. Enable login

In Authentication, enable the **Google** sign-in provider and select the required support email. In authorized domains, add `jnsilva97.github.io`, `127.0.0.1` and `localhost` for the live and PC versions. Use hostnames without paths or ports.

The app uses the official Firebase SDK with persistent local login (IndexedDB, with browser local storage fallback). It does not save or handle raw tokens itself. Login survives closing so a personal device can reopen offline. The private-access panel displays the signed-in email so you can verify the account before importing lists. Sign-out removes the active account from the interface, but offline database copies remain in browser storage until site data is cleared. Use a trusted personal device.

## 3. Create and protect Firestore

Create the **Standard edition**, default Firestore database in **production mode**, choosing an appropriate EU location. Publish the contents of `firestore.rules` in its Rules editor before connecting the website. Keep the database on the free plan.

The paths are `users/<authenticated UID>/hub/routines` and `users/<authenticated UID>/hub/progress`. Each account can read only its own documents. Definitions can be created once, not replaced. Progress accepts only bounded maps of boolean values. Deletes and other client writes are denied. Each Google account gets its own space; the rules do not restrict sign-in to one preselected email.

Before activation, use the Rules Playground (or existing approved test tooling) to verify: anonymous reads and writes fail; account A can read/write its own permitted records; account B cannot access A's records; invalid progress values, definition replacement and deletions fail. Browser tests mock the transport and **do not execute deployed Firebase rules**.

## 4. Connect and import from the PC

Replace `null` in `firebase-config.mjs` with the web configuration object, then change that file's query version in `cloud.js` and bump `cloud.js`'s import version in `routines.js` plus the `interface.js` asset version in `index.html` before publishing. The imported module URLs must stay consistent. Leave the public config at `null` until the rules are deployed and verified.

Open the existing PC version at `http://127.0.0.1:8765/`. Choose **Routines → Private access → Continue with Google**, verify the email, then choose **Sync PC checklists**. This button explicitly uploads the ignored personal checklist file and that origin's existing personal ticks. It never imports demo progress or notes.

Import creates the definitions and progress together in a transaction. If either document already exists, it refuses to replace the account's data. It preserves the local file and browser storage. A blocked or unreadable local progress store aborts the import.

## 5. Verify two devices

Open the live site on the phone and sign into the same Google account. Confirm that a tick made on either device appears on the other, optional sections match, and resetting one checklist keeps other lists unchanged. Sign out and confirm the account's list names and ticks disappear; the app returns to the local or demo workspace.

Different ticks merge individually rather than replacing the entire progress document. For the same tick changed on two devices, the last write accepted by Firestore wins. This is not a history or backup system.

The app uses `persistentLocalCache` with `persistentMultipleTabManager`. Snapshot metadata distinguishes cached reads and unacknowledged writes from server-confirmed progress. `getPersistentCacheIndexManager` checks that the SDK actually enabled persistence before the UI promises offline safety. **Saved on this device** means the local snapshot contains the edit in the persistent cache; it can be closed and automatically synced later. Pending writes restored from another visit also block sign-out. A rejected write stays in the open tab with a retry warning and exit protection. If persistence is unavailable, keep the tab open until server acknowledgment.

`sw.js` atomically caches only public app assets and the three pinned Firebase SDK modules (their shared app dependency is included). It never caches Firestore/Auth API responses or `/private/`. After the first complete online preparation and account download, the app can start offline at its GitHub Pages scope. A new account with no local cache needs a connection; it never falls back to another account's data. Browser cleanup/eviction can remove queued data. Checklist definition transactions and backup restores require internet; for concurrent writes to the same tick, the last accepted write wins.

## Code and tests

- `cloud.js`: official SDK loading, login, account subscription, explicit PC import, progress patches, pending-write recovery and private-access controls.
- `firebase-config.mjs`: public web configuration; `null` disables Firebase connections.
- `firestore.rules`: server-enforced access and write validation; publish in Firebase Console.
- `routines.js`: reuses the existing checklist UI for the account workspace, with local and demo fallback after sign-out.
- `tests/browser.cjs` and `tests/firebase-fixture.mjs`: isolated transport fixtures for loading, merging, failures, import and sign-out. `tests/routine-model.test.mjs` verifies minimal progress patches and reset behavior.

The SDK is pinned to version `13.1.0` on Google's CDN. Configured accounts load it; offline preparation also caches its public code. No Analytics library or new desktop packages were installed. See [official web setup](https://firebase.google.com/docs/web/alt-setup), [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), [Firestore rules](https://firebase.google.com/docs/firestore/security/get-started) and [offline behavior](https://firebase.google.com/docs/firestore/manage-data/enable-offline).

## Checklist editing and restore

Deploy the current `firestore.rules` before publishing the editor. Owners can update definitions only by advancing an integer revision by one; legacy definitions without a revision start at zero. Definitions and pruned progress are replaced in a transaction. Restores additionally check that progress has not changed since preview. Existing documents need no migration. Account ownership and progress boolean validation remain enforced; document deletion is denied. Browser regression tests use an isolated fake transport and never contact the configured project.

## Account Notes activation (pending publication)

Publish the full current `firestore.rules` in Firebase Console → Firestore Database → Rules. It preserves existing checklist permissions and adds only `users/<UID>/notes/<version UUID>`, readable by that owner. Active note payloads are limited to `version`, `id`, `parent`, `text` (50,000 characters), a safe integer `updatedAt` and `retired: false`. Versions cannot be changed in place; exact idempotent retries are allowed. Replacing a note creates an immutable successor and replaces its predecessor with `{version: 1, id, retired: true}` in one batch. Retirement removes all previous text and cannot be reversed; concurrent successors remain separate. Account deletion uses the same retirement marker. The listener queries only `retired == false`, so old markers are not downloaded as notes. Physical document deletion is denied. The local pending journal and official persistent SDK queue support offline delivery without transactions.

Before considering activation complete, verify in Rules Playground: owner read/create/retire allowed; anonymous and another UID denied; oversized text/extra fields/bad UUIDs denied; changing an existing version or reactivating a retired ID denied; an identical retry allowed; physical deletion denied. These rules have not yet been published or exercised on the deployed service for Notes. Automated tests isolate Firebase and do not prove deployed rules. Once published, sign into the same account on two devices and confirm note creation/edit/deletion, offline reopening and concurrent-version preservation. Existing local notes are never uploaded by this verification unless explicitly copied.
