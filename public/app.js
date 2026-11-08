'use strict';
/* English Master
   第1段階: ホーム / カテゴリー / フレーズ / 音声再生 / 意味当てクイズ
   第2段階: 発音録音 / マイリスト / 翌日・3日後・7日後の復習 / 学習履歴 */

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
const S = { days: {}, items: {}, fav: {}, rate: 0.85, goal: 20, hideJa: false };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 保存できない環境でも動かす */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* noop */ } };

// 復習の間隔: まちがえた → 翌日 → 3日後 → 7日後 → 卒業
const INTERVALS = { 1: 1, 2: 3, 3: 7 };
if (!S.v) { // 第1段階のデータを復習スケジュールに移す
  for (const r of Object.values(S.items)) if (r.w > 0 && r.s < 2) { r.st = 1; r.due = dayKey(); }
  S.v = 2; save();
}

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
  save();
}
const isInReview = (id) => (S.items[id]?.st || 0) > 0;           // 苦手(復習サイクル中)
const isDue = (id) => isInReview(id) && S.items[id].due <= today();
const isLearned = (id) => (S.items[id]?.s || 0) >= 2 && !isInReview(id);
const todayCount = () => S.days[today()]?.a || 0;
const minutes = (ms) => Math.round((ms || 0) / 60000);
function streak() {
  let n = 0; const d = new Date();
  const active = (k) => S.days[k]?.a || S.days[k]?.rec;
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

let speakToken = 0;
let ownAudio = null;
function stopSpeaking() {
  speakToken++;
  if (canSpeak) speechSynthesis.cancel();
  if (ownAudio) { ownAudio.pause(); ownAudio = null; }
}
function speak(text, times = 1, onDone) {
  if (!canSpeak) { toast('この端末では音声を再生できません'); return; }
  stopSpeaking();
  const tok = speakToken;
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
  once();
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

/* ---------- 録音(端末内だけで再生。保存・送信はしない) ---------- */
const Rec = { stream: null, mr: null, chunks: [], urls: {}, cur: null, timer: null, cancel: false, busy: false, started: 0, onChange: null };
const canRecord = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const isRecording = (id) => Rec.cur === id && Rec.mr?.state === 'recording';
function releaseMic() { Rec.stream?.getTracks().forEach((t) => t.stop()); Rec.stream = null; }
function stopRec(cancel = false) {
  clearTimeout(Rec.timer);
  Rec.cancel = cancel;
  if (Rec.mr && Rec.mr.state === 'recording') Rec.mr.stop(); else if (cancel) { releaseMic(); Rec.cur = null; }
}
async function toggleRec(it, onChange) {
  if (isRecording(it.id)) { stopRec(); return; }
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
  Rec.mr = mr; Rec.chunks = []; Rec.cur = it.id; Rec.cancel = false; Rec.onChange = onChange; Rec.started = Date.now();
  mr.ondataavailable = (e) => { if (e.data.size) Rec.chunks.push(e.data); };
  mr.onstop = () => {
    releaseMic();
    const id = Rec.cur; Rec.cur = null;
    if (Rec.cancel) return;
    const blob = new Blob(Rec.chunks, { type: mr.mimeType || type || 'audio/webm' });
    if (Rec.urls[id]) URL.revokeObjectURL(Rec.urls[id]);
    Rec.urls[id] = URL.createObjectURL(blob);
    dayRec().rec = (dayRec().rec || 0) + 1;
    addTime(Math.min(Date.now() - Rec.started + 5000, 20000));
    save();
    Rec.onChange?.();
    compare(ITEMS[id]);
  };
  mr.start();
  onChange?.();
  Rec.timer = setTimeout(() => stopRec(), 8000);
}
function playOwn(it) {
  const url = Rec.urls[it.id];
  if (!url) { toast('まず録音してください'); return; }
  stopSpeaking();
  ownAudio = new Audio(url);
  ownAudio.play().catch(() => toast('再生できませんでした'));
}
function compare(it) {
  if (!Rec.urls[it.id]) return;
  speak(it.en, 1, () => setTimeout(() => playOwn(it), 350));
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
    <a class="btn primary block" href="#/q/today">${done >= goal ? '目標達成！さらに10問' : '今日の10問をはじめる'}</a>
  </section>
  ${due ? `<a class="card review" href="#/q/review">
    <span class="review-ico" aria-hidden="true">↻</span>
    <div><p class="label">今日の復習</p><p><b>${due}</b>問 復習のタイミングです</p></div>
    <span class="chev" aria-hidden="true">›</span></a>`
    : tomorrow ? `<div class="card review calm"><span class="review-ico" aria-hidden="true">✓</span>
    <div><p class="label">今日の復習</p><p>今日の分は完了。明日 <b>${tomorrow}</b>問 の復習があります</p></div></div>` : ''}
  <div class="quick">
    <a class="card quick-item" href="#/p"><span class="q-ico" aria-hidden="true">🎙</span><b>発音練習</b><small>お手本とくらべる</small></a>
    <a class="card quick-item" href="${mine ? '#/q/fav' : '#/m'}"><span class="q-ico" aria-hidden="true">★</span><b>マイリスト</b><small>${mine ? `${mine}件をクイズ` : '☆で追加できます'}</small></a>
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
}

/* ---------- マイリスト ---------- */
function renderMyList() {
  const list = myList();
  $app.innerHTML = topBar('マイリスト', '#/') + `
  <p class="lead">自分で選んだ復習リストです。フレーズや単語の ☆ をタップすると追加できます。</p>
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
  const cat = CAT[it.cat];
  const tiers = [topicOf(it).items, cat.topics.flatMap((t) => t.items), ALL];
  const out = [it.ja];
  for (const tier of tiers) {
    for (const x of shuffle(tier)) { if (out.length >= 4) break; if (!out.includes(x.ja)) out.push(x.ja); }
    if (out.length >= 4) break;
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
  record(q.it.id, ok);
  if (!q.retry) { if (ok) Q.correct++; else Q.wrong.push(q.it); }
  if (!ok && !q.retry) Q.queue.push({ it: q.it, retry: true });
  navigator.vibrate?.(ok ? 15 : [30, 40, 30]);
  renderQuestion();
  speak(q.it.en);
  document.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderResult() {
  const p = pct(Q.correct, Q.first);
  $app.innerHTML = topBar('結果', Q.back) + `
  <section class="card result">
    <p class="label">${h(Q.title)}</p>
    <p class="score">${Q.correct}<span> / ${Q.first}</span></p>
    <p class="msg">${p === 100 ? 'パーフェクト！' : p >= 70 ? 'よくできました！' : 'くり返せば必ず覚えられます'}</p>
    <p class="today-note">今日の学習 ${todayCount()} / ${S.goal}問・${minutes(S.days[today()]?.ms)}分</p>
  </section>
  ${Q.wrong.length ? `<h2 class="section">まちがえた問題</h2><p class="hint">明日、ホームの「今日の復習」に出てきます。</p>
  <ul class="phrases">${Q.wrong.map(phraseCard).join('')}</ul>` : ''}
  <div class="result-btns">
    <button class="btn primary block" data-act="again">もう一度(新しい10問)</button>
    <a class="btn ghost block" href="#/">ホームへ</a>
  </div>`;
}

function quizRoute(a, b) {
  if (a === 'today') {
    const due = shuffle(ALL.filter((i) => isDue(i.id))).slice(0, 4);
    const rest = shuffle(ALL.filter((i) => !due.includes(i))).slice(0, 10 - due.length);
    startQuiz(ALL, '今日の10問', '#/', shuffle([...due, ...rest]));
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
    <p><b>聞く → まねする → くらべる</b></p>
    <ol>
      <li>お手本を聞く</li>
      <li>マイクで録音する(最大8秒)</li>
      <li>お手本と自分の声を続けて聞いてくらべる</li>
    </ol>
    <p class="hint">録音した声はこのスマホの中だけで再生され、どこにも送信・保存されません。</p>
  </section>
  ${weak.length ? `<a class="card review" href="${practiceHref(weak[0])}"><span class="review-ico" aria-hidden="true">🎯</span>
    <div><p class="label">おすすめ</p><p>苦手なフレーズ <b>${weak.length}</b>件 から練習</p></div><span class="chev" aria-hidden="true">›</span></a>` : ''}
  ${CATS.map((c) => `<h2 class="section">${c.icon} ${h(c.title)}</h2>
    <div class="pron-topics">${c.topics.map((t) => `<a class="pron-topic" href="#/p/${c.id}/${t.id}/0" style="--tint:${c.color}"><span aria-hidden="true">${t.icon}</span>${h(t.title)}</a>`).join('')}</div>`).join('')}`;
}

let P = null;
function renderPractice(c, t, i) {
  if (c) P = { c, t, i };
  ({ c, t, i } = P);
  const it = t.items[i];
  const rec = isRecording(it.id), has = !!Rec.urls[it.id];
  const pr = S.items[it.id]?.pr;
  $app.innerHTML = topBar(`${t.title}`, `#/t/${c.id}/${t.id}`) + `
  <div class="qprog"><div class="bar"><i style="width:${pct(i + 1, t.items.length)}%"></i></div><span>${i + 1} / ${t.items.length}</span></div>
  <section class="pcard" data-id="${it.id}">
    <div class="pc-top"><span class="label">発音練習</span>${favBtn(it)}</div>
    <p class="en pc-en">${h(it.en)}</p>
    <p class="ja">${h(it.ja)}</p>
    <div class="pc-steps">
      <button class="step-btn" data-act="pmodel"><span class="sb-ico model">${ICON.play}</span><span>① お手本</span></button>
      <button class="step-btn" data-act="prec"><span class="sb-ico mic ${rec ? 'on' : ''}">${rec ? ICON.stop : ICON.mic}</span><span>${rec ? '録音中…停止' : has ? '② 録り直す' : '② 録音'}</span></button>
      <button class="step-btn" data-act="pown" ${has ? '' : 'disabled'}><span class="sb-ico own">${ICON.me}</span><span>③ 自分の声</span></button>
    </div>
    ${speedChips()}
    <button class="btn ghost block" data-act="cmp" ${has ? '' : 'disabled'}>${ICON.repeat}お手本 → 自分の声 でくらべる</button>
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

/* ---------- 学習記録・学習履歴 ---------- */
function renderRecord() {
  const keys = Object.keys(S.days).filter((k) => S.days[k].a || S.days[k].rec).sort().reverse();
  const days = keys.map((k) => S.days[k]);
  const a = days.reduce((s, d) => s + d.a, 0), c = days.reduce((s, d) => s + d.c, 0);
  const totalMin = minutes(days.reduce((s, d) => s + (d.ms || 0), 0));
  const totalRec = days.reduce((s, d) => s + (d.rec || 0), 0);
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
  const stageLabel = (r) => (r.due <= t0 ? '今日' : r.due === addDays(t0, 1) ? '明日' : fmtDay(r.due));

  $app.innerHTML = topBar('学習記録', null) + `
  <div class="stats">
    <div class="stat"><p class="label">学習日数</p><p class="num">${keys.length}<span>日</span></p></div>
    <div class="stat"><p class="label">連続</p><p class="num">${streak()}<span>日</span></p></div>
    <div class="stat"><p class="label">正解率</p><p class="num">${a ? pct(c, a) : '–'}<span>${a ? '%' : ''}</span></p></div>
    <div class="stat"><p class="label">学習時間</p><p class="num">${totalMin}<span>分</span></p></div>
    <div class="stat"><p class="label">覚えた単語</p><p class="num">${lw}<span>/ ${words.length}</span></p></div>
    <div class="stat"><p class="label">覚えたフレーズ</p><p class="num">${lp}<span>/ ${phrases.length}</span></p></div>
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
    <div class="hist-row head"><span>日付</span><span>問題</span><span>正解率</span><span>時間</span><span>発音</span></div>
    ${keys.slice(0, 30).map((k) => { const d = S.days[k]; return `<div class="hist-row ${k === t0 ? 'now' : ''}">
      <span>${k === t0 ? '今日' : fmtDay(k)}</span><span>${d.a}問</span><span>${d.a ? `${pct(d.c, d.a)}%` : '–'}</span><span>${minutes(d.ms)}分</span><span>${d.rec || 0}回</span></div>`; }).join('')}
  </section>
  <p class="hint">発音練習の合計 ${totalRec}回</p>` : '<p class="hint">まだ記録がありません。</p>'}

  <h2 class="section">苦手な問題</h2>
  ${weak.length ? `<a class="btn primary block" href="#/q/weak">苦手な問題をまとめて練習(${weak.length}問)</a>
  <ul class="phrases weak-list">${weak.slice(0, 30).map((it) => phraseCard(it).replace('<p class="en">', `<span class="due-tag">復習:${stageLabel(S.items[it.id])}</span><p class="en">`)).join('')}</ul>`
    : '<p class="hint">まだありません。クイズでまちがえた問題がここに集まります。</p>'}`;
}

/* ---------- ルーティング ---------- */
function setTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === tab));
}
function route() {
  stopSpeaking();
  stopRec(true);
  const [a, b, c, d] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  let tab = 'home';
  const topic = CAT[b]?.topics.find((t) => t.id === c);
  if (a === 'c' && CAT[b]) { renderCategory(CAT[b]); if (b === 'words') tab = 'words'; }
  else if (a === 't' && topic) { renderTopic(CAT[b], topic); if (b === 'words') tab = 'words'; }
  else if (a === 'q') { quizRoute(b, c); if (b === 'words') tab = 'words'; }
  else if (a === 'p' && topic) { const i = Math.min(Math.max(0, parseInt(d, 10) || 0), topic.items.length - 1); renderPractice(CAT[b], topic, i); tab = 'pron'; }
  else if (a === 'p') { renderPronHome(); tab = 'pron'; }
  else if (a === 'm') { renderMyList(); }
  else if (a === 'r') { renderRecord(); tab = 'record'; }
  else renderHome();
  setTab(tab);
  window.scrollTo(0, 0);
}

