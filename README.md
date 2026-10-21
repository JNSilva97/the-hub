# The Hub

A personal space with a near-black, neon-blue interface.

## Current version

A mechanical opening sequence, a three-dimensional optical core and nine module launchers. **Routines** contains five reusable checklists with saved ticks and optional sections. The other eight modules remain placeholders.

The intro is visual only and does not authenticate users. Any click or keypress skips it. Use **Pause motion** to stop interface animations; the system's reduced-motion preference is also respected.

Built with HTML, CSS and JavaScript. No dependencies or build step.

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

Keep the local server bound to loopback. Do not force-add the `private/` directory or copy personal data into public assets. Personal and demo ticks have separate browser-storage keys. Ticks are saved only in that browser and do not sync between devices. Clearing browser data clears the ticks; the original checklist file stays on disk.

## Recovery and saved progress

Open tabs in the same browser update their ticks when another tab saves progress. If browser storage is blocked or unreadable, ticks last for the current visit and the app shows a notice. Unreadable saved data is preserved. Browser storage does not support atomic updates across tabs; simultaneous edits can still conflict.

If a checklist download fails, open **Routines** and select **Try again**. A failed script download requires a page reload, which the retry button handles. Saved ticks are kept.

## Code layout

- `index.html` — accessible screen structure, icons and dialogs.
- `interface.js` / `interface.css` — screen controls, clock, launchers, intro and motion settings.
- `routines.js` / `routines.css` — checklist loading, rendering, browser storage and retry feedback.
- `routine-model.mjs` — data validation, progress calculations and scoped reset.
- `routines.demo.json` / ignored `private/routines.json` — public examples and local personal lists.

## Publish with GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, then select **main** and **/ (root)**.

Changes pushed to `main` update the live site after GitHub finishes deployment.

The published site is public. Keep personal records, credentials and private data out of tracked repository files.

## Check the interface

With the page open, paste `smoke-test.js` into the browser developer console, then run `testHub()`.

The check covers intro dismissal, pause/resume, reduced motion, all nine launchers, five checklist cards, dialog titles, closing, focus restoration, touch target sizes, label fit and horizontal overflow. Repeat at desktop and mobile widths.

Run the data-model tests with Node.js:

```sh
node --test tests/routine-model.test.mjs
```

For the browser regression suite, make the installed `playwright` package available to Node.js and use a system Chrome installation:

```sh
node --test tests/browser.cjs
```

The suite serves intercepted public fixtures without starting a server or reading personal data. It uses real pointer clicks at 320, 390, 768, 1024 and 1440 pixels, keyboard access, the smoke check, saved ticks, optional counts, scoped reset, cross-tab edits, failed-load retries, blocked/corrupt storage, reduced motion and separate demo/personal storage. Preview screenshots are ignored by Git. This verifies browser layouts; physical phones are not covered.
