# The Hub

A personal space with a near-black, neon-blue and ice-cyan interface.

## Current version

**Nightfall edition.** A staged mechanical opening, an optical core, a distant neon skyline and ten module launchers. **Goals** supports reusable checklists with saved ticks and optional sections. **Calendar** plans your week. **Health** tracks medication and stock. **Notes** captures text with automatic saving and search. **Settings** controls motion and optional sound. **Fitness** tracks daily push-ups and abs. Finance is the remaining placeholder.

**Library artwork** gives every title its own image: film and series covers from Cinemeta, TVmaze as a fallback for shows, and Wikipedia for games and remaining titles. Matches respect the media type and sequel number, with limited spelling correction and curated alternate-title IDs. Netflix One Piece is pinned to its live-action adaptation. Rare fan series and unreleased sequels may use an explicitly labelled universe icon. Official publisher artwork fills gaps such as L.A. by Night and Split Fiction. Temporary API limits are retried; unsuccessful lookups remain retryable on reopening the list. If no reliable picture exists, a unique SVG poster includes the full title and a game or screen icon. Covers load as cards approach the viewport, with two lookups at a time. Broken images try the next provider and ultimately keep the custom poster; progress controls stay usable. Each external picture links to its source. Lookups omit credentials/referrers, keep results in memory and clear on account changes. No API key or new Firebase rules are required. Sources: [Cinemeta](https://v3-cinemeta.strem.io/manifest.json), [TVmaze](https://www.tvmaze.com/api), [MediaWiki](https://www.mediawiki.org/wiki/Extension:PageImages#API).

**Entertainment universes** groups titles into collapsible sections, keeping MCU, Netflix Marvel, Sony Marvel, DCU, DCEU and Matt Reeves’s Batman separate. Other universes follow the account’s collection labels; standalone films, series and anime have separate shelves. The Universe filter goes directly to a shelf; each header shows its title count. Collapse state lasts for the current account session, and Pick for me opens the selected title’s section.

**Games** and **Entertainment** are separate account libraries with search, status and collection filters, ratings and notes. Games tracks platform and percentage progress; Entertainment supports movies, series, anime, videos and specials with season/episode tracking. **Pick for me** prioritizes a planned title, falling back to an active or on-hold title without changing its status; **Next episode** records progress. **Import list** previews TXT or version-1 JSON files, skips existing titles and imports both libraries from a combined packet. Personal lists are never bundled in public assets. A completed season stays **On hold** with its original season number, rather than marking the entire series finished. Unclear types are **Unsorted**. Save/Cancel guards editor drafts and conflicting account edits retain the draft. Connect before saving; cached entries remain readable offline.

**Fitness** replaces Relationships with daily goals of **50 push-ups** and **50 abs**. Add sets of 1, 5 or 10 reps; subtract 1 to correct a mistake. Counts use the Lisbon day and reset for the next day without deleting previous records. Sign-in is required, with transactional updates per account and day; cached progress is read-only offline. Enable the owner-only Fitness rules before publishing this feature.

**Calendar** is a private weekly planner for **Office** and **Gym/Muay Thai**. Combine plans on a date, or edit **Every [weekday]** to repeat them weekly. A custom date overrides its weekly pattern; unchecking every plan and saving keeps that date free. **Follow weekly plan** restores inheritance. Save and Cancel protect edits; stale saves keep the draft instead of replacing another device's changes. Account plans sync between devices, and cached plans remain readable offline. Connect before saving.

Open the **Calendar** module to review and edit plans. Goals shows all checklists by default. **Today’s checklists** optionally focuses on the plans for today; **All checklists** restores the full list. Morning Routine, Wind Down, required outfit tasks and Health remain available. Wind Down keeps both optional Office/Training preparation links visible by default; the focused view shows those appropriate for tomorrow. Planning never marks tasks or doses as done, and the schedule is separate from checklist definitions and backups.

The intro is visual only and does not authenticate users. Any click or keypress skips it. Use **Pause motion** to stop interface animations; the system's reduced-motion preference is also respected.

Use **Find anything** or **Ctrl/Cmd K** to search apps and checklists. Arrow keys move through results; Enter opens one and Escape closes the launcher. **Replay intro** repeats the opening when motion is enabled. Sound starts off and remembers your preference in this browser. Background CSS animations pause when the tab is hidden.

Goals opens the full checklist immediately. Tick items in any order; rows stay in place as you work, and tapping a checked item clears that tick. Optional sections stay available alongside the list. Progress, completion feedback and saved ticks work across reloads and synced devices without prescribing the next task.

**Habits** opens from its module card, the phone bar's **Habits** button or quick access. **Tobacco** counts today's cigarettes against a goal of zero and shows your smoke-free streak and best run. **Time without smoking** starts now or at a date you set, resets when you log a cigarette, and restores its previous start when you undo that cigarette. **Edit start time** corrects an active timer without changing cigarette or coffee counts. Signed-in corrections require a connection and the updated Habits rules. Future cigarettes still reset the timer, and undo restores the corrected start. Signed in, the timer and cigarette records sync across devices. Signed out, the timer stays on this device until sign-in. The five-minute craving countdown stays on the device that started it. **Coffee** lets you record every cup and warns when you exceed the daily goal of 3 or reach 17:00 Lisbon time. The time warning is skipped on Fridays, Saturdays and the eves of Portuguese national public holidays. When signed in, cigarette and coffee counts sync to your account and merge across devices, including offline; signed out, they stay on this device and move into the account the next time you sign in. **Nicotine lozenges**: the red **Log lozenge taken** button records a lozenge in Health, deducts one from its stock and starts the **Craving timer**, a 5-minute countdown you can also start on its own. Health's nicotine card has the same red button, and both views share one record. Both warn when 5 or fewer lozenges are left. **Last 7 days** lists cigarettes, coffee and lozenges per day. **Habits settings** stores the price of a pouch of rolling tobacco, cigarettes per pouch and how many you smoked a day before quitting; with all three tobacco values set, the Helper shows money saved in the last 7 days. Lozenges need exactly one as-needed Health item whose name contains "nicotine" and "lozenge". Account sync needs the current `firestore.rules`; see [Habits activation](FIREBASE_SETUP.md#addiction-helper-activation).

Use **Link checklist** in the editor to attach an item to another checklist. The item shows the destination’s progress and ticks automatically when the destination is complete.

The eye is a translucent neon-blue hologram with an illuminated iris, fine radial fibres and light contours. It gently drifts on the home screen and follows the pointer or a focused module. Motion controls and reduced-motion settings disable movement.

The home core has one progress ring per checklist, ordered from the outside in. The readout names each ring and shows its saved count. When you close Goals, the rings update and newly completed lists trigger a blue pulse. Undo and reset update the same rings, while loading existing completions stays quiet. Motion controls and reduced-motion preferences also apply here.

**Instant Notes** opens directly into a plain-text editor. Its first line becomes the note title, **New note** starts another, and search matches the whole text. On phones, **All notes** and **New note** stay at the bottom within thumb reach. All notes opens a searchable list; selecting a note returns to writing with more room for the keyboard. Notes have a 50,000-character limit. Signed-out/local notes save immediately in this browser; the public local notebook starts with samples and the PC notebook starts blank. Public and loopback notes use separate storage namespaces. Local notes are never automatically uploaded. Failed local saves are kept in memory across notebook/account switches for the current page visit, and leaving the page requests confirmation. This recovery is not persistent storage; keep the tab open and copy important unsaved text.

**Account Notes activation:** publish the current `firestore.rules` before account notes can synchronize. The app reports missing access rules and keeps the local notebook available with **Local notes**. No new package or service is required.

Once activated, the same Google login used by Goals opens **Account notes**. New account notes save on-device immediately and sync through Firebase, including after an offline close/reopen. **Saved on device** and **Synced to your account** distinguish local safety from server acknowledgment. Sync runs while the app is open. **Local notes** switches back to the untouched browser notebook. **Copy local notes** previews the destination account and requires confirmation; only persisted, nondeleted local text is copied, unedited samples are excluded, and originals stay local. Exact text already in the account is skipped.

`cloud-notes.js` sends immutable note versions in batches after a 600 ms typing pause or when the panel/tab is hidden: each batch creates the new version and replaces its predecessor with a text-free retirement marker. Markers prevent late retries from resurrecting old/deleted text and are excluded from the active-notes query. Concurrent devices editing the same predecessor leave two separate versions, marked **Concurrent version**, instead of overwriting text. A local pending-draft journal survives reloads and retries; the official SDK also persists submitted batches. Account drafts have a separate UID namespace. Rejected writes keep device drafts and block sign-out until synced; unavailable storage protects leaving. Browser cleanup can remove unsynced notes, so device storage is not a backup. There is no note history or automatic upload of the local notebook.

Each local note has its own browser-storage entry. Changes from another tab update the list; conflicting local edits are kept as separate notes. Unreadable records are left untouched. If saving fails, the draft stays available for this visit with a **Not saved** warning: keep the tab open and copy the text. Clearing browser data removes saved local notes. Only the account notebook syncs between devices.

**Delete note** opens an in-app confirmation with **Keep note** focused first. Local deletion removes the text and leaves deletion metadata to prevent stale tabs from resurrecting it. Account deletion removes that version on all signed-in devices; concurrent independent versions survive. **Undo delete** restores the last deleted text as a new note until another deletion, reload or account change. Failed local deletion keeps the note; failed cloud delivery keeps its device operation for retry. Deleted sample notes stay deleted too.

Startup uses Sci-Fi Confirmation, opening uses Sci-Fi Interface Robot Click, and closing uses Fast Sci-Fi Transition Sweep. The published app loads the [official Mixkit previews](https://mixkit.co/free-sound-effects/sci-fi/) when interface sound is on and caches them for offline use. If a preview is unavailable, that cue stays quiet. The PC uses its local edits in `assets/audio/mixkit-startup.mp3`, `mixkit-open.mp3` and `mixkit-close.mp3`, which stay out of Git under the [Mixkit license](https://mixkit.co/license/modal/sfxFree/). Local checkouts without those files use the bundled sweep. Checks, settings toggles and selections use the [Inspect Sound](https://freesound.org/people/LilMati/sounds/657948/) tap by LilMati (CC0). With interface sound on, a fingerprint screen appears when the browser requires a click. Tap the fingerprint to start the sound and animation together. The illustration uses no biometric data. Escape goes straight to the workspace.

Goals opens and closes immediately. The eye stays on the home screen, and its background motion pauses while Goals is open.

**Start again** opens a styled confirmation with **Keep progress** focused by default. Escape, clicking outside or choosing Keep progress leaves saved ticks untouched. **Clear ticks** resets only that checklist and returns keyboard focus to its first input. The return animation keeps the traveling optic visible through its handoff to the home core while the modal backdrop fades out.

For a plain-English tour of the files, read [START_HERE.md](START_HERE.md).

Built with HTML, CSS and JavaScript, without a build step. Optional checklist sync connects to the configured Firebase project using the official Authentication and Firestore SDK from Google's CDN. Sign-in is required to access account data. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for setup and verification.

Display typography uses self-hosted Orbitron and Rajdhani fonts. Their SIL Open Font License notices are included in `assets/fonts/`. Checklist text keeps the system font for readability.

## Health

The mobile **Health** shortcut opens **Today**, with a dose count, **Mark taken**, **Undo** and stock at a glance. **Add medication** asks for a name, schedule, quantity per dose and current stock. Daily entries can use a fixed Lisbon time, **Morning** or **Before bed**. Pack size is optional. **As needed (stock only)** keeps a stock record outside the daily dose count. Add a **Linked checklist** to record the same daily dose directly from Goals. **Edit medication** can change these fields. **Add stock** records a refill. **Recent activity** shows the latest changes.

**Before bed** items and ValdispertNoite track a sleep night, changing at **12:00 noon in Lisbon**. A record at 01:00 belongs to the previous night's window; another at 23:00 belongs to the next one. Each night can be recorded once across Health, linked checklists and devices. Activity retains the actual calendar date and time and identifies the night. Undo restores only that record's stock. Existing records keep their keys and stock deductions. Other daily items continue to follow calendar days.

Linked daily doses appear as rows in the routine's checklist and contribute to its single progress counter. Optional tasks are individually available: unchecked tasks do not block completion, while checked tasks count as done. Skincare **Later** applies only to the current checklist for today and can be undone; it preserves available skincare choices elsewhere.

A medication has one dose per Lisbon calendar day. Recording it from either view deducts stock once. Undo returns the amount that was originally recorded. Editing the dose applies to future records, moving a checklist link preserves the dose, and **Start again** only clears checklist ticks.

Once the Health rules are published, signing in opens your private, initially empty Health account. Medication setup, doses and stock sync across devices. An offline device can view a previously cached account. Connect before making account changes. A conflicting edit or a rejected write keeps the editor open so you can review or retry.

Health requires sign-in. **Today** shows doses and stock, and **Activity** shows recent changes. The **Import** tab previews a Health setup JSON file or pasted list, adds new medication names, and links them to matching account checklists where available. It preserves existing stock and dose history. Health storage is separate from checklist backups. See [Health activation](FIREBASE_SETUP.md#account-health-activation).

## Preview locally

Serve this folder using a loopback address. Goals needs a local server to load its data:

```sh
python -m http.server 8765 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8765/`.

## Personal and demo checklists

The public website loads `routines.demo.json`, which contains dummy examples.

On `127.0.0.1`, `localhost` or `[::1]`, the app first checks for `private/routines.json`. This file uses the same format as the demo data and is excluded from Git. If it is unavailable or invalid, the app shows the demo version with a notice.

Keep the local server bound to loopback. Do not force-add the `private/` directory or copy personal data into public assets. Personal and demo ticks have separate browser-storage keys. Without a configured and signed-in Firebase account, ticks stay in that browser. Clearing browser data clears those local ticks; the original checklist file stays on disk.

The circular Wi-Fi button on the home screen opens the account panel. Sign in with Google and explicitly choose **Sync PC checklists** on the loopback version to import personal definitions and progress into an empty account. The same account can then access them from the public site. Demo data and notes are not uploaded. Different ticks merge individually. Login and the last loaded account checklists persist on this personal device; sign-out clears private names and ticks from the interface. Offline database copies remain in browser storage after sign-out, so do not enable this on shared devices.

Open the app online once on each device and wait for **Settings → Offline app ready**, then open your account checklists. Without internet, you can reopen the app, tick or untick items, use optional sections and reset a checklist. **Saved on this device** confirms queued ticks reached persistent storage and may survive closing/reloading; synchronization resumes when connected. **Progress synced to your account** means server confirmation. Different offline ticks merge with other devices; for the same tick, the last write accepted by Firestore wins. If persistent storage is unavailable or a save is rejected, the app warns and protects leaving; keep the tab open and retry. Normal sign-out remains blocked while any writes are pending, including writes restored from a previous visit. Account definition edits and backup restoration still require a connection.

Automatic sync runs while The Hub is open and connected. If you close it offline, the queued ticks stay on the device and resume syncing next time you open it online; there is no closed-app background synchronization.

## Checklist control and backups

On phones, the home screen’s bottom bar opens **Goals**, **Notes** and **Settings** without scrolling. Unfinished modules are grouped under **More spaces**. Use the compact **Choose checklist** picker beside **Edit checklist**; desktop keeps the sidebar. The last selected checklist is remembered on this device, separately for local/demo workspaces and each account. If a remembered checklist is removed, the first available one opens instead. Navigation preferences never block saving progress.

Open **Goals → Edit checklist** to create, rename and reorder checklists, sections and items. IDs stay stable when text or order changes, so saved ticks follow the same items. Optional sections can be switched on or off. Changes apply only with **Save changes**; removing saved items asks for confirmation. A failed save keeps the draft open. Closing a changed draft asks before discarding it. The editor hides duplicate checklist controls and pauses Backup while editing. New items, sections and checklists focus their name field immediately; Save changes is disabled until something changes.

The separate **Backup** button at the top of Goals downloads a portable JSON file containing saved checklist definitions and ticks. Notes, account credentials and unsaved drafts are excluded. Opening a backup validates its format and size (up to 2 MB), then shows counts and the destination before a second replacement confirmation. Export a copy before restoring if you need the old version. Restore rejects ticks changed since the preview; reopen the file to review the latest destination.

Signed-in changes use a Firestore transaction and revision check. Editing preserves the latest ticks from other devices; stale definition edits must be reopened. Unsigned edits save one browser-storage record containing definitions and progress; the original PC file stays on disk. Other tabs refresh this record. Browser storage cannot provide transactions across tabs, so truly simultaneous writes can still conflict. Do not edit the same workspace concurrently in multiple tabs.

## Install on your phone

Open **Settings → Install**. Supported browsers offer their native installation prompt. Otherwise the app shows instructions: on iPhone/iPad use Safari **Share → Add to Home Screen**; on Android use the browser menu's **Install app / Add to Home screen**. Desktop installation is also available when the browser supports it. The manifest and cube icons use relative URLs for GitHub Pages and loopback hosting.

Installation provides an icon and a standalone window. Offline startup also works in a normal supported browser tab after its first successful online preparation. An installed app may have separate storage, so open it online and sign in there once too. Google sign-in and initial account downloads require internet. Browser cleanup, private browsing and storage eviction can remove offline data, including unsynced ticks; offline storage is not a backup. The ignored PC file is never put into the service-worker cache; offline private use comes from the signed-in account's database cache.

## Recovery and saved progress

Open tabs in the same browser update their ticks when another tab saves progress. If browser storage is blocked or unreadable, ticks last for the current visit and the app shows a notice. Unreadable saved data is preserved. Browser storage does not support atomic updates across tabs; simultaneous edits can still conflict.

If a checklist download fails, open **Goals** and select **Try again**. A failed script download requires a page reload, which the retry button handles. Saved ticks are kept.

## Code layout

- `index.html` — accessible screen structure, icons and dialogs.
- `interface.js` — app routing, phone navigation, quick access, clock and loading recovery.
- `experience.js` — intro replay, sound and visual atmosphere. Pointer lighting and gaze live in `pointer-effects.js`.
- `pointer-effects.js` — eye tracking and button lighting, batched into one frame.
- `routines.js` — checklist loading, rendering and browser storage. Component styles live in `styles/`.
- `routine-model.mjs` — data validation, progress calculations and scoped reset.
- `routines.demo.json` / ignored `private/routines.json` — public examples and local personal lists.

`notes.js` owns note loading, saving, search, conflict copies and the Notes dialog's focus and closing transition. Its layout lives in `styles/notes.css`, with the entrance keyframes in `styles/motion.css`. Notes uses the same native dialog and quick-access patterns as the rest of the app.

The core-progress script listens for checklist progress events and refreshes the home rings after Goals closes. An undone completion is removed from the pending home pulse.

`routine-tools.js` owns checklist drafts, backup downloads, restore previews and replacement confirmations. `workspace-model.mjs` validates portable workspaces and prunes progress for removed IDs. Their layout lives in `styles/routine-tools.css`. `install.js` owns installation prompts, service-worker registration and readiness feedback; `manifest.webmanifest` and `assets/icons/` contain the app identity. `sw.js` caches only an explicit list of public app files and the pinned SDK code, never private files or account/API responses. A complete release installs atomically; a failed download leaves the previous release working. Updates wait for existing tabs to close instead of reloading unsaved work.

`cloud.js` owns account state and synchronization. `firebase-config.mjs` is public connection configuration, while `firestore.rules` must be deployed on the service to enforce isolation. The checklist data model calculates the smallest progress patch, and the existing UI renders account, local and demo workspaces. Account changes clear the previous workspace's cards and core readout before loading the next one.

### Stylesheets

| File | Responsibility |
| --- | --- |
| `styles/base.css` | Fonts, shared tokens, page defaults and button accessibility |
| `styles/shell.css` | Header, clock, page layout, app tiles, skyline and footer |
| `styles/core.css` | Optical core, rings and the Goals launcher |
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

The check covers intro dismissal, pause/resume, reduced motion, all nine launchers, checklist navigation, dialog titles, closing, focus restoration, touch target sizes, label fit and horizontal overflow. Repeat at desktop and mobile widths.

Run the data-model tests with Node.js:

```sh
node --test tests/routine-model.test.mjs tests/workspace-model.test.mjs tests/habits-model.test.mjs tests/calendar-model.test.mjs tests/fitness-model.test.mjs tests/library-model.test.mjs tests/library-artwork.test.mjs
```

For the browser regression suite, make the installed `playwright` package available to Node.js and use a system Chrome installation:

```sh
node --test tests/browser.cjs tests/phone.cjs tests/health.cjs tests/health-bedtime.cjs tests/calendar.cjs tests/fitness.cjs tests/library.cjs tests/library-artwork.cjs
node --test tests/offline.cjs
node --test tests/notes-model.test.mjs tests/notes-sync.cjs
```

New checks cover editor IDs, reordering, removal confirmation, backup round-trips, rejected storage writes, account revision conflicts, changed progress at restore time, installation prompts and holographic eye motion. The suite serves intercepted public fixtures without starting a server or reading personal data. It uses real pointer clicks at 320, 390, 768, 1024 and 1440 pixels, keyboard access, the smoke check, quick-access search, replay, Settings, sound opt-in, completion feedback, saved ticks, optional counts, scoped reset, cross-tab edits, failed-load retries, blocked/corrupt storage, reduced motion and separate demo/personal storage. Preview screenshots are ignored by Git. This verifies browser layouts and sound generation; physical phones and speaker volume are not covered.

`tests/offline.cjs` serves public files on a temporary loopback server with a fake identity/project. It downloads the pinned official SDK code, uses real Firestore IndexedDB and the service worker, closes/reopens offline, checks account isolation, and exercises failed/successful atomic app updates. Firebase backend requests are blocked; deployed rules and real cross-device delivery are not exercised. Controller fixtures separately test reconnection acknowledgment and persistent-storage failure warnings.

`tests/browser-fixture.cjs` shares the isolated public fixtures between browser and account-note suites. Note checks cover immutable replacement, concurrent branches, reload recovery, explicit local import, deletion/undo, rejected writes and storage failure. `notes-model.mjs` validates account data and selects visible versions; `notes.js` owns the existing local notebook and the UI; `cloud-notes.js` owns only account-note persistence and sync.

Pointer effects read the active eye and hovered button positions before writing any styles. A burst of mouse events schedules one frame; transforms update the gaze directly instead of changing inherited variables across the SVG. The glow belongs to the static outline so the moving iris does not redraw a filtered image.
