// ============================================================
// ResinOps — Compliance data moat retrieval
// api/_compliance.js
//
// Full-text search over compliance_sources (state regulatory content,
// scraped/curated per target market), injected into the system prompt
// the same way api/_corrections.js injects approved corrections. The
// injected block is written so the model quotes or closely paraphrases
// ONLY the retrieved text with attribution -- it is not a license to
// use the retrieval as a springboard for the model's own independent
// interpretation of the regulation. Shared by api/import.js
// (general-chat purpose) and api/chat.js (the domain-expert modules).
// ============================================================

export async function fetchRelevantCompliance(supabase, facilityId, promptText) {
  try {
    if (!facilityId || !promptText) return '';

    const { data: facility } = await supabase
      .from('facilities')
      .select('state')
      .eq('id', facilityId)
      .single();
    const state = facility?.state;
    if (!state) return '';

    const { data, error } = await supabase.rpc('search_compliance_sources', {
      p_state: state,
      p_query: promptText,
      p_limit: 4,
    });
    if (error || !data?.length) return '';

    const excerpts = data
      .map(d => `- [${d.source_name}${d.effective_date ? ', ' + d.effective_date : ''}] ${d.title}: "${d.content}" (source: ${d.source_url})`)
      .join('\n');

    return '\n\nRelevant regulatory reference material for ' + state + ' — quote or closely paraphrase ONLY what appears below, with attribution to the source and date shown. Do not add outside knowledge or your own interpretation of what the regulation means. If this material does not fully answer the question, say so explicitly rather than filling the gap yourself:\n' + excerpts;
  } catch {
    return '';
  }
}
