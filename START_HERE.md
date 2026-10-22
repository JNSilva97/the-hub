# The Hub, explained simply

The app has three parts: HTML puts things on the screen, CSS makes them look and move the way they do, and JavaScript makes the buttons work. There is no build process and no server account to manage.

## 1. Start using it

Open the homepage and choose **Routines** beneath the optical core. Pick a checklist and tick its items. **Find anything** opens a search box that can take you straight to a checklist. **Settings** controls animation and optional sound.

The online version uses example checklists. Your real lists load from the PC version at `http://127.0.0.1:8765/` while the local server is running. Ticks stay in the browser you use. They are not synced to your phone.

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
| Search, intro replay, pointer light and sound | `experience.js` |
| Checklist appearance | `styles/routines.css` |
| Loading checklists, ticking items and saving | `routines.js` |
| Checking data and calculating completion | `routine-model.mjs` |
| Online example checklists | `routines.demo.json` |
| Your real checklists, on this PC only | `private/routines.json` |

Each component has one stylesheet. Its main rules come first and screen-size adjustments come at the bottom. Change the component's existing rule instead of adding another override. Shared fonts and defaults load first; motion controls load last. Decorative layers ignore pointer events so they cannot block clicks.

## 3. Understand the animation

The intro lasts 3.2 seconds. Its doors open, the optical system appears and the status text moves through three stages. Click or press a key to skip it. **Replay intro** starts it again.

Most motion uses CSS transforms and opacity, which the browser can animate efficiently. Pointer lighting updates only when the mouse moves. There is no permanent JavaScript rendering loop. Turning motion off also disables replay; reduced-motion settings on your device take priority.

The startup is decorative. It does not log you in, encrypt your data or perform a security scan.

## 4. Protect saved progress

Checklist and item IDs connect the data to saved ticks. Changing a label is fine; changing an ID makes the browser treat it as a different item. **Start again** clears only the selected checklist, after confirmation.

Never add the `private` folder to GitHub. It is intentionally ignored. Public test fixtures use example data. The search launcher reads the same checklists already displayed on the current device; nothing is uploaded.

If browser storage is unavailable, the app says so and keeps ticks for the current visit. Reloading then loses those temporary ticks. Simultaneous changes in two tabs can conflict, so use one tab when actively ticking a list.

## 5. Make a change safely

1. Edit the file that owns the change.
2. Preview it locally and try it with the mouse and keyboard.
3. Run the checks described in `README.md`.
4. Update asset version strings in `index.html` when publishing changed scripts or styles.
5. Commit and push the public files; GitHub Pages publishes them.

Projects, Goals, Health, Finance, Calendar, Relationships and Notes are still marked as coming later. Routines and Settings work now.
