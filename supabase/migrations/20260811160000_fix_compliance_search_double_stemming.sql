-- Fix a double-stemming bug in search_compliance_sources() that silently
-- dropped real matches for some query words.
--
-- The OR-matching trick converts plainto_tsquery(...)'s AND-joined text
-- form ('licens' & 'type' & ...) to OR-joined ('licens' | 'type' | ...),
-- then re-parses that string. The original code re-parsed it with
-- to_tsquery('english', text), which is wrong: unlike a direct ::tsquery
-- cast, to_tsquery(config, text) runs the full tokenizer + stemmer
-- pipeline on its input, including the content inside the already-quoted
-- lexemes -- so an already-stemmed token like 'licens' gets stemmed a
-- second time, landing on 'licen' instead. That stem never matches any
-- document's search_vector (which correctly stores 'licens'), so every
-- question containing a word that stems to 'licens' silently returned
-- zero results for that term -- discovered live while verifying the new
-- "licensing" category excerpts (2026-08-11): a real NY licensing
-- citation, containing "License" right in the title, didn't surface for
-- a query containing the word "license".
--
-- Fix: cast the OR-joined text directly to ::tsquery instead of
-- re-parsing it through to_tsquery. A direct cast parses tsquery syntax
-- literally (quoted lexemes taken as-is), which is what round-tripping
-- an already-computed tsquery through its own text form requires.
--
-- Confirmed via psql: to_tsquery('english', $$'licens'$$) → 'licen'
-- (wrong, re-stemmed) vs ('licens')::tsquery → 'licens' (correct).

begin;

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
  -- forgiving for natural-language questions. The OR-joined text is
  -- cast directly to ::tsquery (not re-parsed via to_tsquery) so
  -- already-stemmed lexemes aren't run through the stemmer twice.
  select
    cs.id, cs.state, cs.category, cs.title, cs.source_name, cs.source_url,
    cs.content, cs.effective_date, cs.last_verified_at,
    ts_rank(cs.search_vector, (replace(plainto_tsquery('english', p_query)::text, ' & ', ' | '))::tsquery) as rank
  from public.compliance_sources cs
  where cs.state = p_state
    and cs.search_vector @@ (replace(plainto_tsquery('english', p_query)::text, ' & ', ' | '))::tsquery
  order by rank desc
  limit greatest(1, least(p_limit, 20))
$function$;

revoke all on function public.search_compliance_sources(text, text, int) from public, anon;
grant execute on function public.search_compliance_sources(text, text, int) to authenticated;

commit;
