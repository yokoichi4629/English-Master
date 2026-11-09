'use strict';
/* English Master
   第1段階: ホーム / カテゴリー / フレーズ / 音声再生 / 意味当てクイズ
   第2段階: 発音録音 / マイリスト / 翌日・3日後・7日後の復習 / 学習履歴
   第3段階: AI発音チェック / AI英会話 / レベルの自動調整 / オフライン学習 */

const $app = document.getElementById('app');
const CATS = window.CONTENT.categories;
const CAT = {};
const ITEMS = {};
for (const c of CATS) {
  CAT[c.id] = c;
  for (const t of c.topics) {
    t.items = t.items.map(([en, ja, note], i) => {
      const it = { id: `${c.id}.${t.id}.${i}`, en, ja, note: note || '', cat: c.id, topic: t.id, idx: i };
      ITEMS[it.id] = it;
      return it;
    });
  }
}
const ALL = Object.values(ITEMS);
const topicOf = (it) => CAT[it.cat].topics.find((t) => t.id === it.topic);

const h = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V9a3 3 0 0 1 3-3h11M15 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H6M9 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/></svg>',
  me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="currentColor"/><path d="M4 21a8 8 0 0 1 16 0" fill="currentColor"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7-7-1z" fill="currentColor"/></svg>',
};

/* ---------- 日付 ---------- */
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return dayKey(d); };
const WD = '日月火水木金土';
const fmtDay = (k) => { const d = fromKey(k); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };

/* ---------- 学習記録(端末内に保存) ---------- */
const KEY = 'english-master.v1';
const S = { days: {}, items: {}, fav: {}, rate: 0.85, goal: 20, hideJa: false, hideEn: false };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 保存できない環境でも動かす */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* noop */ } };

// 復習の間隔: まちがえた → 翌日 → 3日後 → 7日後 → 卒業
const INTERVALS = { 1: 1, 2: 3, 3: 7 };
if (!S.v) { // 第1段階のデータを復習スケジュールに移す
  for (const r of Object.values(S.items)) if (r.w > 0 && r.s < 2) { r.st = 1; r.due = dayKey(); }
  S.v = 2; save();
}

/* ---------- レベルの自動調整 ---------- */
const LEVELS = { 1: '初級', 2: '初中級', 3: '中級' };
S.level ||= 1;
S.recent ||= [];
const WORD_DIFF = { basic: 1, travel: 1, life: 2, pos: 2, idioms: 3 };
function diff(it) {
  if (it.cat === 'words') return WORD_DIFF[it.topic] || 2;
  const wc = it.en.split(/\s+/).length;
  return wc <= 3 ? 1 : wc <= 6 ? 2 : 3;
}
// 直近20問の正解率で判定: 85%以上でレベルアップ、55%未満でレベルダウン
function updateLevel(ok) {
  S.recent.push(ok ? 1 : 0);
  if (S.recent.length > 20) S.recent.shift();
  if (S.recent.length < 20) return 0;
  const acc = S.recent.reduce((a, b) => a + b, 0) / 20;
  if (acc >= 0.85 && S.level < 3) { S.level++; S.recent = []; return 1; }
  if (acc < 0.55 && S.level > 1) { S.level--; S.recent = []; return -1; }
  return 0;
}
const stars = (lv) => '★'.repeat(lv) + '☆'.repeat(3 - lv);

const today = () => dayKey();
const dayRec = () => (S.days[today()] ||= { a: 0, c: 0, ms: 0, rec: 0 });
function addTime(ms) { const d = dayRec(); d.ms = (d.ms || 0) + ms; }
function record(id, ok) {
  const d = dayRec();
  d.a++; if (ok) d.c++;
  const now = Date.now();
  addTime(S.lastAns && now - S.lastAns < 90000 ? now - S.lastAns : 15000);
  S.lastAns = now;
  const r = (S.items[id] ||= { c: 0, w: 0, s: 0 });
  if (ok) { r.c++; r.s++; } else { r.w++; r.s = 0; }
  r.t = now;
  if (!ok) { r.st = 1; r.due = addDays(today(), INTERVALS[1]); }
  else if (r.st && r.due <= today()) {
    r.st++;
    if (r.st > 3) { r.st = 0; r.due = null; }
    else r.due = addDays(today(), INTERVALS[r.st]);
  }
  const lv = updateLevel(ok);
  save();
  return lv;
}
const isInReview = (id) => (S.items[id]?.st || 0) > 0;
const isDue = (id) => isInReview(id) && S.items[id].due <= today();
const isLearned = (id) => (S.items[id]?.s || 0) >= 2 && !isInReview(id);
const todayCount = () => S.days[today()]?.a || 0;
const minutes = (ms) => Math.round((ms || 0) / 60000);
function streak() {
  let n = 0; const d = new Date();
  const active = (k) => S.days[k]?.a || S.days[k]?.rec || S.days[k]?.chat;
  if (!active(dayKey(d))) d.setDate(d.getDate() - 1);
  while (active(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const myList = () => Object.keys(S.fav).map((id) => ITEMS[id]).filter(Boolean);

/* ---------- 音声(端末の読み上げ機能) ---------- */
const canSpeak = 'speechSynthesis' in window;
let voice = null;
function pickVoice() {
  const all = speechSynthesis.getVoices();
  const us = all.filter((v) => /^en[-_]US/i.test(v.lang));
  voice = us.find((v) => /Samantha|Google US English|Aaron|Nicky|Ava|Allison/i.test(v.name))
    || us[0] || all.find((v) => /^en/i.test(v.lang)) || null;
}
if (canSpeak) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

/* ---------- 音声(AI音声) ----------
   iPhoneはブラウザの読み上げが消音モードで鳴らない・止めた直後に鳴らないことがあるため、
   AIで作った英語音声(MP3)を <audio> で再生する。作った音声は端末にも保存し、2回目からは通信なしで再生。 */
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
S.voice ||= 'auto'; // auto | ai | device
const useAiVoice = () => S.voice === 'ai' || (S.voice === 'auto' && IS_IOS);
const player = new Audio();
player.preload = 'auto';
player.setAttribute('playsinline', '');
let audioUnlocked = false;
function silentWavUrl() {
  const n = 1600, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
// iPhoneは最初のタップで一度鳴らした <audio> だけ、あとから自由に再生できる
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  try {
    player.src = silentWavUrl();
    player.play().catch(() => { audioUnlocked = false; });
    if (canSpeak) speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(' '), { volume: 0 }));
  } catch { audioUnlocked = false; }
}
document.addEventListener('click', unlockAudio, true);
document.addEventListener('touchend', unlockAudio, true);

const TTS_CACHE = 'em-tts-v1';
const TTS_MEM = {};
const TTS_PENDING = {};
function ttsUrl(text) {
  if (TTS_MEM[text]) return Promise.resolve(TTS_MEM[text]);
  if (TTS_PENDING[text]) return TTS_PENDING[text];
  const key = `/__tts/${encodeURIComponent(text)}`;
  const p = (async () => {
    let cache = null;
    try { cache = await caches.open(TTS_CACHE); } catch { /* 保存できない環境 */ }
    let blob = null;
    const hit = cache && await cache.match(key);
    if (hit) blob = await hit.blob();
    else {
      if (!online()) throw new Error('offline');
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!r.ok) throw new Error(`tts_${r.status}`);
      blob = await r.blob();
      if (blob.size < 100) throw new Error('tts_empty');
      cache?.put(key, new Response(blob, { headers: { 'content-type': 'audio/mpeg' } })).catch(() => {});
    }
    TTS_MEM[text] = URL.createObjectURL(blob);
    return TTS_MEM[text];
  })().finally(() => { delete TTS_PENDING[text]; });
  TTS_PENDING[text] = p;
  return p;
}
// 表示中のフレーズの音声を先に用意しておく(タップしてすぐ鳴るように)
let prefetchQueue = [];
let prefetching = false;
function prefetchVoice(texts) {
  if (!useAiVoice() || !online()) return;
  prefetchQueue = [...new Set([...texts, ...prefetchQueue])].filter((t) => !TTS_MEM[t]).slice(0, 12);
  if (prefetching) return;
  prefetching = true;
  (async () => {
    while (prefetchQueue.length) { const t = prefetchQueue.shift(); try { await ttsUrl(t); } catch { break; } }
    prefetching = false;
  })();
}
const aiRate = () => ({ 0.6: 0.75, 0.85: 0.9, 1: 1 }[S.rate] || 1);

