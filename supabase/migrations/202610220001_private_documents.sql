begin;

create table public.hub_documents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null check (
    document_key in ('routines', 'progress') or
    document_key ~ '^note/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  ),
  body jsonb not null check (
    jsonb_typeof(body) = 'object' and octet_length(body::text) <= 1048576
  ),
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key (owner_id, document_key)
);

alter table public.hub_documents enable row level security;

create policy "Read own Hub documents"
on public.hub_documents for select to authenticated
using ((select auth.uid()) = owner_id);

revoke all on public.hub_documents from public, anon, authenticated;
grant select on public.hub_documents to authenticated;

-- Only this function writes; callers cannot choose an owner or bypass revision checks.
create function public.save_hub_document(
  p_key text,
  p_body jsonb,
  p_expected_revision bigint
)
returns public.hub_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  saved public.hub_documents;
begin
  if account_id is null then
    raise exception 'Sign in before saving.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision > 9007199254740990 then
    raise exception 'Invalid revision.' using errcode = '22023';
  end if;

  if p_expected_revision = 0 then
    insert into public.hub_documents (owner_id, document_key, body)
    values (account_id, p_key, p_body)
    on conflict (owner_id, document_key) do nothing
    returning * into saved;
  else
    update public.hub_documents
    set body = p_body, revision = revision + 1, updated_at = now()
    where owner_id = account_id and document_key = p_key
      and revision = p_expected_revision
    returning * into saved;
  end if;

  if not found then
    raise exception 'Document changed. Read the latest version before saving.' using errcode = '40001';
  end if;
  return saved;
end;
$$;

revoke all on function public.save_hub_document(text, jsonb, bigint) from public, anon;
grant execute on function public.save_hub_document(text, jsonb, bigint) to authenticated;

commit;
