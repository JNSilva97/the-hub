# The Hub

A personal space with a near-black, neon-blue and ice-cyan interface.

## Current version

**Nightfall edition.** A staged mechanical opening, an optical core, a distant neon skyline and nine module launchers. **Routines** contains five reusable checklists with saved ticks and optional sections. **Notes** captures text with automatic saving and search. **Settings** controls motion and optional sound. The other six modules remain placeholders.

The intro is visual only and does not authenticate users. Any click or keypress skips it. Use **Pause motion** to stop interface animations; the system's reduced-motion preference is also respected.

Use **Find anything** or **Ctrl/Cmd K** to search apps and checklists. Arrow keys move through results; Enter opens one and Escape closes the launcher. **Replay intro** repeats the opening when motion is enabled. Settings last for this visit; sound starts off and uses quiet, locally generated tones. There are no audio downloads or microphone permissions. Background CSS animations pause when the tab is hidden.

**Field Mode** opens with the first unchecked item in checklist order. Choose **Mark done** to save that tick and advance, or **Undo last tick** to reverse the last Field Mode action. **Review checklist** expands the full list and optional section switches; only enabled sections enter the sequence. Finishing shows a short visual confirmation. Existing ticks are reused, including after a reload; no daily setup or new storage is needed.

The eye is a translucent neon-blue hologram with an illuminated iris, fine radial fibres and light contours. Its eye, outer rings and rotating scanner share a centered axis. It gently drifts and follows the pointer on the home screen, during travel and in the Routines header; keyboard-focused modules also guide its gaze. Motion controls and reduced-motion settings disable movement. The header and traveling artwork reuse the same SVG eye, persistent circular outline and captured pose; the opening follows a continuous trajectory and the return blends into the home layer behind the title.

The home core has one progress ring per checklist, ordered from the outside in. The readout names each ring and shows its saved count. Completing a list pulses the docked core; returning home fills the rings and sends a blue pulse through the main core. Undo and reset update the same rings, while loading existing completions stays quiet. Motion controls and reduced-motion preferences also apply here.

**Instant Notes** opens directly into a plain-text editor. Its first line becomes the note title, **New note** starts another, and search matches the whole text. Notes have a 50,000-character limit. Signed-out/local notes save immediately in this browser; the public local notebook starts with samples and the PC notebook starts blank. Public and loopback notes use separate storage namespaces. Local notes are never automatically uploaded.

**Account Notes activation:** publish the current `firestore.rules` before account notes can synchronize. The app reports missing access rules and keeps the local notebook available with **Local notes**. No new package or service is required.

Once activated, the same Google login used by Routines opens **Account notes**. New account notes save on-device immediately and sync through Firebase, including after an offline close/reopen. **Saved on device** and **Synced to your account** distinguish local safety from server acknowledgment. Sync runs while the app is open. **Local notes** switches back to the untouched browser notebook. **Copy local notes** previews the destination account and requires confirmation; only persisted, nondeleted local text is copied, unedited samples are excluded, and originals stay local. Exact text already in the account is skipped.

`cloud-notes.js` sends immutable note versions in batches after a 600 ms typing pause or when the panel/tab is hidden: each batch creates the new version and replaces its predecessor with a text-free retirement marker. Markers prevent late retries from resurrecting old/deleted text and are excluded from the active-notes query. Concurrent devices editing the same predecessor leave two separate versions, marked **Concurrent version**, instead of overwriting text. A local pending-draft journal survives reloads and retries; the official SDK also persists submitted batches. Account drafts have a separate UID namespace. Rejected writes keep device drafts and block sign-out until synced; unavailable storage protects leaving. Browser cleanup can remove unsynced notes, so device storage is not a backup. There is no note history or automatic upload of the local notebook.

Each local note has its own browser-storage entry. Changes from another tab update the list; conflicting local edits are kept as separate notes. Unreadable records are left untouched. If saving fails, the draft stays available for this visit with a **Not saved** warning: keep the tab open and copy the text. Clearing browser data removes saved local notes. Only the account notebook syncs between devices.