let speakToken = 0;
let lastCancel = 0;
function stopSpeaking() {
  speakToken++;
  if (canSpeak && (speechSynthesis.speaking || speechSynthesis.pending)) { speechSynthesis.cancel(); lastCancel = Date.now(); }
  player.onended = null;
  try { player.pause(); } catch { /* noop */ }
}
function playUrl(url, tok, times, onDone, rate = 1) {
  let n = 0;
  player.onended = () => {
    if (tok !== speakToken) return;
    if (++n < times) setTimeout(() => { if (tok === speakToken) { player.currentTime = 0; player.play().catch(() => {}); } }, 700);
    else { player.onended = null; onDone?.(); }
  };
  player.src = url;
  player.defaultPlaybackRate = rate; player.playbackRate = rate;
  player.preservesPitch = true; player.webkitPreservesPitch = true;
  return player.play();
}
function speakDevice(text, times, onDone, tok) {
  if (!canSpeak) { toast('この端末では音声を再生できません'); return; }
  let n = 0;
  const once = () => {
    if (tok !== speakToken) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; if (voice) u.voice = voice; u.rate = S.rate;
    u.onend = () => {
      if (tok !== speakToken) return;
      if (++n < times) setTimeout(once, 700); else onDone?.();
    };
    speechSynthesis.speak(u);
  };
  // 読み上げを止めた直後に始めると鳴らないことがあるので、少し間を空ける
  const wait = 120 - (Date.now() - lastCancel);
  if (wait > 0) setTimeout(once, wait); else once();
}
function speak(text, times = 1, onDone) {
  stopSpeaking();
  const tok = speakToken;
  if (!useAiVoice()) { speakDevice(text, times, onDone, tok); return; }
  ttsUrl(text)
    .then((url) => { if (tok === speakToken) return playUrl(url, tok, times, onDone, aiRate()); return null; })
    .catch(() => { if (tok === speakToken) speakDevice(text, times, onDone, tok); });
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- 録音(端末内で再生。AIチェック時だけ文字起こしに送信) ---------- */
const Rec = { stream: null, mr: null, chunks: [], urls: {}, blobs: {}, cur: null, timer: null, cancel: false, busy: false, started: 0, onChange: null, onDone: null };
const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const isRecording = (id) => Rec.cur === id && Rec.mr?.state === 'recording';
function releaseMic() { Rec.stream?.getTracks().forEach((t) => t.stop()); Rec.stream = null; }
function stopRec(cancel = false) {
  clearTimeout(Rec.timer);
  Rec.cancel = cancel;
  if (Rec.mr && Rec.mr.state === 'recording') Rec.mr.stop(); else if (cancel) { releaseMic(); Rec.cur = null; }
}
async function toggleRec(id, onChange, onDone, maxMs = 8000) {
  if (isRecording(id)) { stopRec(); return; }
  if (Rec.busy) return;
  if (!canRecord()) { toast('この端末・ブラウザでは録音できません'); return; }
  stopSpeaking();
  if (Rec.mr?.state === 'recording') stopRec(true);
  Rec.busy = true;
  try {
    Rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    Rec.busy = false;
    toast('マイクの使用を許可してください');
    return;
  }
  Rec.busy = false;
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
  const mr = new MediaRecorder(Rec.stream, type ? { mimeType: type } : undefined);
  Object.assign(Rec, { mr, chunks: [], cur: id, cancel: false, onChange, onDone, started: Date.now() });
  mr.ondataavailable = (e) => { if (e.data.size) Rec.chunks.push(e.data); };
  mr.onstop = () => {
    releaseMic();
    const rid = Rec.cur; Rec.cur = null;
    if (Rec.cancel) return;
    const blob = new Blob(Rec.chunks, { type: mr.mimeType || type || 'audio/webm' });
    if (Rec.urls[rid]) URL.revokeObjectURL(Rec.urls[rid]);
    Rec.urls[rid] = URL.createObjectURL(blob);
    Rec.blobs[rid] = blob;
    if (ITEMS[rid]) {
      dayRec().rec = (dayRec().rec || 0) + 1;
      addTime(Math.min(Date.now() - Rec.started + 5000, 20000));
      save();
    }
    Rec.onChange?.();
    if (ITEMS[rid]) compare(ITEMS[rid]);
    Rec.onDone?.(rid);
  };
  mr.start();
  onChange?.();
  Rec.timer = setTimeout(() => stopRec(), maxMs);
}
function playOwn(it) {
  const url = Rec.urls[it.id];
  if (!url) { toast('まず録音してください'); return; }
  stopSpeaking();
  playUrl(url, speakToken, 1, null, 1).catch(() => toast('再生できませんでした'));
}
function compare(it) {
  if (!it || !Rec.urls[it.id]) return;
  speak(it.en, 1, () => setTimeout(() => playOwn(it), 350));
}

// 録音を 16kHz・モノラルのWAVに変換(AIが確実に読める形式にして、送るデータも小さくする)
async function toWav(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AC || !OAC) throw new Error('no audio context');
  const ac = new AC();
  let audio;
  try { audio = await ac.decodeAudioData(await blob.arrayBuffer()); } finally { ac.close?.(); }
  const rate = 16000;
  const off = new OAC(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
  const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
  const data = (await off.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + data.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) { const s = Math.max(-1, Math.min(1, data[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------- AIとの通信 ---------- */
const online = () => navigator.onLine !== false;
class ApiError extends Error { constructor(code) { super(code); this.code = code; } }
async function api(path, body, type) {
  if (!online()) throw new ApiError('offline');
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'Content-Type': type || 'application/json' }, body: type ? body : JSON.stringify(body) });
  } catch { throw new ApiError('network'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(j.error || `http_${r.status}`);
  return j;
}
function apiMessage(e) {
  const c = e?.code || '';
  if (c === 'offline' || c === 'network') return 'インターネットに接続されていないため、AI機能は使えません。';
  if (c === 'limit') return 'AIが混み合っているか、今日の無料枠を使い切りました。時間をおいて試してください。';
  if (c === 'too_short') return '録音が短すぎました。もう一度、はっきり話してみてください。';
  if (c === 'http_404' || c === 'not_found') return 'AI機能がまだ公開されていません。少し待ってから開き直してください。';
  return 'AIの処理でエラーが起きました。もう一度試してください。';
}
async function transcribeBlob(blob) {
  let body = blob;
  try { body = await toWav(blob); } catch { /* 変換できない端末は元の形式のまま送る */ }
  const j = await api('/api/transcribe', body, body.type || 'application/octet-stream');
  return j.text || '';
}

/* ---------- AI発音チェック(採点) ---------- */
const NUMS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const CONTRACTIONS = {
  "i'm": 'i am', "i'll": 'i will', "i'd": 'i would', "i've": 'i have', "it's": 'it is', "that's": 'that is', "what's": 'what is',
  "how's": 'how is', "there's": 'there is', "let's": 'let us', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', cannot: 'can not', "won't": 'will not',
  "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "he's": 'he is', "she's": 'she is', "you'll": 'you will',
};
function normWords(s) {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/-/g, ' ').replace(/[^a-z0-9' ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .flatMap((w) => { w = w.replace(/^'+|'+$/g, ''); if (/^\d+$/.test(w) && NUMS[+w]) return [NUMS[+w]]; return (CONTRACTIONS[w] || w).split(' '); })
    .filter(Boolean);
}
function scorePron(target, heard) {
  const display = target.split(/\s+/);
  const tTok = []; const owner = [];
  display.forEach((w, i) => normWords(w).forEach((t) => { tTok.push(t); owner.push(i); }));
  const hTok = normWords(heard);
  const n = tTok.length, m = hTok.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = tTok[i] === hTok[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Array(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m;) {
    if (tTok[i] === hTok[j]) { hit[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const matched = hit.filter(Boolean).length;
  const score = n + m ? Math.round((200 * matched) / (n + m)) : 0;
  const okWord = display.map((_, i) => owner.every((o, k) => o !== i || hit[k]));
  return { score, heard, words: display.map((w, i) => ({ w, ok: okWord[i] })) };
}
const scoreMsg = (s) => (s >= 90 ? 'すばらしい！しっかり伝わる発音です'
  : s >= 70 ? 'よく伝わります。赤い単語をもう一度練習しよう'
    : s >= 40 ? '少しずつ近づいています。ゆっくり、はっきり言ってみよう'
      : 'うまく聞き取れませんでした。お手本をよく聞いてもう一度');

const AI_PRON = {};
async function assessPron(id) {
  const it = ITEMS[id];
  if (!it || !Rec.blobs[id]) return;
  AI_PRON[id] = { loading: true };
  refreshPractice(id);
  try {
    const heard = await transcribeBlob(Rec.blobs[id]);
    const res = scorePron(it.en, heard);
    AI_PRON[id] = res;
    const r = (S.items[id] ||= { c: 0, w: 0, s: 0 });
    r.ps = Math.max(r.ps || 0, res.score);
    const d = dayRec(); d.pn = (d.pn || 0) + 1; d.psum = (d.psum || 0) + res.score;
    if (res.score < 50 && !S.fav[id]) S.fav[id] = 1;
    save();
  } catch (e) {
    AI_PRON[id] = { err: apiMessage(e) };
  }
  refreshPractice(id);
}
function refreshPractice(id) {
  if (location.hash.startsWith('#/p/') && curPracticeItem()?.id === id) renderPractice();
}

/* ---------- 共通パーツ ---------- */
const RATES = [[0.6, 'ゆっくり'], [0.85, 'ふつう'], [1, 'ナチュラル']];
const speedChips = () => `<div class="chips" role="group" aria-label="再生速度">${RATES.map(([r, l]) =>
  `<button class="chip ${S.rate === r ? 'on' : ''}" data-act="rate" data-rate="${r}">${l}</button>`).join('')}</div>`;
const topBar = (title, back) => `<header class="topbar">${back ? `<a class="back" href="${back}" aria-label="もどる">‹</a>` : '<span></span>'}<h1>${h(title)}</h1><span></span></header>`;
const practiceHref = (it) => `#/p/${it.cat}/${it.topic}/${it.idx}`;
const favBtn = (it) => { const on = !!S.fav[it.id]; return `<button class="icon-btn fav ${on ? 'on' : ''}" data-act="fav" aria-label="マイリスト">${on ? '★' : '☆'}</button>`; };

function phraseCard(it) {
  return `<li class="phrase" data-id="${it.id}">
    <div class="p-text" data-act="text">
      <p class="en">${h(it.en)}</p>
      <p class="ja">${h(it.ja)}${it.note ? ` <span class="tag">${h(it.note)}</span>` : ''}</p>
    </div>
    <div class="p-btns">
      <button class="icon-btn" data-act="play" aria-label="再生">${ICON.play}</button>
      <button class="icon-btn" data-act="repeat" aria-label="3回くり返して再生">${ICON.repeat}</button>
      <a class="icon-btn" href="${practiceHref(it)}" aria-label="発音練習">${ICON.mic}</a>
      ${favBtn(it)}
    </div>
  </li>`;
}

/* ---------- ホーム ---------- */
function greeting() {
  const hr = new Date().getHours();
  return hr < 5 ? 'こんばんは' : hr < 11 ? 'おはようございます' : hr < 18 ? 'こんにちは' : 'こんばんは';
}
function renderHome() {
  const done = todayCount(), goal = S.goal;
  const due = ALL.filter((i) => isDue(i.id)).length;
  const tomorrow = ALL.filter((i) => isInReview(i.id) && S.items[i.id].due === addDays(today(), 1)).length;
  const mine = myList().length;
  const min = minutes(S.days[today()]?.ms);
  $app.innerHTML = `
  <header class="hero">
    <p class="eyebrow">${greeting()}</p>
    <h1>English Master</h1>
    <p class="sub">聞いて、わかって、話せる英語へ。</p>
  </header>
  <section class="card today">
    <div class="today-head">
      <div><p class="label">今日の目標</p><p class="big">${done}<span> / ${goal}問</span></p></div>
      <div class="streak-col"><div class="streak"><span aria-hidden="true">🔥</span>${streak()}日連続</div><p class="mins">今日 ${min}分</p></div>
    </div>
    <div class="bar"><i style="width:${Math.min(100, pct(done, goal))}%"></i></div>
    <a class="level-row" href="#/r"><span class="lv-badge">${stars(S.level)} ${LEVELS[S.level]}</span><small>正解率に合わせて問題のレベルを自動で調整します</small></a>
    <a class="btn primary block" href="#/q/today">${done >= goal ? '目標達成！さらに10問' : '今日の10問をはじめる'}</a>
  </section>
  ${due ? `<a class="card review" href="#/q/review">
    <span class="review-ico" aria-hidden="true">↻</span>
    <div><p class="label">今日の復習</p><p><b>${due}</b>問 復習のタイミングです</p></div>
    <span class="chev" aria-hidden="true">›</span></a>`
    : tomorrow ? `<div class="card review calm"><span class="review-ico" aria-hidden="true">✓</span>
    <div><p class="label">今日の復習</p><p>今日の分は完了。明日 <b>${tomorrow}</b>問 の復習があります</p></div></div>` : ''}
  <div class="quick three">
    <a class="card quick-item" href="#/ai"><span class="q-ico" aria-hidden="true">🤖</span><b>AI英会話</b><small>場面で話す</small></a>
    <a class="card quick-item" href="#/p"><span class="q-ico" aria-hidden="true">🎙</span><b>発音練習</b><small>AIがチェック</small></a>
    <a class="card quick-item" href="${mine ? '#/q/fav' : '#/m'}"><span class="q-ico star" aria-hidden="true">★</span><b>マイリスト</b><small>${mine ? `${mine}件` : '☆で追加'}</small></a>
  </div>
  <h2 class="section">学習カテゴリー</h2>
  <div class="cats">${CATS.map((c) => {
    const items = c.topics.flatMap((t) => t.items);
    const l = items.filter((i) => isLearned(i.id)).length;
    return `<a class="cat" href="#/c/${c.id}" style="--tint:${c.color}">
      <span class="cat-ico" aria-hidden="true">${c.icon}</span>
      <b>${h(c.title)}</b>
      <small>${c.topics.length}シーン・${items.length}${c.unit}</small>
      <span class="mini-bar"><i style="width:${pct(l, items.length)}%"></i></span>
    </a>`;
  }).join('')}</div>`;
}

/* ---------- カテゴリー / シーン ---------- */
function renderCategory(c) {
  $app.innerHTML = topBar(c.title, '#/') + `
  <p class="lead">${h(c.desc)}</p>
  <div class="row-btns"><a class="btn primary block" href="#/q/${c.id}">ランダム10問</a></div>
  <ul class="topics">${c.topics.map((t) => {
    const l = t.items.filter((i) => isLearned(i.id)).length;
    return `<li><a href="#/t/${c.id}/${t.id}" style="--tint:${c.color}">
      <span class="t-ico" aria-hidden="true">${t.icon}</span>
      <span class="t-body"><b>${h(t.title)}</b><small>${t.items.length}${c.unit}・覚えた ${l}</small>
        <span class="mini-bar"><i style="width:${pct(l, t.items.length)}%"></i></span></span>
      <span class="chev" aria-hidden="true">›</span></a></li>`;
  }).join('')}</ul>`;
}

const listHint = () => (S.hideJa ? '英文をタップすると意味が表示されます。' : '英文をタップすると音声が流れます。☆でマイリストに追加。');
function renderTopic(c, t) {
  $app.innerHTML = topBar(t.title, `#/c/${c.id}`) + `
  <div class="toolbar">
    ${speedChips()}
    <label class="switch"><input type="checkbox" data-act="hideja" ${S.hideJa ? 'checked' : ''}><span>日本語を隠す</span></label>
  </div>
  <p class="hint">${listHint()}</p>
  <ul class="phrases ${S.hideJa ? 'hide-ja' : ''}">${t.items.map(phraseCard).join('')}</ul>
  <div class="sticky-cta two">
    <a class="btn ghost" href="#/p/${c.id}/${t.id}/0">${ICON.mic}発音練習</a>
    <a class="btn primary" href="#/q/${c.id}/${t.id}">意味当てクイズ</a>
  </div>`;
  prefetchVoice(t.items.map((x) => x.en));
}

/* ---------- マイリスト ---------- */
function renderMyList() {
  const list = myList();
  $app.innerHTML = topBar('マイリスト', '#/') + `
  <p class="lead">自分で選んだ復習リストです。☆をタップすると追加できます。AI発音チェックで50点未満だったフレーズも自動で入ります。</p>
  ${list.length ? `<div class="row-btns"><a class="btn primary block" href="#/q/fav">マイリストでクイズ(${list.length}件)</a></div>
  <ul class="phrases">${list.map(phraseCard).join('')}</ul>`
    : '<section class="empty"><p class="big-ico" aria-hidden="true">☆</p><p>まだ登録がありません。</p><a class="btn primary" href="#/c/words">単語帳を開く</a></section>'}`;
}

/* ---------- クイズ ---------- */
let Q = null;
function startQuiz(pool, title, back, preset) {
  if (!pool.length) {
    $app.innerHTML = topBar(title, back) + `<section class="empty"><p class="big-ico" aria-hidden="true">🎉</p><p>今は出題できる問題がありません。</p><a class="btn primary" href="${back}">もどる</a></section>`;
    Q = null;
    return;
  }
  const picks = preset || shuffle(pool).slice(0, 10);
  Q = { title, back, pool, queue: picks.map((it) => ({ it, retry: false })), i: 0, first: picks.length, correct: 0, wrong: [], answered: null, picked: null, showEn: false };
  renderQuestion();
}

function choicesFor(it) {
  const want = S.level === 1 ? 3 : 4; // 初級は3択、それ以上は4択
  const cat = CAT[it.cat];
  const tiers = [topicOf(it).items, cat.topics.flatMap((t) => t.items), ALL];
  const out = [it.ja];
  for (const tier of tiers) {
    for (const x of shuffle(tier)) { if (out.length >= want) break; if (!out.includes(x.ja)) out.push(x.ja); }
    if (out.length >= want) break;
  }
  return shuffle(out);
}

function renderQuestion() {
  const q = Q.queue[Q.i];
  if (!q) { renderResult(); return; }
  q.choices ||= choicesFor(q.it);
  const total = Q.queue.length;
  const shown = Q.showEn || Q.answered;
  $app.innerHTML = topBar(Q.title, Q.back) + `
  <div class="qprog"><div class="bar"><i style="width:${pct(Q.i, total)}%"></i></div><span>${Q.i + 1} / ${total}</span></div>
  <section class="qcard">
    ${q.retry ? '<p class="retry-tag">もう一度チャレンジ</p>' : ''}
    <p class="q-label">英語を聞いて、意味を選ぼう</p>
    <button class="listen" data-act="qplay" aria-label="英語を聞く">${ICON.play}<span>聞く</span></button>
    ${speedChips()}
    <button class="q-en ${shown ? '' : 'masked'}" data-act="showen" ${shown ? 'disabled' : ''}>${shown ? h(q.it.en) : '英文を見る(ヒント)'}</button>
  </section>
  <div class="choices">${q.choices.map((ch, i) => {
    let cls = '';
    if (Q.answered) { if (ch === q.it.ja) cls = 'correct'; else if (i === Q.picked) cls = 'wrong'; }
    return `<button class="choice ${cls}" data-act="pick" data-i="${i}" ${Q.answered ? 'disabled' : ''}>${h(ch)}</button>`;
  }).join('')}</div>
  ${Q.answered ? feedback(q) : ''}`;
  if (!Q.answered && !q.played) { q.played = true; speak(q.it.en); }
  prefetchVoice(Q.queue.slice(Q.i + 1, Q.i + 4).map((x) => x.it.en));
}

function feedback(q) {
  const ok = Q.answered === 'ok';
  const last = Q.i === Q.queue.length - 1;
  const it = q.it;
  const rec = isRecording(it.id), has = !!Rec.urls[it.id];
  return `<section class="feedback ${ok ? 'ok' : 'ng'}" data-id="${it.id}">
    <div class="fb-head"><p class="verdict">${ok ? '⭕ 正解！' : '❌ おしい！'}</p>${favBtn(it)}</div>
    <p class="en">${h(it.en)}</p>
    <p class="ja">${h(it.ja)}${it.note ? ` <span class="tag">${h(it.note)}</span>` : ''}</p>
    ${!ok ? '<p class="note">このあともう一度出題し、明日の復習にも入ります。</p>' : ''}
    <div class="say-box">
      <p class="say">🗣 お手本をまねして、声に出して言ってみよう</p>
      <div class="say-btns">
        <button class="btn rec ${rec ? 'on' : ''}" data-act="qrec">${rec ? `${ICON.stop}停止` : `${ICON.mic}${has ? '録り直す' : '録音する'}`}</button>
        <button class="btn ghost" data-act="cmp" ${has ? '' : 'disabled'}>${ICON.repeat}くらべて聞く</button>
      </div>
    </div>
    <div class="fb-btns">
      <button class="btn ghost" data-act="qplay">${ICON.play}もう一度聞く</button>
      <button class="btn primary" data-act="next">${last ? '結果を見る' : '次へ'}</button>
    </div>
  </section>`;
}

function pick(i) {
  const q = Q.queue[Q.i];
  if (Q.answered) return;
  const ok = q.choices[i] === q.it.ja;
  Q.picked = i; Q.answered = ok ? 'ok' : 'ng';
  const lv = record(q.it.id, ok);
  if (!q.retry) { if (ok) Q.correct++; else Q.wrong.push(q.it); }
  if (!ok && !q.retry) Q.queue.push({ it: q.it, retry: true });
  navigator.vibrate?.(ok ? 15 : [30, 40, 30]);
  renderQuestion();
  speak(q.it.en);
  if (lv > 0) toast(`🎉 レベルアップ！「${LEVELS[S.level]}」になりました`);
  else if (lv < 0) toast(`レベルを「${LEVELS[S.level]}」に調整しました`);
  document.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderResult() {
  const p = pct(Q.correct, Q.first);
  $app.innerHTML = topBar('結果', Q.back) + `
  <section class="card result">
    <p class="label">${h(Q.title)}</p>
    <p class="score">${Q.correct}<span> / ${Q.first}</span></p>
    <p class="msg">${p === 100 ? 'パーフェクト！' : p >= 70 ? 'よくできました！' : 'くり返せば必ず覚えられます'}</p>
    <p class="today-note">今日の学習 ${todayCount()} / ${S.goal}問・${minutes(S.days[today()]?.ms)}分・レベル ${LEVELS[S.level]}</p>
  </section>
  ${Q.wrong.length ? `<h2 class="section">まちがえた問題</h2><p class="hint">明日、ホームの「今日の復習」に出てきます。</p>
  <ul class="phrases">${Q.wrong.map(phraseCard).join('')}</ul>` : ''}
  <div class="result-btns">
    <button class="btn primary block" data-act="again">もう一度(新しい10問)</button>
    <a class="btn ghost block" href="#/">ホームへ</a>
  </div>`;
}

// 今日の10問: 復習が必要な問題 + 今のレベルに合った問題 + 少しだけ上のレベルの問題
function pickToday() {
  const due = shuffle(ALL.filter((i) => isDue(i.id))).slice(0, 4);
  const rest = ALL.filter((i) => !due.includes(i));
  const fresh = rest.filter((i) => !isLearned(i.id));
  const base = fresh.length >= 10 ? fresh : rest;
  const n = 10 - due.length;
  const above = S.level < 3 ? shuffle(base.filter((i) => diff(i) === S.level + 1)).slice(0, 2) : [];
  const picks = [...above, ...shuffle(base.filter((i) => diff(i) <= S.level)).slice(0, n - above.length)];
  if (picks.length < n) picks.push(...shuffle(base.filter((i) => !picks.includes(i))).slice(0, n - picks.length));
  return shuffle([...due, ...picks]);
}

function quizRoute(a, b) {
  if (a === 'today') {
    startQuiz(ALL, '今日の10問', '#/', pickToday());
  } else if (a === 'review') {
    const due = ALL.filter((i) => isDue(i.id));
    startQuiz(due, '今日の復習', '#/', shuffle(due).slice(0, 15));
  } else if (a === 'weak') {
    startQuiz(ALL.filter((i) => isInReview(i.id)), '苦手な問題', '#/r');
  } else if (a === 'fav') {
    startQuiz(myList(), 'マイリスト', '#/m');
  } else if (CAT[a]) {
    const t = CAT[a].topics.find((x) => x.id === b);
    if (t) startQuiz(t.items, `${t.title} クイズ`, `#/t/${a}/${b}`);
    else startQuiz(CAT[a].topics.flatMap((x) => x.items), `${CAT[a].title} クイズ`, `#/c/${a}`);
  } else {
    renderHome();
  }
}

/* ---------- 発音練習 ---------- */
function renderPronHome() {
  const weak = ALL.filter((i) => isInReview(i.id) && i.cat !== 'words');
  $app.innerHTML = topBar('発音練習', null) + `
  <section class="card pron-intro">
    <p><b>聞く → まねする → AIがチェック</b></p>
    <ol>
      <li>お手本を聞く</li>
      <li>マイクで録音する(最大8秒)</li>
      <li>お手本と自分の声をくらべて、AIの採点を見る</li>
    </ol>
    <p class="hint">AIチェックでは、AIがあなたの英語を聞き取れたかどうかで採点します。録音はチェックのためだけに使い、保存されません。</p>
  </section>
  ${weak.length ? `<a class="card review" href="${practiceHref(weak[0])}"><span class="review-ico" aria-hidden="true">🎯</span>
    <div><p class="label">おすすめ</p><p>苦手なフレーズ <b>${weak.length}</b>件 から練習</p></div><span class="chev" aria-hidden="true">›</span></a>` : ''}
  ${CATS.map((c) => `<h2 class="section">${c.icon} ${h(c.title)}</h2>
    <div class="pron-topics">${c.topics.map((t) => `<a class="pron-topic" href="#/p/${c.id}/${t.id}/0" style="--tint:${c.color}"><span aria-hidden="true">${t.icon}</span>${h(t.title)}</a>`).join('')}</div>`).join('')}`;
}

function aiPronBlock(it, has) {
  const st = AI_PRON[it.id];
  if (!has) return '';
  if (!st) return `<button class="btn ai block" data-act="assess">🤖 AIで発音チェック</button>`;
  if (st.loading) return '<div class="ai-box loading"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>AIが聞き取っています…</div>';
  if (st.err) return `<div class="ai-box err"><p>${h(st.err)}</p><button class="btn ghost" data-act="assess">もう一度チェック</button></div>`;
  const tone = st.score >= 90 ? 'great' : st.score >= 70 ? 'good' : st.score >= 40 ? 'mid' : 'low';
  return `<div class="ai-box result ${tone}">
    <div class="ai-score"><span class="ring" style="--p:${st.score}"><b>${st.score}</b><small>点</small></span>
      <div><p class="label">AI発音チェック</p><p class="ai-msg">${scoreMsg(st.score)}</p></div></div>
    <p class="ai-words">${st.words.map((w) => `<button class="w ${w.ok ? 'ok' : 'ng'}" data-act="word" data-w="${h(w.w)}">${h(w.w)}</button>`).join(' ')}</p>
    <p class="ai-heard"><span>AIに聞こえた英語</span>${st.heard ? h(st.heard) : '(聞き取れませんでした)'}</p>
    ${st.words.some((w) => !w.ok) ? '<p class="hint">赤い単語をタップすると、その単語だけ聞けます。</p>' : ''}
  </div>`;
}

let P = null;
const curPracticeItem = () => P && P.t.items[P.i];
function renderPractice(c, t, i) {
  if (c) P = { c, t, i };
  ({ c, t, i } = P);
  const it = t.items[i];
  const rec = isRecording(it.id), has = !!Rec.urls[it.id];
  const pr = S.items[it.id]?.pr;
  const best = S.items[it.id]?.ps;
  $app.innerHTML = topBar(`${t.title}`, `#/t/${c.id}/${t.id}`) + `
  <div class="qprog"><div class="bar"><i style="width:${pct(i + 1, t.items.length)}%"></i></div><span>${i + 1} / ${t.items.length}</span></div>
  <section class="pcard" data-id="${it.id}">
    <div class="pc-top"><span class="label">発音練習${best ? `・ベスト ${best}点` : ''}</span>${favBtn(it)}</div>
    <p class="en pc-en">${h(it.en)}</p>
    <p class="ja">${h(it.ja)}</p>
    <div class="pc-steps">
      <button class="step-btn" data-act="pmodel"><span class="sb-ico model">${ICON.play}</span><span>① お手本</span></button>
      <button class="step-btn" data-act="prec"><span class="sb-ico mic ${rec ? 'on' : ''}">${rec ? ICON.stop : ICON.mic}</span><span>${rec ? '録音中…停止' : has ? '② 録り直す' : '② 録音'}</span></button>
      <button class="step-btn" data-act="pown" ${has ? '' : 'disabled'}><span class="sb-ico own">${ICON.me}</span><span>③ 自分の声</span></button>
    </div>
    ${speedChips()}
    <button class="btn ghost block" data-act="cmp" ${has ? '' : 'disabled'}>${ICON.repeat}お手本 → 自分の声 でくらべる</button>
    ${aiPronBlock(it, has)}
  </section>
  <section class="selfcheck ${has ? '' : 'dim'}">
    <p class="label">くらべてみてどうだった？</p>
    <div class="sc-btns">
      ${[[3, '😊', '言えた'], [2, '🙂', 'もう少し'], [1, '😣', 'むずかしい']].map(([v, e, l]) =>
        `<button class="sc ${pr === v ? 'on' : ''}" data-act="rate-self" data-v="${v}" ${has ? '' : 'disabled'}><span aria-hidden="true">${e}</span>${l}</button>`).join('')}
    </div>
    <p class="hint">「むずかしい」を選ぶと、マイリストに追加されます。</p>
  </section>
  <div class="pnav">
    <a class="btn ghost" href="#/p/${c.id}/${t.id}/${Math.max(0, i - 1)}" ${i === 0 ? 'aria-disabled="true"' : ''}>‹ 前へ</a>
    ${i < t.items.length - 1 ? `<a class="btn primary" href="#/p/${c.id}/${t.id}/${i + 1}">次へ ›</a>` : `<a class="btn primary" href="#/q/${c.id}/${t.id}">クイズへ ›</a>`}
  </div>`;
}

/* ---------- AI英会話 ---------- */
const SCENES = [
  { id: 'hotel', icon: '🏨', title: 'ホテルのチェックイン', goal: '予約を伝えて、チェックインを済ませよう', partner: 'フロント係' },
  { id: 'restaurant', icon: '🍽️', title: 'レストランで注文', goal: '料理と飲み物を注文してみよう', partner: 'ウェイター' },
  { id: 'airport', icon: '🛂', title: '入国審査', goal: '旅行の目的や滞在日数を答えよう', partner: '入国審査官' },
  { id: 'shopping', icon: '🧥', title: '洋服を買う', goal: 'サイズや色をたずねて、買い物をしよう', partner: '店員' },
  { id: 'directions', icon: '🗺️', title: '道をたずねる', goal: '駅や美術館への行き方を聞いてみよう', partner: '地元の人' },
  { id: 'smalltalk', icon: '🥂', title: '自己紹介・雑談', goal: '自己紹介して、趣味や仕事の話をしよう', partner: 'パーティーで会った人' },
];
const SCENE = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const MAX_USER_TURNS = 10;
const CHATS = {};
const chatOf = (id) => (CHATS[id] ||= { msgs: [], sugg: [], loading: false, err: '', draft: '', showJa: {}, showEn: {}, transcribing: false });

function renderChatHome() {
  $app.innerHTML = topBar('AI英会話', null) + `
  <section class="card pron-intro">
    <p><b>AIを相手に、旅行や日常の場面で話してみよう</b></p>
    <p class="hint">英語は文字でも、🎙で声でも入力できます。不自然な英語は、AIがより自然な言い方を教えてくれます。今のレベル(${stars(S.level)} ${LEVELS[S.level]})に合わせて、AIの英語のむずかしさが変わります。</p>
  </section>
  ${online() ? '' : '<p class="notice">オフライン中はAI英会話を使えません。インターネットにつないでください。</p>'}
  <div class="scenes">${SCENES.map((s) => `<a class="scene card" href="#/ai/${s.id}">
    <span class="scene-ico" aria-hidden="true">${s.icon}</span>
    <span class="scene-body"><b>${h(s.title)}</b><small>${h(s.goal)}</small></span>
    ${CHATS[s.id]?.msgs.length ? '<span class="tag">続きから</span>' : '<span class="chev" aria-hidden="true">›</span>'}</a>`).join('')}</div>`;
}

let CHAT_ID = null;
function renderChat(id) {
  CHAT_ID = id;
  const s = SCENE[id], C = chatOf(id);
  const userTurns = C.msgs.filter((m) => m.role === 'user').length;
  const ended = userTurns >= MAX_USER_TURNS;
  const rec = isRecording('chat');
  $app.innerHTML = topBar(s.title, '#/ai') + `
  <section class="mission"><span aria-hidden="true">${s.icon}</span><div><p class="label">ミッション・相手は${h(s.partner)}</p><p>${h(s.goal)}</p></div>
    <button class="btn ghost small" data-act="creset">最初から</button></section>
  <div class="toolbar chat-tools">
    <label class="switch"><input type="checkbox" data-act="hideen" ${S.hideEn ? 'checked' : ''}><span>AIの英文を隠す(聞き取り練習)</span></label>
  </div>
  ${S.hideEn ? '<p class="hint">音声だけで聞き取ってみよう。英文はタップすると表示されます。返事の例も隠しています。</p>' : ''}
  <div class="chat ${S.hideEn ? 'hide-en' : ''}" id="chat">
    ${C.msgs.map((m, i) => m.role === 'assistant' ? `<div class="bubble ai ${C.showEn[i] ? 'revealed' : ''}" data-i="${i}">
        <p class="en" data-act="cen" data-i="${i}">${h(m.content)}</p>
        ${C.showJa[i] && m.ja ? `<p class="ja">${h(m.ja)}</p>` : ''}
        <div class="b-btns"><button class="mini" data-act="csay" data-i="${i}">${ICON.play}聞く</button>${m.ja ? `<button class="mini" data-act="cja" data-i="${i}">${C.showJa[i] ? '訳を隠す' : '日本語訳'}</button>` : ''}</div>
      </div>` : `<div class="bubble me"><p>${h(m.content)}</p></div>
      ${m.correction ? `<div class="fix"><p class="label">💡 より自然な言い方</p><p class="en">${h(m.correction)}</p>${m.correction_ja ? `<p class="ja">${h(m.correction_ja)}</p>` : ''}
        <button class="mini" data-act="cfix" data-i="${i}">${ICON.play}聞く</button></div>` : ''}`).join('')}
    ${C.loading ? '<div class="bubble ai typing"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span></div>' : ''}
    ${C.err ? `<div class="notice">${h(C.err)} <button class="btn ghost small" data-act="cretry">もう一度</button></div>` : ''}
    ${ended ? `<div class="chat-end card"><p class="msg">🎉 おつかれさまでした！</p><p class="hint">${MAX_USER_TURNS}回やりとりしました。別の場面にも挑戦してみよう。</p>
      <div class="row-btns"><button class="btn primary block" data-act="creset">もう一度この場面で話す</button><a class="btn ghost block" href="#/ai">場面を選ぶ</a></div></div>` : ''}
  </div>
  ${!ended && C.sugg.length && !C.loading && S.hideEn && !C.showSugg ? `<div class="sugg"><button class="btn ghost small" data-act="cshowsugg">💡 返事の例を見る</button></div>` : ''}
  ${!ended && C.sugg.length && !C.loading && (!S.hideEn || C.showSugg) ? `<div class="sugg"><p class="label">こう言ってみよう(タップで入力)</p>
    ${C.sugg.map((x, k) => `<button class="sugg-item" data-act="csugg" data-k="${k}"><span class="en">${h(x.en)}</span>${x.ja ? `<small>${h(x.ja)}</small>` : ''}</button>`).join('')}</div>` : ''}
  ${ended ? '' : `<div class="composer">
    <button class="icon-btn mic-btn ${rec ? 'on' : ''}" data-act="cmic" aria-label="${rec ? '録音を止める' : '声で入力'}" ${C.transcribing ? 'disabled' : ''}>${rec ? ICON.stop : ICON.mic}</button>
    <textarea id="cin" rows="1" maxlength="300" placeholder="${C.transcribing ? '聞き取り中…' : rec ? '話してください…(もう一度押すと終了)' : '英語で返事を書く'}" ${C.transcribing ? 'disabled' : ''}>${h(C.draft)}</textarea>
    <button class="icon-btn send-btn" data-act="csend" aria-label="送信" ${C.loading ? 'disabled' : ''}>${ICON.send}</button>
  </div>`}`;
  const box = document.getElementById('chat');
  box?.lastElementChild?.scrollIntoView({ block: 'end' });
  if (!C.msgs.length && !C.loading && !C.err && online()) sendChat(id, true);
}
const refreshChat = (id) => { if (CHAT_ID === id && location.hash === `#/ai/${id}`) renderChat(id); };

async function sendChat(id, opening = false) {
  const C = chatOf(id);
  if (C.loading) return;
  if (!opening) {
    const text = C.draft.trim();
    if (!text) { toast('英語で返事を入力してください'); return; }
    if (!online()) { toast('オフライン中はAI英会話を使えません'); return; }
    C.msgs.push({ role: 'user', content: text });
    C.draft = '';
    const d = dayRec(); d.chat = (d.chat || 0) + 1; addTime(20000); save();
  }
  C.loading = true; C.err = ''; C.sugg = []; C.showSugg = false;
  refreshChat(id);
  try {
    const out = await api('/api/chat', { scenario: id, level: S.level, messages: C.msgs.map((m) => ({ role: m.role, content: m.content })) });
    const lastUser = [...C.msgs].reverse().find((m) => m.role === 'user');
    if (lastUser && !opening && out.correction && out.correction.toLowerCase().replace(/[^a-z]/g, '') !== lastUser.content.toLowerCase().replace(/[^a-z]/g, '')) {
      lastUser.correction = out.correction; lastUser.correction_ja = out.correction_ja;
    }
    C.msgs.push({ role: 'assistant', content: out.reply, ja: out.reply_ja });
    C.sugg = out.suggestions || [];
    C.loading = false;
    refreshChat(id);
    if (CHAT_ID === id) speak(out.reply);
  } catch (e) {
    C.loading = false;
    C.err = apiMessage(e);
    if (opening) C.retryOpening = true;
    refreshChat(id);
  }
}

async function chatMic(id) {
  const C = chatOf(id);
  if (!online()) { toast('オフライン中は声の入力を使えません'); return; }
  await toggleRec('chat', () => refreshChat(id), async () => {
    C.transcribing = true; refreshChat(id);
    try {
      const text = await transcribeBlob(Rec.blobs.chat);
      if (text) C.draft = (C.draft ? `${C.draft} ` : '') + text;
      else toast('うまく聞き取れませんでした。もう一度話してみてください');
    } catch (e) { toast(apiMessage(e)); }
    C.transcribing = false; refreshChat(id);
    if (C.draft) document.getElementById('cin')?.focus();
  }, 15000);
}

/* ---------- 学習記録・学習履歴 ---------- */
function renderRecord() {
  const keys = Object.keys(S.days).filter((k) => S.days[k].a || S.days[k].rec || S.days[k].chat).sort().reverse();
  const days = keys.map((k) => S.days[k]);
  const sum = (f) => days.reduce((s, d) => s + (d[f] || 0), 0);
  const a = sum('a'), c = sum('c');
  const totalMin = minutes(sum('ms'));
  const pn = sum('pn'), psum = sum('psum'), chats = sum('chat');
  const words = ALL.filter((i) => i.cat === 'words');
  const lw = words.filter((i) => isLearned(i.id)).length;
  const phrases = ALL.filter((i) => i.cat !== 'words');
  const lp = phrases.filter((i) => isLearned(i.id)).length;
  const weak = ALL.filter((i) => isInReview(i.id)).sort((x, y) => S.items[x.id].due.localeCompare(S.items[y.id].due));
  const t0 = today();
  const dueToday = weak.filter((i) => S.items[i.id].due <= t0).length;
  const dueTomorrow = weak.filter((i) => S.items[i.id].due === addDays(t0, 1)).length;
  const dueWeek = weak.filter((i) => S.items[i.id].due > addDays(t0, 1) && S.items[i.id].due <= addDays(t0, 7)).length;
  const week = [...Array(7)].map((_, k) => { const key = addDays(t0, k - 6); return { key, n: S.days[key]?.a || 0 }; });
  const max = Math.max(S.goal, ...week.map((w) => w.n));
  const catAcc = CATS.map((cat) => {
    let cc = 0, ww = 0;
    for (const it of ALL) if (it.cat === cat.id && S.items[it.id]) { cc += S.items[it.id].c; ww += S.items[it.id].w; }
    return { cat, n: cc + ww, p: pct(cc, cc + ww) };
  });
  const recentAcc = S.recent.length ? pct(S.recent.reduce((x, y) => x + y, 0), S.recent.length) : null;
  const stageLabel = (r) => (r.due <= t0 ? '今日' : r.due === addDays(t0, 1) ? '明日' : fmtDay(r.due));

  $app.innerHTML = topBar('学習記録', null) + `
  <section class="card level-card">
    <div><p class="label">今のレベル(自動調整)</p><p class="lv-big">${stars(S.level)} <b>${LEVELS[S.level]}</b></p></div>
    <div class="lv-meter"><p class="label">直近の正解率 ${recentAcc === null ? '–' : `${recentAcc}%`}(${S.recent.length}/20問)</p>
      <span class="bar"><i style="width:${(S.recent.length / 20) * 100}%"></i></span></div>
    <p class="hint">直近20問の正解率が85%以上でレベルアップ、55%未満でレベルを下げます。レベルに合わせて「今日の10問」の問題、選択肢の数(初級は3択)、AI英会話の英語のむずかしさが変わります。</p>
  </section>

  <section class="card voice-card">
    <p class="label">英語の音声</p>
    <div class="chips wide" role="group" aria-label="英語の音声">
      ${[['auto', '自動'], ['ai', 'AI音声'], ['device', '端末の音声']].map(([v, l]) => `<button class="chip ${S.voice === v ? 'on' : ''}" data-act="voice" data-v="${v}">${l}</button>`).join('')}
    </div>
    <p class="hint">「自動」はiPhoneではAI音声、それ以外は端末の読み上げを使います。AI音声は消音モードでも鳴り、一度聞いた英文は通信なしで再生できます。音が出ないときは切り替えてみてください。</p>
    <button class="btn ghost small" data-act="voicetest">${ICON.play}テスト再生</button>
  </section>

  <div class="stats">
    <div class="stat"><p class="label">学習日数</p><p class="num">${keys.length}<span>日</span></p></div>
    <div class="stat"><p class="label">連続</p><p class="num">${streak()}<span>日</span></p></div>
    <div class="stat"><p class="label">学習時間</p><p class="num">${totalMin}<span>分</span></p></div>
    <div class="stat"><p class="label">正解率</p><p class="num">${a ? pct(c, a) : '–'}<span>${a ? '%' : ''}</span></p></div>
    <div class="stat"><p class="label">AI発音 平均</p><p class="num">${pn ? Math.round(psum / pn) : '–'}<span>${pn ? '点' : ''}</span></p></div>
    <div class="stat"><p class="label">AI英会話</p><p class="num">${chats}<span>回</span></p></div>
    <div class="stat"><p class="label">覚えた単語</p><p class="num">${lw}<span>/ ${words.length}</span></p></div>
    <div class="stat"><p class="label">覚えたフレーズ</p><p class="num">${lp}<span>/ ${phrases.length}</span></p></div>
    <div class="stat"><p class="label">解いた問題</p><p class="num">${a}<span>問</span></p></div>
  </div>

  <section class="card week">
    <p class="label">この7日間(解いた問題数)</p>
    <div class="bars">${week.map((w, k) => `<div class="b ${k === 6 ? 'now' : ''}"><span class="v">${w.n || ''}</span><i style="height:${Math.max(4, pct(w.n, max))}%"></i><span class="d">${WD[fromKey(w.key).getDay()]}</span></div>`).join('')}</div>
    <p class="hint">2回続けて正解し、復習もすべて終えると「覚えた」になります。</p>
  </section>

  <h2 class="section">復習の予定</h2>
  <div class="sched">
    <a class="sched-item ${dueToday ? 'hot' : ''}" href="${dueToday ? '#/q/review' : '#/r'}"><span>今日</span><b>${dueToday}</b></a>
    <div class="sched-item"><span>明日</span><b>${dueTomorrow}</b></div>
    <div class="sched-item"><span>7日以内</span><b>${dueWeek}</b></div>
  </div>
  <p class="hint">まちがえた問題は「翌日 → 3日後 → 7日後」に復習として出題されます。正解し続けると卒業です。</p>

  <h2 class="section">カテゴリー別の正解率</h2>
  <section class="card acc">${catAcc.map(({ cat, n, p }) => `<div class="acc-row" style="--tint:${cat.color}">
    <span class="acc-name">${cat.icon} ${h(cat.title)}</span>
    <span class="acc-bar"><i style="width:${n ? p : 0}%"></i></span>
    <span class="acc-num">${n ? `${p}%` : '–'}</span></div>`).join('')}</section>

  <h2 class="section">学習履歴</h2>
  ${keys.length ? `<section class="card hist">
    <div class="hist-row head"><span>日付</span><span>問題</span><span>正解率</span><span>時間</span><span>発音</span><span>会話</span></div>
    ${keys.slice(0, 30).map((k) => { const d = S.days[k]; return `<div class="hist-row ${k === t0 ? 'now' : ''}">
      <span>${k === t0 ? '今日' : fmtDay(k)}</span><span>${d.a}</span><span>${d.a ? `${pct(d.c, d.a)}%` : '–'}</span><span>${minutes(d.ms)}分</span><span>${d.rec || 0}</span><span>${d.chat || 0}</span></div>`; }).join('')}
  </section>` : '<p class="hint">まだ記録がありません。</p>'}

  <h2 class="section">苦手な問題</h2>
  ${weak.length ? `<a class="btn primary block" href="#/q/weak">苦手な問題をまとめて練習(${weak.length}問)</a>
  <ul class="phrases weak-list">${weak.slice(0, 30).map((it) => phraseCard(it).replace('<p class="en">', `<span class="due-tag">復習:${stageLabel(S.items[it.id])}</span><p class="en">`)).join('')}</ul>`
    : '<p class="hint">まだありません。クイズでまちがえた問題がここに集まります。</p>'}
  <p class="version">English Master バージョン ${APP_VERSION}</p>`;
}

/* ---------- ルーティング ---------- */
function setTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === tab));
}
function route() {
  stopSpeaking();
  stopRec(true);
  CHAT_ID = null;
  const [a, b, c, d] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  let tab = 'home';
  const topic = CAT[b]?.topics.find((t) => t.id === c);
  document.body.classList.toggle('chat-page', a === 'ai' && !!SCENE[b]);
  if (a === 'c' && CAT[b]) { renderCategory(CAT[b]); if (b === 'words') tab = 'words'; }
  else if (a === 't' && topic) { renderTopic(CAT[b], topic); if (b === 'words') tab = 'words'; }
  else if (a === 'q') { quizRoute(b, c); if (b === 'words') tab = 'words'; }
  else if (a === 'p' && topic) { const i = Math.min(Math.max(0, parseInt(d, 10) || 0), topic.items.length - 1); renderPractice(CAT[b], topic, i); tab = 'pron'; }
  else if (a === 'p') { renderPronHome(); tab = 'pron'; }
  else if (a === 'ai' && SCENE[b]) { renderChat(b); tab = 'ai'; }
  else if (a === 'ai') { renderChatHome(); tab = 'ai'; }
  else if (a === 'm') { renderMyList(); }
  else if (a === 'r') { renderRecord(); tab = 'record'; }
  else renderHome();
  setTab(tab);
  if (!(a === 'ai' && SCENE[b])) window.scrollTo(0, 0);
}

/* ---------- 操作 ---------- */
const curQuizItem = () => Q?.queue[Q.i]?.it;
const inQuiz = () => location.hash.startsWith('#/q') && Q && curQuizItem();

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const li = el.closest('[data-id]');
  const it = li && ITEMS[li.dataset.id];
  const C = CHAT_ID && chatOf(CHAT_ID);
  switch (el.dataset.act) {
    case 'play': speak(it.en); break;
    case 'repeat': speak(it.en, 3); toast('3回くり返して再生します'); break;
    case 'text': {
      const hidden = li.closest('.hide-ja') && !li.classList.contains('revealed');
      if (hidden) li.classList.add('revealed');
      speak(it.en);
      break;
    }
    case 'fav':
      if (S.fav[it.id]) delete S.fav[it.id]; else S.fav[it.id] = 1;
      save();
      el.classList.toggle('on', !!S.fav[it.id]); el.textContent = S.fav[it.id] ? '★' : '☆';
      toast(S.fav[it.id] ? 'マイリストに追加しました' : 'マイリストから外しました');
      break;
    case 'rate':
      S.rate = +el.dataset.rate; save();
      el.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === el));
      if (inQuiz()) speak(curQuizItem().en);
      else if (location.hash.startsWith('#/p/') && curPracticeItem()) speak(curPracticeItem().en);
      break;
    // クイズ
    case 'qplay': if (curQuizItem()) speak(curQuizItem().en); break;
    case 'showen': Q.showEn = true; renderQuestion(); break;
    case 'pick': pick(+el.dataset.i); break;
    case 'qrec': toggleRec(curQuizItem().id, renderQuestion); break;
    case 'cmp': compare(it || curPracticeItem()); break;
    case 'next':
      stopRec(true);
      Q.i++; Q.answered = null; Q.picked = null; Q.showEn = false;
      renderQuestion(); window.scrollTo(0, 0);
      break;
    case 'again': startQuiz(Q.pool, Q.title, Q.back); window.scrollTo(0, 0); break;
    // 発音練習
    case 'pmodel': speak(curPracticeItem().en); break;
    case 'voice':
      S.voice = el.dataset.v; save();
      el.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === el));
      speak('Hello! Nice to meet you.');
      break;
    case 'voicetest': speak('Hello! Nice to meet you.'); break;
    case 'prec': {
      const p = curPracticeItem();
      toggleRec(p.id, () => renderPractice(), (id) => { delete AI_PRON[id]; if (online()) assessPron(id); else renderPractice(); });
      break;
    }
    case 'pown': playOwn(curPracticeItem()); break;
    case 'assess': assessPron(curPracticeItem().id); break;
    case 'word': speak(el.dataset.w.replace(/[^A-Za-z0-9' -]/g, '')); break;
    case 'rate-self': {
      const p = curPracticeItem();
      const v = +el.dataset.v;
      (S.items[p.id] ||= { c: 0, w: 0, s: 0 }).pr = v;
      if (v === 1 && !S.fav[p.id]) { S.fav[p.id] = 1; toast('マイリストに追加しました'); }
      else toast(v === 3 ? 'いいですね！次へ進みましょう' : 'くり返すほど上達します');
      save();
      renderPractice();
      break;
    }
    // AI英会話
    case 'csend': sendChat(CHAT_ID); break;
    case 'cmic': chatMic(CHAT_ID); break;
    case 'csay': speak(C.msgs[+el.dataset.i].content); break;
    case 'cfix': speak(C.msgs[+el.dataset.i].correction); break;
    case 'cen': if (S.hideEn && !C.showEn[+el.dataset.i]) { C.showEn[+el.dataset.i] = true; el.closest('.bubble')?.classList.add('revealed'); } break;
    case 'cshowsugg': C.showSugg = true; renderChat(CHAT_ID); break;
    case 'cja': C.showJa[+el.dataset.i] = !C.showJa[+el.dataset.i]; renderChat(CHAT_ID); break;
    case 'csugg': { const s = C.sugg[+el.dataset.k]; C.draft = s.en; renderChat(CHAT_ID); speak(s.en); document.getElementById('cin')?.focus(); break; }
    case 'creset': stopRec(true); delete CHATS[CHAT_ID]; renderChat(CHAT_ID); break;
    case 'cretry': {
      C.err = '';
      if (C.retryOpening || !C.msgs.length) { C.retryOpening = false; sendChat(CHAT_ID, true); }
      else { const last = C.msgs[C.msgs.length - 1]; if (last.role === 'user') { C.msgs.pop(); C.draft = last.content; } sendChat(CHAT_ID); }
      break;
    }
  }
});
$app.addEventListener('change', (e) => {
  if (e.target.dataset.act === 'hideen') {
    S.hideEn = e.target.checked; save();
    if (CHAT_ID) { const c = chatOf(CHAT_ID); c.showEn = {}; c.showSugg = false; renderChat(CHAT_ID); }
    return;
  }
  if (e.target.dataset.act !== 'hideja') return;
  S.hideJa = e.target.checked; save();
  const list = $app.querySelector('.phrases');
  list?.classList.toggle('hide-ja', S.hideJa);
  list?.querySelectorAll('.revealed').forEach((x) => x.classList.remove('revealed'));
  const hint = $app.querySelector('.hint');
  if (hint) hint.textContent = listHint();
});
$app.addEventListener('input', (e) => {
  if (e.target.id !== 'cin' || !CHAT_ID) return;
  chatOf(CHAT_ID).draft = e.target.value;
  e.target.style.height = 'auto';
  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
});
$app.addEventListener('keydown', (e) => {
  if (e.target.id === 'cin' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendChat(CHAT_ID); }
});

/* ---------- オフライン対応 ---------- */
function updateOnline() {
  document.body.classList.toggle('offline', !online());
}
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
updateOnline();
const APP_VERSION = '3.5';
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // 新しい版が届いたら自動で1回だけ読み込み直す
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  });
}

window.addEventListener('hashchange', route);
route();
