import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseList, newEntry, entryId, entryKey, readEntry, universeName, universeGroups } from '../library-model.mjs';
test('Library import preserves game categories, setup notes and titles with hyphens', () => {
  const games = parseList('Games\nAction: Fictional City - Custom setup\nVersus: Ninja - Ultimate 4\nComplete\nAdventure: Finished game', 'games');
  assert.equal(games[0].title, 'Fictional City'); assert.equal(games[0].notes, 'Custom setup');
  assert.equal(games[1].title, 'Ninja - Ultimate 4'); assert.equal(games[1].category, 'Versus');
  assert.equal(games[2].status, 'completed'); assert.equal(games[0].status, 'active');
});
test('Cinematic universes keep MCU, DCU, DCEU and Batman stories separate', () => {
  const entry = (category, kind = 'movie') => ({ ...newEntry(kind, 'Example'), category });
  assert.equal(universeName(entry('MCU Universe')), 'Marvel Cinematic Universe');
  assert.equal(universeName(entry('DCU')), 'DC Universe (DCU)');
  assert.equal(universeName(entry('DCEU')), 'DC Extended Universe (DCEU)');
  assert.equal(universeName(entry("Matt Reeves's Batman")), 'The Batman · Matt Reeves');
  assert.equal(universeName(entry('The Boys Universe')), 'The Boys');
  assert.equal(universeName(entry('', 'anime')), 'Anime · Standalone');
  const groups = universeGroups([['a', entry('DCEU')], ['b', entry('MCU Universe')], ['c', entry('MCU Universe')]]);
  assert.equal(groups[0].name, 'Marvel Cinematic Universe'); assert.equal(groups[0].items.length, 2); assert.equal(groups[1].items.length, 1);
});
test('Series season completion does not become whole-series completion and unclear types remain unsorted', () => {
  const entries = parseList('Anime:\nExample - S2 Complete\nSeries:\nShow - Complete\nShow B - Episode 8\n--- A universe\nUnknown -\n-- Movies:\nFilm - Complete !\n-- Series:\nNext - S3', 'entertainment');
  assert.equal(entries[0].status, 'paused'); assert.equal(entries[0].season, 2);
  assert.equal(entries[1].status, 'completed'); assert.equal(entries[2].episode, 8);
  assert.equal(entries[3].kind, 'other'); assert.equal(entries[3].status, 'planned');
  assert.equal(entries[4].kind, 'movie'); assert.equal(entries[4].status, 'completed');
  assert.equal(entries[5].kind, 'series'); assert.equal(entries[5].category, 'A universe');
});
test('Private library packets round-trip, deduplicate titles and reject malformed or foreign data', async () => {
  const entry = newEntry('game', 'Example');
  const id = await entryId(entry);
  assert.equal(id, await entryId({ ...entry, title: ' EXAMPLE ' }));
  assert.equal(entryKey(entry), 'game:example');
  assert.deepEqual(parseList(JSON.stringify({ version: 1, games: [entry, entry] }), 'games'), [entry]);
  for (const patch of [{ title: '' }, { rating: 11 }, { progress: 1.5 }, { episode: -1 }, { season: 50001 }, { revision: 0 }, { kind: 'bad' }, { extra: true }]) assert.throws(() => readEntry(id, { ...entry, ...patch }));
  assert.throws(() => parseList(JSON.stringify({ version: 1, games: [newEntry('movie', 'Foreign')] }), 'games'));
  assert.throws(() => parseList('x'.repeat(2000001), 'games'));
});