**Delete note** opens an in-app confirmation with **Keep note** focused first. Local deletion removes the text and leaves deletion metadata to prevent stale tabs from resurrecting it. Account deletion removes that version on all signed-in devices; concurrent independent versions survive. **Undo delete** restores the last deleted text as a new note until another deletion, reload or account change. Failed local deletion keeps the note; failed cloud delivery keeps its device operation for retry. Deleted sample notes stay deleted too.

Optional sound uses three short digital textures: a rising scanner sweep for opening, a falling sweep for closing and a brief signal for selection. Frequency modulation adds metallic sidebands over band-passed data noise, with soft attacks and no bass impact or continuous drone. Turning sound off fades any remaining tail; hidden tabs are silenced. The synthesis and levels live in `interface-sound.js`.

Opening **Routines** slides and fades the panel into place in 320 ms while the eye travels to its header in 880 ms. The return takes 520 ms. The panel uses a small translation and opacity, without scaling its contents or animating its corners. Background motion pauses while Routines is open, and the dimmed backdrop uses no blur. Reduced or paused motion opens and closes immediately. Escape during opening reverses the journey; pressing Escape again completes closing immediately. Resizing or hiding the tab finishes the current transition safely.

**Start again** opens a styled confirmation with **Keep progress** focused by default. Escape, clicking outside or choosing Keep progress leaves saved ticks untouched. **Clear ticks** resets only that checklist and returns keyboard focus to its first input. The return animation keeps the traveling optic visible through its handoff to the home core while the modal backdrop fades out.

For a plain-English tour of the files, read [START_HERE.md](START_HERE.md).

Built with HTML, CSS and JavaScript, without a build step. Optional checklist sync connects to the configured Firebase project using the official Authentication and Firestore SDK from Google's CDN. Sign-in is required to access account data. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for setup and verification.

Display typography uses self-hosted Orbitron and Rajdhani fonts. Their SIL Open Font License notices are included in `assets/fonts/`. Checklist text keeps the system font for readability.

## Preview locally

Serve this folder using a loopback address. Routines needs a local server to load its data:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

## Personal and demo checklists

The public website loads `routines.demo.json`, which contains dummy examples.

On `127.0.0.1`, `localhost` or `[::1]`, the app first checks for `private/routines.json`. This file uses the same format as the demo data and is excluded from Git. If it is unavailable or invalid, the app shows the demo version with a notice.

Keep the local server bound to loopback. Do not force-add the `private/` directory or copy personal data into public assets. Personal and demo ticks have separate browser-storage keys. Without a configured and signed-in Firebase account, ticks stay in that browser. Clearing browser data clears those local ticks; the original checklist file stays on disk.

**Private access** in Routines opens the account panel. Sign in with Google and explicitly choose **Sync PC checklists** on the loopback version to import personal definitions and progress into an empty account. The same account can then access them from the public site. Demo data and notes are not uploaded. Different ticks merge individually. Login and the last loaded account checklists persist on this personal device; sign-out clears private names and ticks from the interface. Offline database copies remain in browser storage after sign-out, so do not enable this on shared devices.

Open the app online once on each device and wait for **Settings → Offline app ready**, then open your account checklists. Without internet, you can reopen the app, tick or untick items, use optional sections and reset a checklist. **Saved on this device** confirms queued ticks reached persistent storage and may survive closing/reloading; synchronization resumes when connected. **Progress synced to your account** means server confirmation. Different offline ticks merge with other devices; for the same tick, the last write accepted by Firestore wins. If persistent storage is unavailable or a save is rejected, the app warns and protects leaving; keep the tab open and retry. Normal sign-out remains blocked while any writes are pending, including writes restored from a previous visit. Account definition edits and backup restoration still require a connection.

Automatic sync runs while The Hub is open and connected. If you close it offline, the queued ticks stay on the device and resume syncing next time you open it online; there is no closed-app background synchronization.

## Checklist control and backups

On phones, use the compact **Choose checklist** picker beside **Edit checklist**; desktop keeps the sidebar. Both control the same saved checklists and ticks.

