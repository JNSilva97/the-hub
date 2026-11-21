const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, demo } = require('./browser-fixture.cjs');
test('Library artwork loads on demand and failed images keep useful icons', { timeout: 60000 }, async t => {
  const model = await import('../library-model.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  for (const width of [320, 1440]) await t.test(`visible covers and source links at ${width}px`, async () => {
    const library = {};
    for (let i = 0; i < 24; i++) { const e = model.newEntry('game', `Cover example ${String(i).padStart(2, '0')}`); library[await model.entryId(e)] = e; }
    const { context, page, errors } = await fixture(browser, { width, height: 900, motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': { routines: JSON.parse(demo), progress: { checks: {}, optional: {} }, library } } });
    const queries = [];
    try {
      await context.route('https://en.wikipedia.org/w/api.php?**', route => {
        const title = new URL(route.request().url()).searchParams.get('gsrsearch').replace(/ video game$/, ''); queries.push(title);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages: [{ title, description: 'Video game', fullurl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`, thumbnail: { source: `https://upload.wikimedia.org/wikipedia/en/a/ab/${encodeURIComponent(title)}.png` } }] } }) });
      });
      await context.route('https://upload.wikimedia.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a00sAAAAASUVORK5CYII=', 'base64') }));
      await ready(page); assert.equal(queries.length, 0);
      await page.locator('[data-icon="games"]').click();
      await page.locator('#games-dialog .library-art[data-artwork="loaded"]').first().waitFor();
      assert.ok(queries.length < 24, 'Offscreen cards must not request the entire library.');
      const link = page.locator('#games-dialog .library-image-source:not([hidden])').first();
      assert.match(await link.getAttribute('href'), /^https:\/\/en.wikipedia.org\/wiki\//);
      assert.equal(await page.locator('#games-dialog .library-art img').first().getAttribute('referrerpolicy'), 'no-referrer');
      assert.equal(await page.locator('#games-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      await page.locator('#games-dialog .library-card').last().scrollIntoViewIfNeeded();
      await page.locator('#games-dialog .library-card').last().locator('.library-art[data-artwork="loaded"]').waitFor();
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('missing and broken pictures never hide the title or block progress', async () => {
    const e = model.newEntry('movie', 'Broken poster');
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': { routines: JSON.parse(demo), progress: { checks: {}, optional: {} }, library: { [await model.entryId(e)]: e } } } });
    try {
      await context.route('https://en.wikipedia.org/w/api.php?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ query: { pages: [{ title: e.title, description: 'Film', fullurl: 'https://en.wikipedia.org/wiki/Broken_poster', thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/en/a/ab/broken.png' } }] } }) }));
      await context.route('https://upload.wikimedia.org/**', route => route.fulfill({ status: 404, body: 'Not found' }));
      await ready(page); await page.locator('[data-icon="entertainment"]').click();
      await page.locator('.library-art[data-artwork="fallback"]').waitFor();
      assert.equal(await page.locator('#entertainment-dialog .library-custom-art').isVisible(), true);
      assert.equal(await page.locator('#entertainment-dialog h3').filter({ hasText: 'Broken poster' }).isVisible(), true);
      assert.equal(await page.getByRole('button', { name: 'Watch next', exact: true }).isEnabled(), true);
      assert.equal(await page.locator('#entertainment-dialog .library-image-source').isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});
