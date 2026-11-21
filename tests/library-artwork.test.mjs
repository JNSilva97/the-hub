import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseArtwork, artworkSearch } from '../library-artwork.mjs';
const page = (title, description, image = 'https://upload.wikimedia.org/wikipedia/en/a/ab/Example.jpg') => ({ title, description, thumbnail: { source: image }, fullurl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` });
test('Artwork matches the title and medium instead of a sequel, namesake or actor', () => {
  const pages = [page('Example 2', '2020 film'), page('Example', 'American actor'), page('Example (film)', '2010 film')];
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, pages).title, 'Example (film)');
  assert.equal(chooseArtwork({ title: 'Example', kind: 'game' }, pages), null);
  assert.equal(chooseArtwork({ title: 'Example [Movie]', kind: 'movie' }, pages).title, 'Example (film)');
  assert.match(new URL(artworkSearch({ title: 'Example', kind: 'game' })).searchParams.get('gsrsearch'), /video game/);
  assert.ok(chooseArtwork({ title: 'Example', kind: 'series' }, [page('Example', 'Television series', 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.png')]));
});
test('Ambiguous versions and missing or unsafe images fall back to an icon', () => {
  assert.equal(chooseArtwork({ title: 'Example', kind: 'series' }, [page('Example (American TV series)', 'Television series'), page('Example (British TV series)', 'Television series')]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, [page('Example', 'Film', 'https://evil.invalid/poster.jpg')]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, [page('Example', 'Film', 'javascript:alert(1)')]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, [{ ...page('Example', 'Film'), fullurl: 'https://evil.invalid/' }]), null);
  assert.equal(chooseArtwork({ title: 'Example', kind: 'movie' }, []), null);
});
