'use strict';
/* English Master — 第1段階
   ホーム / カテゴリー / シーン別フレーズ / 音声再生 / 意味当てクイズ / 学習記録(簡易) */

const $app = document.getElementById('app');
const CATS = window.CONTENT.categories;
const CAT = {};
const ITEMS = {};
for (const c of CATS) {
  CAT[c.id] = c;
  for (const t of c.topics) {
    t.items = t.items.map(([en, ja, note], i) => {
      const it = { id: `${c.id}.${t.id}.${i}`, en, ja, note: note || '', cat: c.id, topic: t.id };
      ITEMS[it.id] = it;
      return it;
    });
  }
}
const ALL = Object.values(ITEMS);

const h = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11V9a3 3 0 0 1 3-3h11M15 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H6M9 21l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/* ---------- 学習記録(端末内に保存) ---------- */
const KEY = 'english-master.v1';
const S = { days: {}, items: {}, fav: {}, rate: 0.85, goal: 20, hideJa: false };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 保存できない環境でも動かす */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* noop */ } };
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function record(id, ok) {
  const d = dayKey();
  const day = (S.days[d] ||= { a: 0, c: 0 });
  day.a++; if (ok) day.c++;
  const r = (S.items[id] ||= { c: 0, w: 0, s: 0 });
  if (ok) { r.c++; r.s++; } else { r.w++; r.s = 0; }
  r.t = Date.now();
  save();
}
const isLearned = (id) => (S.items[id]?.s || 0) >= 2;            // 2回連続正解で「覚えた」
const isWeak = (id) => { const r = S.items[id]; return !!r && r.w > 0 && r.s < 2; };
const todayCount = () => S.days[dayKey()]?.a || 0;
function streak() {
  let n = 0; const d = new Date();
  if (!S.days[dayKey(d)]?.a) d.setDate(d.getDate() - 1);
  while (S.days[dayKey(d)]?.a) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ---------- 音声(端末の読み上げ機能を使う) ---------- */
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
function stopSpeaking() { speakToken++; if (canSpeak) speechSynthesis.cancel(); }
function speak(text, times = 1) {
  if (!canSpeak) { toast('この端末では音声を再生できません'); return; }
  const tok = ++speakToken;
  speechSynthesis.cancel();
  let n = 0;
  const once = () => {
    if (tok !== speakToken) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; if (voice) u.voice = voice; u.rate = S.rate;
    u.onend = () => { if (++n < times && tok === speakToken) setTimeout(once, 700); };
    speechSynthesis.speak(u);
  };
  once();
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ---------- 共通パーツ ---------- */
const RATES = [[0.6, 'ゆっくり'], [0.85, 'ふつう'], [1, 'ナチュラル']];
const speedChips = () => `<div class="chips" role="group" aria-label="再生速度">${RATES.map(([r, l]) =>
  `<button class="chip ${S.rate === r ? 'on' : ''}" data-act="rate" data-rate="${r}">${l}</button>`).join('')}</div>`;
const topBar = (title, back) => `<header class="topbar"><a class="back" href="${back}" aria-label="もどる">‹</a><h1>${h(title)}</h1><span></span></header>`;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

function phraseCard(it, withFav) {
  const fav = !!S.fav[it.id];
  return `<li class="phrase" data-id="${it.id}">
    <div class="p-text" data-act="text">
      <p class="en">${h(it.en)}</p>
      <p class="ja">${h(it.ja)}${it.note ? ` <span class="tag">${h(it.note)}</span>` : ''}</p>
    </div>
    <div class="p-btns">
      <button class="icon-btn" data-act="play" aria-label="再生">${ICON.play}</button>
      <button class="icon-btn" data-act="repeat" aria-label="3回くり返して再生">${ICON.repeat}</button>
      ${withFav ? `<button class="icon-btn fav ${fav ? 'on' : ''}" data-act="fav" aria-label="お気に入り">${fav ? '★' : '☆'}</button>` : ''}
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
  const weak = ALL.filter((i) => isWeak(i.id)).length;
  $app.innerHTML = `
  <header class="hero">
    <p class="eyebrow">${greeting()}</p>
    <h1>English Master</h1>
    <p class="sub">聞いて、わかって、話せる英語へ。</p>
  </header>
  <section class="card today">
    <div class="today-head">
      <div><p class="label">今日の目標</p><p class="big">${done}<span> / ${goal}問</span></p></div>
      <div class="streak"><span aria-hidden="true">🔥</span>${streak()}日連続</div>
    </div>
    <div class="bar"><i style="width:${Math.min(100, pct(done, goal))}%"></i></div>
    <a class="btn primary block" href="#/q/today">${done >= goal ? '目標達成！さらに10問' : '今日の10問をはじめる'}</a>
  </section>
  ${weak ? `<a class="card review" href="#/q/weak">
    <span class="review-ico" aria-hidden="true">↻</span>
    <div><p class="label">復習する問題</p><p><b>${weak}</b>問 まちがえた問題があります</p></div>
    <span class="chev" aria-hidden="true">›</span></a>` : ''}
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
  const favCount = c.id === 'words' ? Object.keys(S.fav).filter((id) => ITEMS[id]?.cat === 'words').length : 0;
  $app.innerHTML = topBar(c.title, '#/') + `
  <p class="lead">${h(c.desc)}</p>
  <div class="row-btns">
    <a class="btn primary block" href="#/q/${c.id}">ランダム10問</a>
    ${favCount ? `<a class="btn ghost block" href="#/q/fav">★ お気に入り(${favCount})</a>` : ''}
  </div>
  <ul class="topics">${c.topics.map((t) => {
    const l = t.items.filter((i) => isLearned(i.id)).length;
    return `<li><a href="#/t/${c.id}/${t.id}" style="--tint:${c.color}">
      <span class="t-ico" aria-hidden="true">${t.icon}</span>
      <span class="t-body"><b>${h(t.title)}</b><small>${t.items.length}${c.unit}・覚えた ${l}</small>
        <span class="mini-bar"><i style="width:${pct(l, t.items.length)}%"></i></span></span>
      <span class="chev" aria-hidden="true">›</span></a></li>`;
  }).join('')}</ul>`;
}

function renderTopic(c, t) {
  $app.innerHTML = topBar(t.title, `#/c/${c.id}`) + `
  <div class="toolbar">
    ${speedChips()}
    <label class="switch"><input type="checkbox" data-act="hideja" ${S.hideJa ? 'checked' : ''}><span>日本語を隠す</span></label>
  </div>
  <p class="hint">${S.hideJa ? '英文をタップすると意味が表示されます。' : '英文をタップすると音声が流れます。'}</p>
  <ul class="phrases ${S.hideJa ? 'hide-ja' : ''}">${t.items.map((it) => phraseCard(it, c.id === 'words')).join('')}</ul>
  <div class="sticky-cta"><a class="btn primary block" href="#/q/${c.id}/${t.id}">意味当てクイズに挑戦</a></div>`;
}

/* ---------- クイズ ---------- */
let Q = null;
function startQuiz(pool, title, back, preset) {
  if (!pool.length) {
    $app.innerHTML = topBar(title, back) + `<section class="empty"><p class="big-ico" aria-hidden="true">🎉</p><p>今は出題できる問題がありません。</p><a class="btn primary" href="${back}">もどる</a></section>`;
    return;
  }
  const picks = preset || shuffle(pool).slice(0, 10);
  Q = { title, back, pool, queue: picks.map((it) => ({ it, retry: false })), i: 0, first: picks.length, correct: 0, wrong: [], answered: null, picked: null, showEn: false };
  renderQuestion();
}

function choicesFor(it) {
  const cat = CAT[it.cat];
  const tiers = [cat.topics.find((t) => t.id === it.topic).items, cat.topics.flatMap((t) => t.items), ALL];
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
  return `<section class="feedback ${ok ? 'ok' : 'ng'}">
    <p class="verdict">${ok ? '⭕ 正解！' : '❌ おしい！'}</p>
    <p class="en">${h(q.it.en)}</p>
    <p class="ja">${h(q.it.ja)}${q.it.note ? ` <span class="tag">${h(q.it.note)}</span>` : ''}</p>
    ${!ok ? '<p class="note">このあと、もう一度出題されます。</p>' : ''}
    <p class="say">🗣 お手本のあとに、声に出して言ってみよう</p>
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
    <p class="today-note">今日の学習 ${todayCount()} / ${S.goal}問</p>
  </section>
  ${Q.wrong.length ? `<h2 class="section">まちがえた問題</h2><p class="hint">ホームの「復習する問題」から、あとで復習できます。</p>
  <ul class="phrases">${Q.wrong.map((it) => phraseCard(it, false)).join('')}</ul>` : ''}
  <div class="result-btns">
    <button class="btn primary block" data-act="again">もう一度(新しい10問)</button>
    <a class="btn ghost block" href="#/">ホームへ</a>
  </div>`;
}

function quizRoute(a, b) {
  if (a === 'today') {
    const weak = shuffle(ALL.filter((i) => isWeak(i.id))).slice(0, 4);
    const rest = shuffle(ALL.filter((i) => !weak.includes(i))).slice(0, 10 - weak.length);
    startQuiz(ALL, '今日の10問', '#/', shuffle([...weak, ...rest]));
  } else if (a === 'weak') {
    startQuiz(ALL.filter((i) => isWeak(i.id)), '復習する問題', '#/');
  } else if (a === 'fav') {
    startQuiz(Object.keys(S.fav).map((id) => ITEMS[id]).filter(Boolean), 'お気に入り単語', '#/c/words');
  } else if (CAT[a]) {
    const t = CAT[a].topics.find((x) => x.id === b);
    if (t) startQuiz(t.items, `${t.title} クイズ`, `#/t/${a}/${b}`);
    else startQuiz(CAT[a].topics.flatMap((x) => x.items), `${CAT[a].title} クイズ`, `#/c/${a}`);
  } else {
    renderHome();
  }
}

/* ---------- 学習記録 ---------- */
function renderRecord() {
  const days = Object.values(S.days);
  const studied = days.filter((d) => d.a).length;
  const a = days.reduce((s, d) => s + d.a, 0), c = days.reduce((s, d) => s + d.c, 0);
  const words = ALL.filter((i) => i.cat === 'words');
  const lw = words.filter((i) => isLearned(i.id)).length;
  const phrases = ALL.filter((i) => i.cat !== 'words');
  const lp = phrases.filter((i) => isLearned(i.id)).length;
  const weak = ALL.filter((i) => isWeak(i.id)).sort((x, y) => S.items[y.id].w - S.items[x.id].w);
  const week = [...Array(7)].map((_, k) => { const d = new Date(); d.setDate(d.getDate() - (6 - k)); return { d, n: S.days[dayKey(d)]?.a || 0 }; });
  const max = Math.max(S.goal, ...week.map((w) => w.n));
  const wd = '日月火水木金土';
  $app.innerHTML = `<header class="topbar"><span></span><h1>学習記録</h1><span></span></header>
  <div class="stats">
    <div class="stat"><p class="label">学習日数</p><p class="num">${studied}<span>日</span></p></div>
    <div class="stat"><p class="label">連続</p><p class="num">${streak()}<span>日</span></p></div>
    <div class="stat"><p class="label">正解率</p><p class="num">${a ? pct(c, a) : '–'}<span>${a ? '%' : ''}</span></p></div>
    <div class="stat"><p class="label">解いた問題</p><p class="num">${a}<span>問</span></p></div>
    <div class="stat"><p class="label">覚えた単語</p><p class="num">${lw}<span>/ ${words.length}</span></p></div>
    <div class="stat"><p class="label">覚えたフレーズ</p><p class="num">${lp}<span>/ ${phrases.length}</span></p></div>
  </div>
  <section class="card week">
    <p class="label">この7日間</p>
    <div class="bars">${week.map((w, k) => `<div class="b ${k === 6 ? 'now' : ''}"><span class="v">${w.n || ''}</span><i style="height:${Math.max(4, pct(w.n, max))}%"></i><span class="d">${wd[w.d.getDay()]}</span></div>`).join('')}</div>
    <p class="hint">2回続けて正解すると「覚えた」になります。</p>
  </section>
  <h2 class="section">苦手な問題</h2>
  ${weak.length ? `<a class="btn primary block" href="#/q/weak">苦手な問題を復習する(${weak.length}問)</a>
  <ul class="phrases">${weak.slice(0, 30).map((it) => phraseCard(it, false)).join('')}</ul>` : '<p class="hint">まだありません。クイズでまちがえた問題がここに集まります。</p>'}`;
}

/* ---------- ルーティング ---------- */
function setTab(tab) {
  document.querySelectorAll('.tabbar a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.tab === tab));
}
function route() {
  stopSpeaking();
  const [a, b, c] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  let tab = 'home';
  if (a === 'c' && CAT[b]) { renderCategory(CAT[b]); if (b === 'words') tab = 'words'; }
  else if (a === 't' && CAT[b] && CAT[b].topics.some((t) => t.id === c)) { renderTopic(CAT[b], CAT[b].topics.find((t) => t.id === c)); if (b === 'words') tab = 'words'; }
  else if (a === 'q') { quizRoute(b, c); if (b === 'fav' || b === 'words') tab = 'words'; }
  else if (a === 'r') { renderRecord(); tab = 'record'; }
  else renderHome();
  setTab(tab);
  window.scrollTo(0, 0);
}

/* ---------- 操作 ---------- */
$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
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
      toast(S.fav[it.id] ? 'お気に入りに追加しました' : 'お気に入りから外しました');
      break;
    case 'rate':
      S.rate = +el.dataset.rate; save();
      el.parentElement.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b === el));
      if (Q && location.hash.startsWith('#/q') && Q.queue[Q.i]) speak(Q.queue[Q.i].it.en);
      break;
    case 'qplay': if (Q.queue[Q.i]) speak(Q.queue[Q.i].it.en); break;
    case 'showen': Q.showEn = true; renderQuestion(); break;
    case 'pick': pick(+el.dataset.i); break;
    case 'next':
      Q.i++; Q.answered = null; Q.picked = null; Q.showEn = false;
      renderQuestion(); window.scrollTo(0, 0);
      break;
    case 'again': startQuiz(Q.pool, Q.title, Q.back); window.scrollTo(0, 0); break;
  }
});
$app.addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'hideja') return;
  S.hideJa = e.target.checked; save();
  const list = $app.querySelector('.phrases');
  list?.classList.toggle('hide-ja', S.hideJa);
  list?.querySelectorAll('.revealed').forEach((x) => x.classList.remove('revealed'));
  const hint = $app.querySelector('.hint');
  if (hint) hint.textContent = S.hideJa ? '英文をタップすると意味が表示されます。' : '英文をタップすると音声が流れます。';
});

window.addEventListener('hashchange', route);
route();
