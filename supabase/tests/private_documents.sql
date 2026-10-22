-- Run after the migration, in a development project's SQL editor. All fixtures roll back.
begin;

insert into auth.users (id) values
  ('eeeeeeee-0000-4000-8000-000000000001'),
  ('eeeeeeee-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  saved public.hub_documents;
begin
  saved := public.save_hub_document('progress', '{"checks":{},"optional":{}}', 0);
  assert saved.owner_id = 'eeeeeeee-0000-4000-8000-000000000001'::uuid;
  assert saved.revision = 1;
  saved := public.save_hub_document('progress', '{"checks":{"demo/item":true},"optional":{}}', 1);
  assert saved.revision = 2;

  begin
    perform public.save_hub_document('progress', '{}', 1);
    raise exception 'FAIL: stale update was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_hub_document('progress', '{}', 0);
    raise exception 'FAIL: duplicate creation was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_hub_document('routines', '{}', 1);
    raise exception 'FAIL: missing document update was accepted';
  exception when serialization_failure then null;
  end;
  begin
    perform public.save_hub_document('invalid-key', '{}', 0);
    raise exception 'FAIL: invalid key was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.save_hub_document('routines', '[]', 0);
    raise exception 'FAIL: invalid body was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.save_hub_document('routines', jsonb_build_object('text', repeat('x', 1048577)), 0);
    raise exception 'FAIL: oversized body was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.save_hub_document('routines', '{}', -1);
    raise exception 'FAIL: invalid revision was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    update public.hub_documents set body = '{}';
    raise exception 'FAIL: direct write bypassed revision checks';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hub_documents (owner_id, document_key, body)
    values ('eeeeeeee-0000-4000-8000-000000000002', 'routines', '{}');
    raise exception 'FAIL: direct insert was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.hub_documents;
    raise exception 'FAIL: direct deletion bypassed tombstones';
  exception when insufficient_privilege then null;
  end;

  perform public.save_hub_document('note/eeeeeeee-0000-4000-8000-000000000003', '{"text":"Temporary test text"}', 0);
  saved := public.save_hub_document('note/eeeeeeee-0000-4000-8000-000000000003', '{"deleted":true}', 1);
  assert saved.body = '{"deleted":true}'::jsonb;
  assert not (saved.body ? 'text');
end;
$$;

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare
  saved public.hub_documents;
begin
  assert (select count(*) from public.hub_documents) = 0, 'Another account can read private documents';
  begin
    perform public.save_hub_document('progress', '{}', 2);
    raise exception 'FAIL: another account updated the first account document';
  exception when serialization_failure then null;
  end;
  saved := public.save_hub_document('progress', '{"checks":{},"optional":{}}', 0);
  assert saved.owner_id = 'eeeeeeee-0000-4000-8000-000000000002'::uuid;
  assert saved.revision = 1;
  assert (select count(*) from public.hub_documents) = 1;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"eeeeeeee-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  assert (select count(*) from public.hub_documents) = 2;
  assert (select revision from public.hub_documents where document_key = 'progress') = 2;
  assert (select body -> 'checks' ->> 'demo/item' from public.hub_documents where document_key = 'progress') = 'true';
end;
$$;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  begin
    perform public.save_hub_document('routines', '{}', 0);
    raise exception 'FAIL: missing identity was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform * from public.hub_documents;
    raise exception 'FAIL: anonymous reads were accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.save_hub_document('routines', '{}', 0);
    raise exception 'FAIL: anonymous saves were accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
