import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseArtwork, artworkSearch, chooseCatalogueArtwork, chooseTvArtwork, customArtwork, resolveArtwork } from '../library-artwork.mjs';
const page = (title, description, image = 'https://upload.wikimedia.org/wikipedia/en/a/ab/Example.jpg') => ({ title, description, thumbnail: { source: image }, fullurl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` });
test('Artwork matches the title and medium instead of a sequel, namesake or actor', () => {
  const pages = [page('Example 2', '2020 film'), page('Example', 'American actor'), page('Example (film)', '2010 film')];
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, pages).title, 'Example (film)');
  assert.equal(chooseArtwork({ title: 'Example', kind: 'game' }, pages), null);
  assert.equal(chooseArtwork({ title: 'Example [Movie]', kind: 'movie' }, pages).title, 'Example (film)');
  assert.match(new URL(artworkSearch({ title: 'Example', kind: 'game' })).searchParams.get('gsrsearch'), /video game/);
  assert.ok(chooseArtwork({ title: 'Example', kind: 'series' }, [page('Example', 'Television series', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.png')]));
});
test('Movie and TV catalogues cover spelling variants without changing sequel numbers', () => {
  const meta = (name, type = 'movie') => ({ name, type, id: 'tt12345', poster: 'https://images.metahub.space/poster/small/tt12345/img' });
  assert.ok(chooseCatalogueArtwork({ title: 'Cowboy Bepop', kind: 'anime' }, [meta('Cowboy Bebop', 'series')], 'series'));
  assert.equal(chooseCatalogueArtwork({ title: 'Example 2', kind: 'movie' }, [meta('Example 3')], 'movie'), null);
  assert.equal(chooseCatalogueArtwork({ title: 'Example', kind: 'movie' }, [{ ...meta('Example'), poster: 'https://evil.invalid/x' }], 'movie'), null);
  assert.ok(chooseTvArtwork({ title: 'Example' }, [{ show: { name: 'Example', url: 'https://www.tvmaze.com/shows/1/example', image: { medium: 'https://static.tvmaze.com/uploads/example.jpg' } } }]));
});
test('Every title has its own safe artwork even when no external cover exists', () => {
  const image = customArtwork({ title: '<script>alert(1)</script> & Title', kind: 'game' });
  const svg = decodeURIComponent(image.split(',')[1]);
  assert.match(image, /^data:image\/svg\+xml/);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.notEqual(image, customArtwork({ title: 'Another title', kind: 'game' }));
});
test('External catalogue failures fall back to Wikipedia and then custom artwork', async () => {
  const calls = [];
  const artwork = await resolveArtwork({ kind: 'movie', title: 'Example' }, { fetcher: async url => {
    calls.push(url);
    return url.includes('wikipedia.org') ? { ok: true, json: async () => ({ query: { pages: [page('Example', 'Film')] } }) } : { ok: false };
  } });
  assert.equal(artwork.provider, 'Wikipedia');
  assert.ok(calls.some(url => url.includes('cinemeta')));
});
test('Ambiguous versions and missing or unsafe images fall back to an icon', () => {
  assert.equal(chooseArtwork({ title: 'Example', kind: 'series' }, [page('Example (American TV series)', 'Television series'), page('Example (British TV series)', 'Television series')]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, [page('Example', 'Film', 'https://evil.invalid/poster.jpg')]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, [page('Example', 'Film', 'javascript:alert(1)')]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, [{ ...page('Example', 'Film'), fullurl: 'https://evil.invalid/' }]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, []), null);
});
