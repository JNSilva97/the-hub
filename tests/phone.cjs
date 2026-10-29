// Public fixtures only: exercise short phone viewports and failure recovery.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, openRoutines, chooseRoutine, browseNotes, demo } = require('./browser-fixture.cjs');

test('Phone workflows', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  await t.test('phone home exposes working apps in thumb reach and folds unfinished spaces away', async () => {
    for (const width of [320, 390]) {
      const { context, page, errors } = await fixture(browser, { width, height: 640, motion: 'reduce' });
      try {
        await ready(page);
        assert.equal(await page.locator('.apps > .app').count(), 2);
        assert.equal(await page.locator('#future-spaces').evaluate(el => el.open), false);
        assert.equal(await page.locator('.future-grid .app').count(), 6);
        assert.equal(await page.locator('.phone-actions').isVisible(), true);
        for (const button of await page.locator('.phone-actions button').all()) {
          assert.ok(await button.evaluate(el => { const r = el.getBoundingClientRect(); return r.height >= 44 && r.width >= 44 && r.bottom <= innerHeight; }));
        }
        await page.locator('#phone-routines').click();
        assert.equal(await page.locator('#routines-dialog').evaluate(el => el.open), true);
        assert.equal(await page.locator('.phone-actions').isVisible(), false);
        await chooseRoutine(page, 'workday'); await page.locator('.check-row input').nth(2).check();
        const checked = await page.locator('.check-row input:checked').getAttribute('data-check');
        await page.getByRole('button', { name: 'Close routines', exact: true }).click();
        await ready(page); await page.locator('#phone-routines').click();
        assert.equal(await page.locator('#routine-name').textContent(), 'Workday');
        assert.equal(await page.locator('.check-row input:checked').getAttribute('data-check'), checked);
        await page.getByRole('button', { name: 'Close routines', exact: true }).click();
        await page.locator('#future-spaces > summary').click();
        assert.equal(await page.locator('#future-spaces').evaluate(el => el.open), true);
        assert.equal(await page.locator('.future-grid .app-meta').first().textContent(), 'COMING SOON');
        await page.locator('[data-icon="projects"]').click();
        assert.match(await page.locator('#app-description').textContent(), /coming later/);
        await page.locator('#app-dialog .close').click();
        await page.locator('#phone-settings').click();
        assert.equal(await page.locator('#interface-settings').isVisible(), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });

  await t.test('phone navigation and quick access work even when atmosphere effects fail to load', async () => {
    const { context, page, errors } = await fixture(browser, { width: 390, motion: 'reduce' });
    try {
      await context.route('**/experience.js*', route => route.abort());
      await ready(page);
      await page.locator('#phone-settings').click();
      assert.equal(await page.locator('#interface-settings').isVisible(), true);
      assert.equal(await page.locator('#app-description').textContent(), 'Set the atmosphere of your terminal.');
      await page.locator('#app-dialog .close').click();
      await page.locator('#phone-notes').click();
      await page.locator('#note-text').fill('Navigation still works');
      await page.keyboard.press('Control+k');
      await page.locator('#command-search').fill('Workday'); await page.keyboard.press('Enter');
      assert.equal(await page.locator('#routine-name').textContent(), 'Workday');
      await page.getByRole('button', { name: 'Close routines', exact: true }).click();
      await page.keyboard.press('Control+k');
      await page.locator('#command-search').fill('Projects'); await page.keyboard.press('Enter');
      assert.match(await page.locator('#app-description').textContent(), /coming later/);
      assert.equal(await page.locator('#interface-settings').isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('phone note actions stay at the bottom and desktop controls return on resize', async () => {
    const { context, page, errors } = await fixture(browser, { width: 390, height: 640, motion: 'reduce' });
    try {
      await ready(page); await page.locator('#phone-notes').click();
      assert.equal(await page.locator('#note-new').evaluate(el => el.parentElement.id), 'notes-phone-actions');
      assert.ok(await page.locator('#note-new').evaluate(el => el.getBoundingClientRect().top > innerHeight / 2));
      await page.locator('#note-text').fill('Quick capture\nKeep this note.');
      await page.locator('#notes-browse').click();
      assert.equal(await page.locator('#notes-browse').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#note-text').isVisible(), false);
      await page.locator('#note-new').click();
      assert.equal(await page.locator('#notes-library').evaluate(el => el.open), false);
      assert.equal(await page.locator('#note-text').inputValue(), '');
      await browseNotes(page); await page.locator('#note-list button').filter({ hasText: 'Quick capture' }).click();
      assert.equal(await page.locator('#note-text').inputValue(), 'Quick capture\nKeep this note.');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.getElementById('note-new').parentElement.className === 'notes-actions');
      assert.equal(await page.locator('.apps > .app').count(), 8);
      assert.equal(await page.locator('#future-spaces').isVisible(), false);
      assert.equal(await page.locator('#note-new').evaluate(el => el.parentElement.className), 'notes-actions');
      assert.equal(await page.locator('#notes-library').evaluate(el => el.open), true);
      await page.setViewportSize({ width: 390, height: 640 });
      await page.waitForFunction(() => document.getElementById('note-new').parentElement.id === 'notes-phone-actions');
      assert.equal(await page.locator('#note-new').evaluate(el => el.parentElement.id), 'notes-phone-actions');
      assert.equal(await page.locator('#notes-library').evaluate(el => el.open), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('remembered checklists stay separate for each signed-in account', async () => {
    const account = () => ({ routines: JSON.parse(demo), progress: { checks: {}, optional: {} } });
    const { context, page, errors } = await fixture(browser, { width: 390, motion: 'reduce', firebase: true,
      cloudDocuments: { 'account-a': account(), 'account-b': account() } });
    try {
      await ready(page); await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account');
      await openRoutines(page); await chooseRoutine(page, 'workday');
      const changeAccount = uid => page.evaluate(uid => { const service = window.__hubFirebase; service.user = { uid, email: uid + '@example.invalid' }; service.authListener(service.user); }, uid);
      await changeAccount('account-b');
      await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Personal Care');
      await chooseRoutine(page, 'training');
      await changeAccount('account-a');
      await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Workday');
      await changeAccount('account-b');
      await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Training');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('editing hides account navigation, skips unchanged saves and focuses newly added fields', async () => {
    for (const width of [320, 390]) {
      const { context, page, errors } = await fixture(browser, { width, height: 600, motion: 'reduce', firebase: true,
        cloudDocuments: { 'account-a': { routines: JSON.parse(demo), progress: { checks: { 'personal-care/care/item-1': true }, optional: {} } } } });
      try {
        await ready(page);
        await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account');
        await openRoutines(page); await page.locator('#control-launch').click();
        assert.equal(await page.locator('#account-launch').isVisible(), false);
        assert.equal(await page.locator('.routine-heading').isVisible(), false);
        assert.equal(await page.locator('#editor-save').isDisabled(), true);
        const unchanged = await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs));
        await page.locator('#editor-save').evaluate(button => button.click());
        assert.equal(await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs)), unchanged);
        await page.locator('.editor-section').first().getByRole('button', { name: '+ Add item', exact: true }).click();
        assert.equal(await page.evaluate(() => document.activeElement.value), 'New item');
        assert.equal(await page.evaluate(() => document.activeElement.selectionEnd), 'New item'.length);
        await page.keyboard.type('Added from my phone');
        assert.equal(await page.locator('#editor-save').isEnabled(), true);
        assert.match(await page.locator('#control-status').textContent(), /Unsaved changes/);
        await page.getByRole('button', { name: '+ Add section', exact: true }).click();
        assert.equal(await page.evaluate(() => document.activeElement.value), 'New section');
        await page.keyboard.type('Phone section');
        await page.locator('#editor-add-list').click();
        assert.equal(await page.evaluate(() => document.activeElement.value), 'New checklist');
        await page.keyboard.type('Phone list');
        await page.locator('#editor-save').click();
        await page.waitForFunction(() => document.getElementById('control-status').textContent.startsWith('Saved.'));
        assert.equal(await page.locator('#editor-save').isDisabled(), true);
        assert.equal(await page.evaluate(() => window.__hubFirebase.docs['account-a'].progress.checks['personal-care/care/item-1']), true);
        assert.equal(await page.evaluate(() => window.__hubFirebase.docs['account-a'].routines.routines.at(-1).name), 'Phone list');
        await page.locator('#control-close').click();
        assert.equal(await page.locator('#account-launch').isVisible(), true);
        assert.equal(await page.locator('#routine-reader').isVisible(), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });

  await t.test('short phone viewports support writing, browsing and returning to local and account notes', async () => {
    for (const width of [320, 390]) for (const account of [false, true]) {
      const { context, page, errors } = await fixture(browser, { width, height: 440, motion: 'reduce', firebase: account });
      try {
        await ready(page); await page.locator('[data-icon="notes"]').click();
        await page.waitForFunction(() => !document.getElementById('note-text').readOnly);
        assert.equal(await page.locator('#notes-library').evaluate(el => el.open), false);
        assert.ok(await page.locator('#note-text').evaluate(el => el.getBoundingClientRect().height) >= 90, 'Writing must remain usable with a short viewport.');
        await page.locator('#note-text').fill('First phone note\nKeep this thought.');
        if (account) await page.waitForFunction(() => document.getElementById('notes-status').textContent === 'Synced to your account.');
        await page.locator('#note-new').click();
        await page.locator('#note-text').fill('Second phone note\nAnother thought.');
        if (account) await page.waitForFunction(() => document.getElementById('notes-status').textContent === 'Synced to your account.');
        await browseNotes(page);
        assert.equal(await page.locator('#note-text').isVisible(), false);
        assert.equal(await page.locator('#notes-search').evaluate(el => getComputedStyle(el).fontSize), '16px');
        await page.locator('#notes-search').fill('First phone');
        assert.equal(await page.locator('#note-list button').count(), 1);
        await page.locator('#note-list button').click();
        assert.equal(await page.locator('#notes-library').evaluate(el => el.open), false);
        assert.equal(await page.locator('#note-text').inputValue(), 'First phone note\nKeep this thought.');
        assert.equal(await page.locator('#notes-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });

  await t.test('failed local saves survive notebook switching without replacing a saved version or uploading text', async () => {
    const originalId = 'a0000000-0000-4000-8000-000000000001';
    const original = { version: 1, id: originalId, text: 'Saved local\nOriginal text', updatedAt: 1 };
    const { context, page, errors } = await fixture(browser, { width: 390, motion: 'reduce', firebase: true, signedIn: false });
    try {
      await context.addInitScript(note => localStorage.setItem('thehub:notes:demo:v1:' + note.id, JSON.stringify(note)), original);
      await ready(page); await page.locator('[data-icon="notes"]').click();
      await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('Storage full'); }; });
      await page.locator('#note-text').fill('Unsaved local draft');
      assert.equal(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true }))), true);
      await page.evaluate(() => { const service = window.__hubFirebase; service.user = { uid: 'account-a', email: 'test@example.invalid' }; service.authListener(service.user); });
      await page.waitForFunction(() => document.getElementById('notes-source').textContent.includes('YOUR ACCOUNT'));
      await page.locator('#notes-local').click();
      assert.equal(await page.locator('#note-text').inputValue(), 'Unsaved local draft');
      assert.match(await page.locator('#notes-status').textContent(), /Not saved/);
      assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('thehub:notes:demo:v1:' + id)).text, originalId), original.text);
      await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
      await page.locator('#note-text').fill('Recovered local draft');
      assert.match(await page.locator('#notes-status').textContent(), /^Saved/);
      assert.equal(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true }))), false);
      assert.equal(await page.evaluate(() => window.__hubFirebase.noteWrites.length), 0);
      assert.equal(await page.evaluate(id => JSON.parse(localStorage.getItem('thehub:notes:demo:v1:' + id)).text, originalId), original.text);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});
