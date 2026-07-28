-- Compliance data moat: scraped/curated regulatory reference content per
-- target market (state), surfaced through the AI Assistant on a
-- citation-only basis (retrieve + quote with source/date, never used as
-- a basis for the model's own independent interpretation).
--
-- Global table, same shape as ai_corrections (20260728100000) — readable
-- across every facility since retrieval has to work for everyone, writes
-- restricted to the platform admin since this is company-managed
-- reference data, not something individual facilities author.

begin;

create table if not exists public.compliance_sources (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  category text not null check (category in (
    'licensing', 'cultivation', 'processing', 'testing',
    'packaging_labeling', 'security', 'transport', 'general'
  )),
  title text not null,
  source_name text not null,
  source_url text not null,
  content text not null,
  effective_date date,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compliance_sources_state_category
  on public.compliance_sources (state, category);

-- Full-text search over title + content, used by the AI Assistant's
-- retrieval tool.
alter table public.compliance_sources
  add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored;

create index if not exists idx_compliance_sources_search
  on public.compliance_sources using gin (search_vector);

alter table public.compliance_sources enable row level security;
revoke all on public.compliance_sources from anon;

create policy compliance_sources_select on public.compliance_sources
  for select to authenticated using (true);
create policy compliance_sources_insert on public.compliance_sources
  for insert to authenticated with check (private.is_platform_admin());
create policy compliance_sources_update on public.compliance_sources
  for update to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy compliance_sources_delete on public.compliance_sources
  for delete to authenticated using (private.is_platform_admin());

drop trigger if exists set_updated_at on public.compliance_sources;
create trigger set_updated_at before update on public.compliance_sources
  for each row execute function public.set_updated_at();

-- RPC the AI Assistant calls to search this table. security definer so it
-- can run under the anon/authenticated role without needing broader table
-- grants; still strictly read-only and still gated by the select policy
-- above via the invoker's own auth context passed through PostgREST.
create or replace function public.search_compliance_sources(
  p_state text,
  p_query text,
  p_limit int default 5
)
returns table (
  id uuid,
  state text,
  category text,
  title text,
  source_name text,
  source_url text,
  content text,
  effective_date date,
  last_verified_at timestamptz,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $function$
  -- The AI Assistant passes raw user questions here ("what does a
  -- certificate of analysis need to include"), not curated keywords.
  -- websearch_to_tsquery/plainto_tsquery AND every significant term
  -- together, which returns nothing unless a document happens to
  -- contain all of them — too strict against a corpus of short
  -- excerpts. OR-ing the same stemmed terms instead (a document
  -- matching more terms still ranks higher via ts_rank) is far more
  -- forgiving for natural-language questions.
  select
    cs.id, cs.state, cs.category, cs.title, cs.source_name, cs.source_url,
    cs.content, cs.effective_date, cs.last_verified_at,
    ts_rank(cs.search_vector, to_tsquery('english', replace(plainto_tsquery('english', p_query)::text, ' & ', ' | '))) as rank
  from public.compliance_sources cs
  where cs.state = p_state
    and cs.search_vector @@ to_tsquery('english', replace(plainto_tsquery('english', p_query)::text, ' & ', ' | '))
  order by rank desc
  limit greatest(1, least(p_limit, 20))
$function$;

revoke all on function public.search_compliance_sources(text, text, int) from public, anon;
grant execute on function public.search_compliance_sources(text, text, int) to authenticated;

commit;
