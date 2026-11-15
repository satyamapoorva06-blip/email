// Real LLM integration (OpenAI-compatible Chat Completions API).
// Used only when OPENAI_API_KEY is set in the environment; otherwise the app
// transparently falls back to the rule-based engine in ./fallback.js.
// Any failure (network, bad JSON, quota) returns null so callers can fall back.

const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export function llmAvailable() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function llmChat(messages, { json = false, temperature = 0.2, timeoutMs = 15000 } = {}) {
  if (!llmAvailable()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[llm] request failed with ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn('[llm] unavailable, falling back:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Parse a JSON object out of an LLM response, tolerating code fences.
export function parseJsonObject(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* try to salvage */ }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}