Open **Routines → Edit checklist** to create, rename and reorder checklists, sections and items. IDs stay stable when text or order changes, so saved ticks follow the same items. Optional sections can be switched on or off. Changes apply only with **Save changes**; removing saved items asks for confirmation. A failed save keeps the draft open. Closing a changed draft asks before discarding it.

The separate **Backup** button at the top of Routines downloads a portable JSON file containing saved checklist definitions and ticks. Notes, account credentials and unsaved drafts are excluded. Opening a backup validates its format and size (up to 2 MB), then shows counts and the destination before a second replacement confirmation. Export a copy before restoring if you need the old version. Restore rejects ticks changed since the preview; reopen the file to review the latest destination.

Signed-in changes use a Firestore transaction and revision check. Editing preserves the latest ticks from other devices; stale definition edits must be reopened. Unsigned edits save one browser-storage record containing definitions and progress; the original PC file stays on disk. Other tabs refresh this record. Browser storage cannot provide transactions across tabs, so truly simultaneous writes can still conflict. Do not edit the same workspace concurrently in multiple tabs.

## Install on your phone

Open **Settings → Install**. Supported browsers offer their native installation prompt. Otherwise the app shows instructions: on iPhone/iPad use Safari **Share → Add to Home Screen**; on Android use the browser menu's **Install app / Add to Home screen**. Desktop installation is also available when the browser supports it. The manifest and cube icons use relative URLs for GitHub Pages and loopback hosting.

Installation provides an icon and a standalone window. Offline startup also works in a normal supported browser tab after its first successful online preparation. An installed app may have separate storage, so open it online and sign in there once too. Google sign-in and initial account downloads require internet. Browser cleanup, private browsing and storage eviction can remove offline data, including unsynced ticks; offline storage is not a backup. The ignored PC file is never put into the service-worker cache; offline private use comes from the signed-in account's database cache.

## Recovery and saved progress

Open tabs in the same browser update their ticks when another tab saves progress. If browser storage is blocked or unreadable, ticks last for the current visit and the app shows a notice. Unreadable saved data is preserved. Browser storage does not support atomic updates across tabs; simultaneous edits can still conflict.

If a checklist download fails, open **Routines** and select **Try again**. A failed script download requires a page reload, which the retry button handles. Saved ticks are kept.

## Code layout

- `index.html` — accessible screen structure, icons and dialogs.
- `interface.js` / `experience.js` — screen controls, clock, loading recovery, quick access, intro replay and Settings.
- `pointer-effects.js` — eye tracking and button lighting, batched into one frame.
- `routines.js` — checklist loading, rendering and browser storage. Component styles live in `styles/`.
- `routine-model.mjs` — data validation, progress calculations and scoped reset.
- `routines.demo.json` / ignored `private/routines.json` — public examples and local personal lists.

`notes.js` owns note loading, saving, search, conflict copies and the Notes dialog's focus and closing transition. Its layout lives in `styles/notes.css`, with the entrance keyframes in `styles/motion.css`. Notes uses the same native dialog and quick-access patterns as the rest of the app.

`core-transition.js` owns the core-to-Routines animation. It uses native Web Animations and a decorative manual popover, with no animation library. The checklist remains a native modal dialog. When popovers are unavailable, the workspace still unfolds; if the transition script is unavailable, the dialog opens normally. The artwork copy is temporary, ignores clicks, takes no keyboard focus and is removed after each journey. SVG IDs are prefixed to avoid collisions.

`core-progress.js` listens for `hub:progress` events from `routines.js`. It does not fetch or store data. It holds the departure ring values while Routines is open, then applies the latest counts after the native dialog closes, so the return artwork meets the home core before the rings fill. An undone completion is removed from the pending home pulse.

`routine-tools.js` owns checklist drafts, backup downloads, restore previews and replacement confirmations. `workspace-model.mjs` validates portable workspaces and prunes progress for removed IDs. Their layout lives in `styles/routine-tools.css`. `install.js` owns installation prompts, service-worker registration and readiness feedback; `manifest.webmanifest` and `assets/icons/` contain the app identity. `sw.js` caches only an explicit list of public app files and the pinned SDK code, never private files or account/API responses. A complete release installs atomically; a failed download leaves the previous release working. Updates wait for existing tabs to close instead of reloading unsaved work.

