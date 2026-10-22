# The Hub, explained simply

The app has three parts: HTML puts things on the screen, CSS makes them look and move the way they do, and JavaScript makes the buttons work. There is no build process. Optional account sync needs a Firebase project; it stays disabled until configured.

## 1. Start using it

Open the homepage and choose **Routines** beneath the optical core. Pick a checklist and tick its items. **Find anything** opens a search box that can take you straight to a checklist. **Settings** controls animation and optional sound.

Routines starts in **Field Mode**: one item, a **Mark done** button and a preview of what comes next. **Undo last tick** reverses your last Field Mode tick. Open **Review checklist** to change any tick or include optional sections. Your saved progress is shared between both views.

Choose **Notes** and start typing. Your first line becomes the title, and each edit saves automatically in this browser. **New note** starts another note; **Find a note** searches the full text. Notes also opens from **Find anything**. Public sample notes and the PC notebook are separate. Nothing you write is published or synced.

**Delete note** asks for confirmation inside the app. **Keep note**, Escape or clicking outside cancels. After confirming, **Undo delete** recovers the last deleted note until you reload the page or successfully delete another note. Deleting one note leaves the others untouched.

The online version uses example checklists. Your real lists load from the PC version at `http://127.0.0.1:8765/` while the local server is running. Ticks stay in the browser you use. They are not synced to your phone.

**Private access** inside Routines is the entry point for checklist sync. It currently explains that setup is pending. After [Firebase activation](FIREBASE_SETUP.md), sign in on the PC and explicitly choose **Sync PC checklists**, then sign into the same account on your phone. Notes remain local. A pending or failed cloud save must finish before you close the tab; normal sign-out is blocked until then.

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
| Search, intro replay, pointer light and sound triggers | `experience.js` |
| Electronic sound textures, durations and levels | `interface-sound.js` |
| Checklist appearance | `styles/routines.css` |
| Notes appearance and mobile writing layout | `styles/notes.css` |
| Note saving, search, conflict copies and dialog controls | `notes.js` |
| Loading checklists, ticking items and saving | `routines.js` |
| Checking data and calculating completion | `routine-model.mjs` |
| Google login, account state and checklist synchronization | `cloud.js` |
| Public Firebase web configuration and server access rules | `firebase-config.mjs` / `firestore.rules` |
| Online example checklists | `routines.demo.json` |
| Your real checklists, on this PC only | `private/routines.json` |

Each component has one stylesheet. Its main rules come first and screen-size adjustments come at the bottom. Change the component's existing rule instead of adding another override. Shared fonts and defaults load first; motion controls load last. Decorative layers ignore pointer events so they cannot block clicks.

## 3. Understand the animation

The intro lasts 3.2 seconds. Its doors open, the optical system appears and the status text moves through three stages. Click or press a key to skip it. **Replay intro** starts it again.

Opening Routines unfolds a circular workspace from the home core while its optical artwork travels into the header. Closing it folds the workspace back toward the core. The two timings are named `open` and `close` near the top of `core-transition.js`; edit them there. The controller tracks opening, open and closing states, so Escape, resizing and navigation can interrupt the animation safely. With motion disabled, the dialog opens immediately.

The outer core rings show checklist progress. The readout beneath the launcher identifies them from outside to inside. They use the same saved ticks and optional sections as Field Mode. `core-progress.js` waits for the return journey to finish before filling the home rings, and pulses only for a new completion. It adds no separate storage or account.

Inside `core-progress.js`, `buildRings` creates the rings and their labels; `render` updates their saved counts. Their appearance lives in `styles/core.css`. The ready counter sits below the rings, and only the decorative frame is clipped, so its text labels stay readable.

Most motion uses CSS transforms and opacity, which the browser can animate efficiently. Pointer lighting updates only when the mouse moves. There is no permanent JavaScript rendering loop. Turning motion off also disables replay; reduced-motion settings on your device take priority.

The startup is decorative. It does not log you in, encrypt your data or perform a security scan.

## 4. Protect saved progress

Checklist and item IDs connect the data to saved ticks. Changing a label is fine; changing an ID makes the browser treat it as a different item. **Start again** clears only the selected checklist, after confirmation.

The confirmation is part of the app's design. **Keep progress** is selected first, and Escape cancels it. Only **Clear ticks** performs the reset. Its appearance lives in `styles/panels.css`, and its behavior lives in `routines.js`.

Never add the `private` folder to GitHub. It is intentionally ignored. Public test fixtures use example data. The search launcher reads the same checklists already displayed on the current device; nothing is uploaded.

If browser storage is unavailable, the app says so and keeps ticks for the current visit. Reloading then loses those temporary ticks. Simultaneous changes in two tabs can conflict, so use one tab when actively ticking a list.

Notes saves each note separately. If two tabs edit the same text, it preserves local edits as another note. If you see **Not saved**, keep the tab open and copy the draft before leaving. Unreadable stored notes are preserved rather than replaced. Clearing browser data removes saved notes; there is no server backup.

## 5. Make a change safely

1. Edit the file that owns the change.
2. Preview it locally and try it with the mouse and keyboard.
3. Run the checks described in `README.md`.
4. Update asset version strings in `index.html` when publishing changed scripts or styles.
5. Commit and push the public files; GitHub Pages publishes them.

Projects, Goals, Health, Finance, Calendar and Relationships are still marked as coming later. Routines, Notes and Settings work now.
