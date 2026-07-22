// ============================================================
// ResinOps — AI corrections retrieval
// api/_corrections.js
//
// Simple keyword/tag matching, not embeddings — a correction has a
// small set of tags; a new prompt matches if any tag appears in it
// (case-insensitive substring match). Shared by api/import.js
// (general-chat purpose) and api/chat.js (the domain-expert modules)
// so both inject from the same approved knowledge base.
// ============================================================

export async function fetchRelevantCorrections(supabase, module, promptText) {
  try {
    const { data, error } = await supabase
      .from('ai_corrections')
      .select('tags,correction_text')
      .eq('status', 'approved')
      .in('module', [module, 'all']);
    if (error || !data?.length) return '';

    const lower = String(promptText || '').toLowerCase();
    const matched = data.filter(c => (c.tags || []).some(t => t && lower.includes(String(t).toLowerCase())));
    if (!matched.length) return '';

    return '\n\nKnown corrections from past facility feedback — apply these when relevant:\n' +
      matched.map(c => '- ' + c.correction_text).join('\n');
  } catch {
    return '';
  }
}

// Persists one exchange (user prompt + assistant reply). Creates a new
// ai_conversations row when conversationId isn't provided (first
// message of a session). Runs through the request's own authenticated
// supabase client, so normal facility RLS governs it — no service role
// needed since it's always the acting user's own facility.
export async function persistExchange(supabase, { facilityId, userId, module, conversationId, userText, assistantText }) {
  try {
    let convId = conversationId;
    if (!convId) {
      const { data: conv, error: convErr } = await supabase
        .from('ai_conversations')
        .insert({ facility_id: facilityId, user_id: userId, module, title: String(userText || '').slice(0, 80) })
        .select('id')
        .single();
      if (convErr || !conv) return { conversationId: null };
      convId = conv.id;
    }
    await supabase.from('ai_messages').insert([
      { conversation_id: convId, facility_id: facilityId, role: 'user', content: userText },
      { conversation_id: convId, facility_id: facilityId, role: 'assistant', content: assistantText },
    ]);
    return { conversationId: convId };
  } catch {
    return { conversationId: conversationId || null };
  }
}
