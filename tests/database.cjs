// PGlite executes the actual migration and policies; Auth and REST still need hosted checks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('private documents isolate accounts and reject stale or unauthorized writes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
      $$;
      grant usage on schema auth, public to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;
      set plpgsql.check_asserts = on;
    `);
    const directory = path.join(__dirname, '..', 'supabase');
    await db.exec(readFileSync(path.join(directory, 'migrations', '202610220001_private_documents.sql'), 'utf8'));
    await db.exec(readFileSync(path.join(directory, 'tests', 'private_documents.sql'), 'utf8'));
    assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count, 0);
    assert.equal((await db.query('select count(*)::int as count from public.hub_documents')).rows[0].count, 0);
  } finally {
    await db.close();
  }
});
