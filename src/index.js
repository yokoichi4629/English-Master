// English Master — サーバー側(Cloudflare Workers)
// /api/transcribe : 録音した英語を文字に起こす(AI発音チェック・会話の音声入力)
// /api/chat       : 場面別のAI英会話
// /api/tts        : 英文を音声(MP3)にする(iPhoneの消音モードでも鳴るように)。一度作った音声はKVに保存して再利用
// それ以外は public/ の静的ファイルをそのまま返す

const STT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const CHAT_MODEL = '@cf/google/gemma-4-26b-a4b-it';
const TTS_MODEL = '@cf/deepgram/aura-1';
const TTS_VOICE = 'asteria';
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_TURNS = 24;
const MAX_TEXT = 300;

export const SCENARIOS = {
  hotel: {
    role: 'a friendly front desk clerk at a hotel in New York',
    setting: 'The learner is a guest arriving to check in. They have a reservation for three nights.',
  },
  restaurant: {
    role: 'a friendly waiter at a casual American restaurant',
    setting: 'The learner has just been seated and wants to order food and a drink.',
  },
  airport: {
    role: 'an immigration officer at a U.S. airport',
    setting: 'The learner is a tourist from Japan going through passport control. Ask typical questions (purpose of visit, length of stay, where they are staying).',
  },
  shopping: {
    role: 'a helpful shop assistant at a clothing store',
    setting: 'The learner is looking for a jacket and may ask about size, color, price, and trying it on.',
  },
  directions: {
    role: 'a friendly local person on the street in London',
    setting: 'The learner is a tourist who wants to ask how to get to the nearest station or a museum.',
  },
  smalltalk: {
    role: 'a friendly new acquaintance at an international party',
    setting: 'Make small talk: introductions, where they are from, work, hobbies, and weekend plans.',
  },
};

const LEVEL_GUIDE = {
  1: 'The learner is a BEGINNER (CEFR A1-A2). Use very short, simple sentences (max 10 words each) and only common everyday words.',
  2: 'The learner is ELEMENTARY (CEFR A2-B1). Use short, clear sentences and common phrases.',
  3: 'The learner is INTERMEDIATE (CEFR B1). Speak naturally but clearly; common idioms are OK.',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

function sameOrigin(req, url) {
  const origin = req.headers.get('Origin');
  if (origin) { try { return new URL(origin).host === url.host; } catch { return false; } }
  return req.headers.get('Sec-Fetch-Site') === 'same-origin';
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function transcribe(req, env) {
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_AUDIO_BYTES) return json({ error: 'too_large' }, 413);
  if (buf.byteLength < 500) return json({ error: 'too_short' }, 400);
  const res = await env.AI.run(STT_MODEL, { audio: toBase64(buf), language: 'en', condition_on_previous_text: false });
  const text = String(res?.text ?? res?.result?.text ?? '').replace(/\s+/g, ' ').trim();
  return json({ text });
}

async function toArrayBuffer(res) {
  if (!res) return null;
  if (res instanceof ArrayBuffer) return res;
  if (ArrayBuffer.isView(res)) return res.buffer.slice(res.byteOffset, res.byteOffset + res.byteLength);
  if (res instanceof ReadableStream || res instanceof Response) return new Response(res.body ?? res).arrayBuffer();
  const b64 = typeof res.audio === 'string' ? res.audio.replace(/^data:[^,]+,/, '') : null;
  if (b64) { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out.buffer; }
  return null;
}

const audioResponse = (buf) => new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });

export async function tts(req, env, ctx) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_TEXT) return json({ error: 'bad_text' }, 400);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  const key = `tts:v1:${TTS_VOICE}:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  if (env.TTS_CACHE) {
    const hit = await env.TTS_CACHE.get(key, 'arrayBuffer');
    if (hit) return audioResponse(hit);
  }
  const buf = await toArrayBuffer(await env.AI.run(TTS_MODEL, { text, speaker: TTS_VOICE, encoding: 'mp3' }));
  if (!buf || buf.byteLength < 100) return json({ error: 'empty' }, 502);
  if (env.TTS_CACHE) ctx?.waitUntil?.(env.TTS_CACHE.put(key, buf).catch(() => {}));
  return audioResponse(buf);
}

export function buildSystemPrompt(scenarioId, level) {
  const sc = SCENARIOS[scenarioId];
  return [
    `You are ${sc.role}. This is an English role-play with a Japanese learner. ${sc.setting}`,
    LEVEL_GUIDE[level] || LEVEL_GUIDE[1],
    'Rules:',
    '- Stay in character. Reply in 1-2 short sentences and usually end with a simple question to keep the conversation going.',
    "- If the learner's latest message has a grammar mistake or sounds unnatural, put a corrected natural version in \"correction\" and a short explanation in Japanese in \"correction_ja\". If it is fine (or there is no learner message yet), use empty strings.",
    '- "suggestions": exactly 2 short, natural replies the learner could say next, each with a Japanese translation.',
    'Output ONLY one JSON object, no markdown, in this shape:',
    '{"reply":"...","reply_ja":"...","correction":"","correction_ja":"","suggestions":[{"en":"...","ja":"..."},{"en":"...","ja":"..."}]}',
  ].join('\n');
}

function extractText(res) {
  if (typeof res === 'string') return res;
  if (res?.response !== undefined) return typeof res.response === 'string' ? res.response : JSON.stringify(res.response);
  const c = res?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => p?.text || '').join('');
  return '';
}

export function parseReply(raw) {
  const text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try {
      const o = JSON.parse(text.slice(s, e + 1));
      const str = (v) => (typeof v === 'string' ? v.trim() : '');
      return {
        reply: str(o.reply),
        reply_ja: str(o.reply_ja),
        correction: str(o.correction),
        correction_ja: str(o.correction_ja),
        suggestions: (Array.isArray(o.suggestions) ? o.suggestions : [])
          .filter((x) => x && typeof x.en === 'string').slice(0, 3)
          .map((x) => ({ en: x.en.trim(), ja: str(x.ja) })),
      };
    } catch { /* fall through */ }
  }
  return { reply: text.replace(/[{}"]/g, '').slice(0, 400), reply_ja: '', correction: '', correction_ja: '', suggestions: [] };
}

export async function chat(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const scenario = String(body?.scenario || '');
  if (!SCENARIOS[scenario]) return json({ error: 'bad_scenario' }, 400);
  const level = [1, 2, 3].includes(body?.level) ? body.level : 1;
  const history = Array.isArray(body?.messages) ? body.messages : [];
  if (history.length > MAX_TURNS) return json({ error: 'too_long' }, 400);
  const messages = [];
  for (const m of history.slice(-12)) {
    if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return json({ error: 'bad_message' }, 400);
    messages.push({ role: m.role, content: m.content.slice(0, MAX_TEXT) });
  }
  if (!messages.length || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: '(The learner has just arrived. Please greet them and start the conversation in character.)' });
  }
  const res = await env.AI.run(CHAT_MODEL, {
    messages: [{ role: 'system', content: buildSystemPrompt(scenario, level) }, ...messages],
    max_tokens: 500,
    temperature: 0.6,
  });
  const out = parseReply(extractText(res));
  if (!out.reply) return json({ error: 'empty' }, 502);
  return json(out);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    if (!sameOrigin(req, url)) return json({ error: 'forbidden' }, 403);
    try {
      if (url.pathname === '/api/transcribe') return await transcribe(req, env);
      if (url.pathname === '/api/chat') return await chat(req, env);
      if (url.pathname === '/api/tts') return await tts(req, env, ctx);
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      const msg = String(e?.message || e);
      const limited = /429|3036|4006|capacity|limit|neurons/i.test(msg);
      return json({ error: limited ? 'limit' : 'ai_error', detail: msg.slice(0, 200) }, limited ? 429 : 502);
    }
  },
};