`cloud.js` owns account state and synchronization. `firebase-config.mjs` is public connection configuration, while `firestore.rules` must be deployed on the service to enforce isolation. The checklist data model calculates the smallest progress patch, and the existing UI renders account, local and demo workspaces. Account changes clear the previous workspace's cards and core readout before loading the next one.

### Stylesheets

| File | Responsibility |
| --- | --- |
| `styles/base.css` | Fonts, shared tokens, page defaults and button accessibility |
| `styles/shell.css` | Header, clock, page layout, app tiles, skyline and footer |
| `styles/core.css` | Optical core, rings and the Routines launcher |
| `styles/access.css` | Opening sequence and mechanical doors |
| `styles/panels.css` | Shared dialogs, close buttons, quick access and Settings |
| `styles/routines.css` | Checklist cards, optional sections and progress |
| `styles/motion.css` | All keyframes, pause behavior and reduced motion |

Each component's final values live in its own stylesheet. Responsive adjustments sit at the bottom of that file, grouped by breakpoint. Shared motion rules load last so pause and reduced-motion settings apply across the app. Keep declarations on separate lines and edit the existing component block rather than adding a new override at the end. There is no separate theme override stylesheet.

## Publish with GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, then select **main** and **/ (root)**.

Changes pushed to `main` update the live site after GitHub finishes deployment.

Whenever a public app file changes, bump the cache version in `sw.js` as well as relevant script/style import versions. The worker downloads a complete matching release; close all The Hub tabs and reopen to activate a waiting update.

The published site is public. Keep personal records, credentials and private data out of tracked repository files.

## Check the interface

With the page open, paste `smoke-test.js` into the browser developer console, then run `testHub()`.

The check covers intro dismissal, pause/resume, reduced motion, all nine launchers, five checklist cards, dialog titles, closing, focus restoration, touch target sizes, label fit and horizontal overflow. Repeat at desktop and mobile widths.

Run the data-model tests with Node.js:

```sh
node --test tests/routine-model.test.mjs tests/workspace-model.test.mjs
```

For the browser regression suite, make the installed `playwright` package available to Node.js and use a system Chrome installation:

```sh
node --test tests/browser.cjs
node --test tests/offline.cjs
node --test tests/notes-model.test.mjs tests/notes-sync.cjs
```

New checks cover editor IDs, reordering, removal confirmation, backup round-trips, rejected storage writes, account revision conflicts, changed progress at restore time, installation prompts and holographic eye motion. The suite serves intercepted public fixtures without starting a server or reading personal data. It uses real pointer clicks at 320, 390, 768, 1024 and 1440 pixels, keyboard access, the smoke check, quick-access search, replay, Settings, sound opt-in, completion feedback, saved ticks, optional counts, scoped reset, cross-tab edits, failed-load retries, blocked/corrupt storage, reduced motion and separate demo/personal storage. Preview screenshots are ignored by Git. This verifies browser layouts and sound generation; physical phones and speaker volume are not covered.

`tests/offline.cjs` serves public files on a temporary loopback server with a fake identity/project. It downloads the pinned official SDK code, uses real Firestore IndexedDB and the service worker, closes/reopens offline, checks account isolation, and exercises failed/successful atomic app updates. Firebase backend requests are blocked; deployed rules and real cross-device delivery are not exercised. Controller fixtures separately test reconnection acknowledgment and persistent-storage failure warnings.

`tests/browser-fixture.cjs` shares the isolated public fixtures between browser and account-note suites. Note checks cover immutable replacement, concurrent branches, reload recovery, explicit local import, deletion/undo, rejected writes and storage failure. `notes-model.mjs` validates account data and selects visible versions; `notes.js` owns the existing local notebook and the UI; `cloud-notes.js` owns only account-note persistence and sync.

Pointer effects read the active eye and hovered button positions before writing any styles. A burst of mouse events schedules one frame; transforms update the gaze directly instead of changing inherited variables across the SVG. The glow belongs to the static outline so the moving iris does not redraw a filtered image.