/* ---------- 操作 ---------- */
const curQuizItem = () => Q?.queue[Q.i]?.it;
const inQuiz = () => location.hash.startsWith('#/q') && Q && curQuizItem();
const curPracticeItem = () => P && P.t.items[P.i];

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const li = el.closest('[data-id]');
  const it = li && ITEMS[li.dataset.id];
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
    case 'qrec': toggleRec(curQuizItem(), renderQuestion); break;
    case 'cmp': compare(it || curPracticeItem()); break;
    case 'next':
      stopRec(true);
      Q.i++; Q.answered = null; Q.picked = null; Q.showEn = false;
      renderQuestion(); window.scrollTo(0, 0);
      break;
    case 'again': startQuiz(Q.pool, Q.title, Q.back); window.scrollTo(0, 0); break;
    // 発音練習
    case 'pmodel': speak(curPracticeItem().en); break;
    case 'prec': toggleRec(curPracticeItem(), () => renderPractice()); break;
    case 'pown': playOwn(curPracticeItem()); break;
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
  }
});
$app.addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'hideja') return;
  S.hideJa = e.target.checked; save();
  const list = $app.querySelector('.phrases');
  list?.classList.toggle('hide-ja', S.hideJa);
  list?.querySelectorAll('.revealed').forEach((x) => x.classList.remove('revealed'));
  const hint = $app.querySelector('.hint');
  if (hint) hint.textContent = listHint();
});

window.addEventListener('hashchange', route);
route();
