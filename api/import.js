import { authenticateRequest } from './_auth.js';
import {
  applyCors,
  checkRateLimit,
  isOriginAllowed,
  validateAiPayload,
} from './_request-security.js';
import { initializeApiRequest, logApiError, sendApiError } from './_observability.js';
import { fetchRelevantCorrections, persistExchange } from './_corrections.js';

export default async function handler(req, res) {
  const requestId = initializeApiRequest(req, res);
  applyCors(req, res);
  if (!isOriginAllowed(req.headers?.origin)) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const limited = checkRateLimit(`ai:${auth.user.id}`, { limit: 30, windowMs: 60_000 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfterSeconds));
    return res.status(429).json({ error: 'Too many AI requests. Try again shortly.' });
  }

  const validationError = validateAiPayload(req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { system, prompt, history = [], purpose = 'general-chat', facilityId, module, conversationId } = req.body;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI service is not configured' });

  // Build messages array — support multi-turn history for collaborative features
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: prompt },
  ];

  // Use higher token limit for import operations (large CSVs need room)
  const isImport = purpose === 'data-import';
  const max_tokens = isImport ? 4000 : 1000;
  const isChat = purpose === 'general-chat' || purpose === 'operations-analyst';
  const chatModule = module || (purpose === 'operations-analyst' ? 'ops-analyst' : 'ai-assistant');

  let systemPrompt = system || "You are a helpful assistant.";
  if (isChat) {
    systemPrompt += await fetchRelevantCorrections(auth.supabase, chatModule, prompt);
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      await response.json().catch(() => ({}));
      logApiError(
        { requestId, route: 'import', userId: auth.user.id, upstreamStatus: response.status },
        new Error(`AI provider returned status ${response.status}`),
      );
      return sendApiError(res, 502, "AI service request failed", requestId);
    }

    const data = await response.json();

    // For import calls, attempt to repair truncated JSON before returning
    if (isImport && data.content) {
      const rawText = data.content.map(b => b.text || "").join("").trim();
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      // Try to parse as-is first
      try {
        JSON.parse(cleaned);
        // Valid — replace content with cleaned text
        data.content = [{ type: "text", text: cleaned }];
        return res.status(200).json(data);
      } catch(e) {
        // JSON is broken — attempt repair by truncating to last complete record
        try {
          const repaired = repairJSON(cleaned);
          data.content = [{ type: "text", text: repaired }];
          return res.status(200).json(data);
        } catch(e2) {
          // Give up and return original — client will show the error
          return res.status(200).json(data);
        }
      }
    }

    if (isChat && facilityId) {
      const replyText = data.content?.map(b => b.text || '').join('') || '';
      const { conversationId: savedConversationId } = await persistExchange(auth.supabase, {
        facilityId, userId: auth.user.id, module: chatModule, conversationId, userText: prompt, assistantText: replyText,
      });
      data.conversationId = savedConversationId;
    }

    return res.status(200).json(data);
  } catch (err) {
    logApiError({ requestId, route: 'import', userId: auth.user.id }, err);
    return sendApiError(res, 500, "Internal server error", requestId);
  }
}

/**
 * Attempts to repair truncated JSON by finding the last complete record
 * and closing out the records array and wrapper object.
 */
function repairJSON(text) {
  // Find the last complete record — look for last "}," or "}" before truncation
  const recordsMatch = text.match(/"records"\s*:\s*\[/);
  if (!recordsMatch) throw new Error("No records array found");

  const recordsStart = recordsMatch.index + recordsMatch[0].length;
  const prefix = text.slice(0, recordsStart);
  const recordsBody = text.slice(recordsStart);

  // Find the last complete object — last occurrence of "}," or "}" followed by whitespace/end
  const lastCompleteRecord = recordsBody.lastIndexOf("},");
  const lastSingleRecord = recordsBody.lastIndexOf("}");

  let cutAt = -1;
  if (lastCompleteRecord !== -1) {
    cutAt = lastCompleteRecord + 1; // include the }
  } else if (lastSingleRecord !== -1) {
    cutAt = lastSingleRecord + 1;
  }

  if (cutAt === -1) throw new Error("Cannot find complete record");

  const repairedRecords = recordsBody.slice(0, cutAt).replace(/,\s*$/, "");
  const repaired = prefix + repairedRecords + "]}";

  // Validate the repair worked
  JSON.parse(repaired);
  return repaired;
}

