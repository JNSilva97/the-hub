const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, demo } = require('./browser-fixture.cjs');
const data = () => ({ routines: JSON.parse(demo), progress: { checks: {}, optional: {} }, library: {} });
const make = (browser, options = {}) => fixture(browser, { firebase: true, motion: 'reduce', cloudDocuments: { 'account-a': data(), 'account-b': data() }, ...options });
const part = (page, domain, name) => page.locator(`#${domain}-dialog [data-part="${name}"]`);
async function open(page, domain) {
  await ready(page); await page.locator(`[data-icon="${domain}"]`).click();
  await part(page, domain, 'status').filter({ hasText: 'Synced to your account.' }).waitFor();
}
async function add(page, domain, title, kind, status = 'planned') {
  await part(page, domain, 'add').click();
  const form = part(page, domain, 'editor');
  await form.locator('[name="title"]').fill(title);
  await form.locator('[name="kind"]').selectOption(kind);
  await form.locator('[name="status"]').selectOption(status);
  await form.locator('[type="submit"]').click();
  await part(page, domain, 'status').filter({ hasText: 'Title saved.' }).waitFor();
}
test('Games and Entertainment workflows', { timeout: 120000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  for (const width of [320, 390, 1440]) await t.test(`create, find, pick, edit and update progress at ${width}px`, async () => {
    const { context, page, errors } = await make(browser, { width, mobile: width < 700 });
    try {
      await open(page, 'games');
      await add(page, 'games', 'A new adventure', 'game');
      await part(page, 'games', 'pick').click();
      assert.equal(await page.locator('#games-dialog .library-picked').count(), 1);
      await page.getByRole('button', { name: 'Play next', exact: true }).click();
      await part(page, 'games', 'status').filter({ hasText: 'Progress saved.' }).waitFor();
      await page.locator('#games-dialog [data-filter="active"]').click();
      await page.getByRole('button', { name: 'Details', exact: true }).click();
      await part(page, 'games', 'editor').locator('[name="progress"]').fill('35');
      const note = 'Finish the side quests first.\nBring <supplies> & explore.';
      await part(page, 'games', 'editor').locator('[name="notes"]').fill(note);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#games-dialog').evaluate(el => el.open), true);
      assert.equal(await page.locator('#account-logout').isDisabled(), true);
      await part(page, 'games', 'editor').locator('[type="submit"]').click();
      await part(page, 'games', 'status').filter({ hasText: 'Title saved.' }).waitFor();
      assert.equal(await page.locator('#games-dialog progress').getAttribute('value'), '35');
      assert.equal(await page.locator('#games-dialog .library-card-notes').textContent(), note);
      assert.equal(await page.locator('#games-dialog .library-card-notes supplies').count(), 0);
      await part(page, 'games', 'pick').click();
      assert.equal(await page.locator('#games-dialog .library-picked').count(), 1);
      await page.getByRole('button', { name: 'Mark finished', exact: true }).click();
      await part(page, 'games', 'status').filter({ hasText: 'Progress saved.' }).waitFor();
      await page.locator('#games-dialog [data-filter="completed"]').click();
      assert.equal(await page.locator('#games-dialog progress').getAttribute('value'), '100');
      assert.equal(await page.locator('#games-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      await part(page, 'games', 'close').click();
      await page.locator('[data-icon="entertainment"]').click();
      await add(page, 'entertainment', 'An example series', 'series', 'active');
      await page.getByRole('button', { name: 'Next episode', exact: true }).click();
      await part(page, 'entertainment', 'status').filter({ hasText: 'Progress saved.' }).waitFor();
      assert.match(await page.locator('#entertainment-dialog .library-position').textContent(), /Episode 1/);
      await part(page, 'entertainment', 'search').fill('no matching title');
      assert.equal(await part(page, 'entertainment', 'empty').isVisible(), true);
      await part(page, 'entertainment', 'search').fill('example');
      assert.equal(await page.locator('#entertainment-dialog .library-card').count(), 1);
      assert.equal(await page.locator('#entertainment-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('private combined import previews both modules, preserves existing titles and safely displays markup', async () => {
    const { context, page, errors } = await make(browser);
    try {
      await open(page, 'games');
      const model = await import('../library-model.mjs');
      const packet = { version: 1, games: [model.newEntry('game', '<img src=x onerror=alert(1)>')], entertainment: [model.newEntry('series', 'Example show')] };
      const file = { name: 'private-library.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) };
      await part(page, 'games', 'file').setInputFiles(file);
      await page.locator('#library-import-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#library-import-list label').count(), 2);
      assert.equal(await page.locator('#library-import-list img').count(), 0);
      await page.locator('#library-import-save').click();
      await part(page, 'games', 'status').filter({ hasText: '2 titles imported.' }).waitFor();
      assert.equal(await page.evaluate(() => Object.keys(window.__hubFirebase.docs['account-a'].library).length), 2);
      await part(page, 'games', 'file').setInputFiles(file);
      await page.locator('#library-import-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#library-import-list input:disabled').count(), 2);
      assert.equal(await page.locator('#library-import-save').isDisabled(), true);
      await page.locator('#library-import-cancel').click();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('rejected and conflicting saves retain edits; changing account never leaks titles', async () => {
    const { context, page, errors } = await make(browser);
    try {
      await open(page, 'games'); await add(page, 'games', 'Private title', 'game');
      await page.getByRole('button', { name: 'Details', exact: true }).click();
      await part(page, 'games', 'editor').locator('[name="notes"]').fill('Keep my draft');
      await page.evaluate(() => { window.__hubFirebase.rejectLibrary = true; });
      await part(page, 'games', 'editor').locator('[type="submit"]').click();
      await part(page, 'games', 'status').filter({ hasText: 'Could not save' }).waitFor();
      assert.equal(await part(page, 'games', 'editor').locator('[name="notes"]').inputValue(), 'Keep my draft');
      await page.evaluate(() => { const s = window.__hubFirebase; s.rejectLibrary = false; const entry = Object.values(s.docs['account-a'].library)[0]; entry.revision++; entry.notes = 'Another device'; s.publish(); });
      await part(page, 'games', 'editor').locator('[type="submit"]').click();
      await part(page, 'games', 'status').filter({ hasText: 'changed on another device' }).waitFor();
      await page.evaluate(() => { const s = window.__hubFirebase; s.user = { uid: 'account-b' }; s.authListener(s.user); });
      await page.waitForFunction(() => document.querySelector('#games-dialog [data-part="editor"]').hidden);
      assert.equal(await page.locator('#games-dialog .library-card').count(), 0);
      assert.equal(await page.locator('#games-dialog').getByText('Private title', { exact: true }).count(), 0);
      assert.equal(await part(page, 'games', 'editor').locator('[name="title"]').inputValue(), '');
      assert.equal(await part(page, 'games', 'editor').locator('[name="notes"]').inputValue(), '');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('signed-out, cached and denied libraries remain read-only', async () => {
    for (const options of [{ signedIn: false }, { fromCache: true }, {}]) {
      const { context, page, errors } = await make(browser, options);
      try {
        await ready(page); await page.locator('[data-icon="games"]').click();
        if (!Object.keys(options).length) { await page.evaluate(() => { window.__hubFirebase.libraryDenied = true; window.__hubFirebase.publish(); }); await part(page, 'games', 'status').filter({ hasText: 'unavailable' }).waitFor(); }
        else await part(page, 'games', 'status').filter({ hasText: options.fromCache ? 'Loading your library' : 'Sign in' }).waitFor();
        assert.equal(await part(page, 'games', 'add').isDisabled(), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });
  await t.test('titles and episode progress sync to another device and survive reloading', async () => {
    const first = await make(browser); const second = await make(browser);
    try {
      for (const item of [first, second]) await open(item.page, 'entertainment');
      await add(first.page, 'entertainment', 'Shared example', 'series', 'active');
      const copy = await first.page.evaluate(() => window.__hubFirebase.docs['account-a'].library);
      await second.page.evaluate(library => { window.__hubFirebase.docs['account-a'].library = library; window.__hubFirebase.publish(); }, copy);
      await second.page.getByRole('button', { name: 'Next episode', exact: true }).click();
      await part(second.page, 'entertainment', 'status').filter({ hasText: 'Progress saved.' }).waitFor();
      const latest = await second.page.evaluate(() => window.__hubFirebase.docs['account-a'].library);
      await first.page.evaluate(library => { window.__hubFirebase.docs['account-a'].library = library; window.__hubFirebase.publish(); }, latest);
      assert.match(await first.page.locator('#entertainment-dialog .library-position').textContent(), /Episode 1/);
      const documents = await first.page.evaluate(() => window.__hubFirebase.docs);
      await first.context.addInitScript(documents => { window.__hubFirebase.docs = documents; }, documents);
      await first.page.reload(); await first.page.locator('[data-icon="entertainment"]').click();
      await first.page.locator('#entertainment-dialog .library-position').filter({ hasText: 'Episode 1' }).waitFor();
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second.context.close(); }
  });
  await t.test('universes have independent sections, filtering and remembered collapse state', async () => {
    const model = await import('../library-model.mjs');
    const library = {};
    for (const [title, category] of [['Marvel fixture', 'MCU Universe'], ['DCU fixture', 'DCU'], ['DCEU fixture', 'DCEU'], ['Batman fixture', "Matt Reeves's Batman"]]) {
      const entry = { ...model.newEntry('movie', title), category }; library[await model.entryId(entry)] = entry;
    }
    const { context, page, errors } = await make(browser, { width: 320, cloudDocuments: { 'account-a': { ...data(), library } } });
    try {
      await open(page, 'entertainment');
      assert.equal(await page.locator('#entertainment-dialog .library-universe').count(), 4);
      const marvel = page.locator('#entertainment-dialog [data-universe="Marvel Cinematic Universe"]');
      await marvel.locator('summary').click();
      assert.equal(await marvel.evaluate(el => el.open), false);
      await part(page, 'entertainment', 'search').fill('fixture');
      assert.equal(await marvel.evaluate(el => el.open), false);
      await part(page, 'entertainment', 'category').selectOption('DC Universe (DCU)');
      assert.equal(await page.locator('#entertainment-dialog .library-universe').count(), 1);
      assert.match(await page.locator('#entertainment-dialog .library-card h3').textContent(), /DCU fixture/);
      assert.equal(await page.locator('#entertainment-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      await part(page, 'entertainment', 'category').selectOption('');
      await part(page, 'entertainment', 'pick').click();
      assert.equal(await page.locator('#entertainment-dialog .library-picked').isVisible(), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});
