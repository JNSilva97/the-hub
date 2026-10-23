# The Hub, explained simply

The app has three parts: HTML puts things on the screen, CSS makes them look and move the way they do, and JavaScript makes the buttons work. There is no build process. Optional account sync uses the configured Firebase project; setting its configuration to `null` disables the connection.

## 1. Start using it

Open the homepage and choose **Routines** beneath the optical core. Pick a checklist and tick its items. **Find anything** opens a search box that can take you straight to a checklist. **Settings** controls animation and optional sound.

Routines starts in **Field Mode**: one item, a **Mark done** button and a preview of what comes next. **Undo last tick** reverses your last Field Mode tick. Open **Review checklist** to change any tick or include optional sections. Your saved progress is shared between both views.

Choose **Notes** and start typing. Your first line becomes the title and each edit saves automatically. **New note** starts another note; **Find a note** searches the full text. Notes also opens from **Find anything**. Signed-out/local notes stay in this browser; public sample notes and the PC notebook are separate. Signed-in **Account notes** sync privately through Firebase after the current notes rules are published. **Local notes** returns to the original notebook. Existing local text is copied only through **Copy local notes** and its account confirmation.

**Delete note** asks for confirmation inside the app. **Keep note**, Escape or clicking outside cancels. After confirming, **Undo delete** recovers the last deleted note until you reload the page or successfully delete another note. Deleting one note leaves the others untouched.

While signed out, the online version uses example checklists. Your real lists load from the PC version at `http://127.0.0.1:8765/` while the local server is running. Those local ticks stay in that browser; account sync is a separate workspace.

**Private access** inside Routines is the entry point for checklist sync. Sign in on the PC and explicitly choose **Sync PC checklists**, then sign into the same account on your phone. See [Firebase setup and verification](FIREBASE_SETUP.md). Local notes remain local unless explicitly copied. On each personal device, open online once, wait for **Settings → Offline app ready**, and open your account lists. You can then reopen and tick offline. **Saved on this device** means ticks are stored locally and will sync when connected; **Progress synced to your account** confirms delivery. Login stays saved until sign-out. Pending writes block sign-out; rejected saves or unavailable storage still require keeping the tab open.

Choose **Edit checklist** beside the selected checklist title to edit directly in the checklist panel. Use the separate **Backup** button at the top for portable copies. Save applies edits; removals and backup replacement ask for confirmation. Existing ticks follow renamed or reordered items. If a save fails, keep the draft open and retry. Notes are separate. **Settings → Install** adds The Hub to your home screen when supported; sync still needs a connection.

## 2. Find the right file

| What you want to change | Where to look |
| --- | --- |
| Text, buttons, icons or dialog structure | `index.html` |
| Shared colors, fonts and page defaults | `styles/base.css` |
| Main layout, app tiles, skyline and screen sizes | `styles/shell.css` |
| Optical core, rings and central button | `styles/core.css` |
| Opening sequence and doors | `styles/access.css` |
| Dialogs, search and Settings appearance | `styles/panels.css` |
| Keyframes, pausing and reduced motion | `styles/motion.css` |
| Clock, opening dialogs and loading recovery | `interface.js` |
| Core-to-Routines transformation and return | `core-transition.js` |
| Checklist rings, home progress readout and completion pulses | `core-progress.js` |
| Search, intro replay and sound triggers | `experience.js` |
| Eye tracking and pointer light | `pointer-effects.js` |
| Electronic sound textures, durations and levels | `interface-sound.js` |
| Checklist appearance | `styles/routines.css` |
| Notes appearance and mobile writing layout | `styles/notes.css` |
| Local note saving, search and note dialog controls | `notes.js` / `styles/notes.css` |
| Account-note offline drafts, synchronization and conflict copies | `cloud-notes.js` / `notes-model.mjs` |
| Loading checklists, ticking items and saving | `routines.js` |
| Checking data and calculating completion | `routine-model.mjs` |
| Checklist editor, backup and restore | `routine-tools.js` / `styles/routine-tools.css` |
| Portable workspace validation and progress pruning | `workspace-model.mjs` |
| Home-screen installation and app identity | `install.js` / `manifest.webmanifest` / `assets/icons/` |
| Offline public app files and release updates | `sw.js` |
| Google login, account state and checklist synchronization | `cloud.js` |
| Public Firebase web configuration and server access rules | `firebase-config.mjs` / `firestore.rules` |
| Online example checklists | `routines.demo.json` |
| Your real checklists, on this PC only | `private/routines.json` |

Each component has one stylesheet. Its main rules come first and screen-size adjustments come at the bottom. Change the component's existing rule instead of adding another override. Shared fonts and defaults load first; motion controls load last. Decorative layers ignore pointer events so they cannot block clicks.

## 3. Understand the animation

The intro lasts 3.2 seconds. Its doors open, the optical system appears and the status text moves through three stages. Click or press a key to skip it. **Replay intro** starts it again.

Opening Routines fades and slides the panel into place while its optical artwork travels into the header. Closing it sends the eye home while the panel fades out. The two timings are named `open` and `close` near the top of `core-transition.js`; edit them there. The controller tracks opening, open and closing states, so Escape, resizing and navigation can interrupt the animation safely. With motion disabled, the dialog opens immediately.

The outer core rings show checklist progress. The readout beneath the launcher identifies them from outside to inside. They use the same saved ticks and optional sections as Field Mode. `core-progress.js` waits for the return journey to finish before filling the home rings, and pulses only for a new completion. It adds no separate storage or account.

The holographic eye is the `.eye-art` SVG in `index.html`. `core-transition.js` copies that same eye into the Routines header, preserving its pose and keeping SVG IDs unique. `styles/core.css` styles it, `styles/motion.css` defines its gentle drift and glow, and `pointer-effects.js` aims every visible eye toward the pointer, including the Routines header and traveling copy, or a keyboard-focused module. Pointer updates use a single scheduled frame, with no continuous JavaScript animation loop.

Inside `core-progress.js`, `buildRings` creates the rings and their labels; `render` updates their saved counts. Their appearance lives in `styles/core.css`. The ready counter sits below the rings, and only the decorative frame is clipped, so its text labels stay readable.

Most motion uses CSS transforms and opacity, which the browser can animate efficiently. Pointer lighting updates only when the mouse moves. There is no permanent JavaScript rendering loop. Turning motion off also disables replay; reduced-motion settings on your device take priority.

The startup is decorative. It does not log you in, encrypt your data or perform a security scan.

## 4. Protect saved progress

Checklist and item IDs connect the data to saved ticks. Changing a label is fine; changing an ID makes the browser treat it as a different item. **Start again** clears only the selected checklist, after confirmation.

The confirmation is part of the app's design. **Keep progress** is selected first, and Escape cancels it. Only **Clear ticks** performs the reset. Its appearance lives in `styles/panels.css`, and its behavior lives in `routines.js`.

Never add the `private` folder to GitHub. It is intentionally ignored. Public test fixtures use example data. The search launcher reads the same checklists already displayed on the current device; nothing is uploaded.

If browser storage is unavailable, the app says so and keeps ticks for the current visit. Reloading then loses those temporary ticks. Simultaneous changes in two tabs can conflict, so use one tab when actively ticking a list.

Private account offline ticks and submitted note batches use Firebase's IndexedDB cache, separate from the public app-file cache. Account notes also keep immediate pending drafts in UID-specific browser storage. Sign-out hides account text but does not securely erase cached data. Clearing site data removes offline copies and unsynced changes; keep backups. Offline storage needs a personal device. Checklist definition edits and backup restoration require internet. Local notes never sync automatically.

Notes saves each note separately. If two tabs edit the same text, it preserves local edits as another note. If you see **Not saved**, keep the tab open and copy the draft before leaving. Unreadable stored notes are preserved rather than replaced. Clearing browser data removes saved notes; there is no server backup.

Account notes store each submitted version under a new ID and retire its predecessor in one batch, removing its old text and keeping only an ID marker to prevent stale retries. Two devices editing the same version keep separate copies, identified as **Concurrent version**. New text saves immediately on-device, and a short typing pause sends the batch. Sync resumes when the app is open and connected. **Saved on device** permits closing; **Synced to your account** confirms delivery. Pending account-note saves block normal sign-out. Checklist Backup still contains only checklists, not notes.

## 5. Make a change safely

1. Edit the file that owns the change.
2. Preview it locally and try it with the mouse and keyboard.
3. Run the checks described in `README.md`.
4. Update affected asset version strings and bump the release cache version in `sw.js` whenever public app files change.
5. Commit and push the public files; GitHub Pages publishes them.

Projects, Goals, Health, Finance, Calendar and Relationships are still marked as coming later. Routines, Notes and Settings work now.
