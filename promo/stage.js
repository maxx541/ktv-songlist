// 示範影片的時間軸。所有畫面都是「時間 t 的函數」：render.py 逐格呼叫 step(t) → 推進假時鐘 → post(t) → 截圖。
// 手機框裡跑的是真正的網站（app.js），只是資料層換成假資料；點擊、輸入由這裡依時間觸發。固定鏡頭，不做局部放大。
const YT_LINK = 'https://www.youtube.com/watch?v=KeuXa4_xcf0';
const BILI_LINK = 'https://www.bilibili.com/video/BV1bzBxYdEZc/?spm_id_from=333.788.top_right_bar_window_custom_collection.content.click';
const SHARE = '【【纯k投屏】「IF*Else」——mochari ディメンション凸ラバース!!  ED-哔哩哔哩】 https://b23.tv/Ck414WP';
const NAME = '有地將臣', EVENT = '米娜', PLACE = '好樂迪', DATE = '2026-10-10';

// ---------- 版面常數（舞台座標）----------
const SC = 772 / 390;          // 網站像素 → 舞台像素
const SX0 = 154, SY0 = 229;    // 手機螢幕左上角
const $ = (s) => document.querySelector(s);
const frame = $('#site');
const fdoc = () => frame.contentDocument;
const fwin = () => frame.contentWindow;

// ---------- 小工具 ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, x) => a + (b - a) * x;

// ---------- 時間軸登記 ----------
const ACTIONS = [];   // 依時間觸發一次的動作
const CUES = [];      // 音效提示（music.py 會讀）
const TAPS = [];      // 手指點擊的視覺
const FLASHES = [];   // 貼上時輸入框的閃光 {t0,t1}
const BADGES = [];    // 特別標示 {t0,t1,text,anchor}
const CONFIRMS = [];  // 「已經有人點了」的詢問 {t0,t1,press}
const MENUS = [];     // 假的下拉選單
const RINGS = [];     // 紅框
const JUMPS = [];     // 「點歌曲跳轉到原影片」{t0,t1,key,info}
const SCROLLS = [];   // 清單捲動 {t0,t1,to:()=>y,from}
const q = (sel, i = 0) => [...fdoc().querySelectorAll(sel)][i] || null;
const at = (t, fn, cue) => { ACTIONS.push({ t, fn }); if (cue) CUES.push({ t, type: cue }); };
const cue = (t, type) => CUES.push({ t, type });
const click = (sel, i = 0) => () => { const el = q(sel, i); if (!el) throw new Error('找不到 ' + sel); el.click(); };
const setValue = (sel, value) => () => {
  const el = q(sel); if (!el) throw new Error('找不到 ' + sel);
  el.value = value; el.dispatchEvent(new (fwin().Event)('input', { bubbles: true }));
};
function typeInto(t0, sel, text, cps = 9) {
  const chars = [...text];
  at(t0, () => q(sel)?.focus());
  chars.forEach((_, i) => at(t0 + 0.08 + i / cps, setValue(sel, chars.slice(0, i + 1).join('')), i % 2 === 0 ? 'tick' : null));
  return t0 + 0.08 + chars.length / cps;
}
const selectEvent = (value) => () => {
  const el = q('#event-select'); el.value = value; el.dispatchEvent(new (fwin().Event)('change', { bubbles: true }));
};
const cardByTitle = (key) => [...fdoc().querySelectorAll('.song-card')].find((el) => el.querySelector('.title')?.textContent.includes(key)) || null;
/** 手指點擊：tgt 是 CSS 選擇器、{menu: 項目序號} 或 {card: 標題關鍵字}；act 在點下的瞬間執行（省略＝只有視覺） */
function tap(t, tgt, act, type = 'click') {
  TAPS.push({ t, tgt });
  if (act) ACTIONS.push({ t, fn: act });
  cue(t, type);
}
/** 清單平滑捲動：t0 起算，到 t1 停在 toFn() 算出的位置 */
function scrollTween(t0, t1, toFn) { SCROLLS.push({ t0, t1, toFn, from: null, to: null }); }
const maxScroll = () => Math.max(0, fwin().document.documentElement.scrollHeight - fwin().innerHeight);
const centerOn = (key) => () => { const c = cardByTitle(key); if (!c) return 0; const r = c.getBoundingClientRect(); return clamp(fwin().scrollY + r.top - (fwin().innerHeight - r.height) / 2, 0, maxScroll()); };

// ---------- 時間（秒） ----------
const INTRO_END = 3.6;
const PHONE_IN = [3.2, 4.2];
const S1 = 3.8, S2 = 8.2, S3 = 13.2, S4 = 25.6, S4_END = 38.4;
const PHONE_OUT = [S4_END, S4_END + 0.8], OUTRO_AT = S4_END + 1.0;
const TOTAL = OUTRO_AT + 5.0;

const SCENES = [
  { t0: S1, t1: S2, no: '1', title: '登入', cap: '輸入暱稱就能開始，不用註冊' },
  { t0: S2, t1: S3, no: '2', title: '建立活動', cap: '選擇或新增這次要唱的活動' },
  { t0: S3, t1: S4, no: '3', title: '貼上連結', cap: 'YouTube、B 站連結或手機分享文字，直接貼' },
  { t0: S4, t1: S4_END, no: '4', title: '一目了然', cap: '重複自動標出來，點歌曲直接跳到原影片' },
];
for (const s of SCENES) cue(s.t0 + 0.05, 'swipe');
cue(0.7, 'sparkle'); cue(PHONE_IN[0] - 0.2, 'whoosh'); cue(PHONE_OUT[0] - 0.1, 'whoosh'); cue(OUTRO_AT + 1.3, 'sparkle');

// 場景 1：登入
tap(S1 + 0.8, '#login-form input[name=nickname]', () => q('#login-form input[name=nickname]').focus());
typeInto(S1 + 1.1, '#login-form input[name=nickname]', NAME, 8);
tap(S1 + 2.6, '#login-form button[type=submit]', click('#login-form button[type=submit]'));
at(S1 + 3.0, () => {}, 'ding');

// 場景 2：建立活動
tap(S2 + 0.5, '#event-select');
MENUS.push({ t0: S2 + 0.55, t1: S2 + 1.7, anchor: '#event-select', items: ['上次日K', '＋ 新增活動…'], hover: [[S2 + 0.55, -1], [S2 + 0.85, 0], [S2 + 1.1, 1]] });
tap(S2 + 1.5, { menu: 1 }, selectEvent('__new'));
typeInto(S2 + 2.0, '#event-form input[name=ename]', EVENT, 8);
at(S2 + 2.7, setValue('#event-form input[name=edate]', DATE), 'pop');
typeInto(S2 + 3.0, '#event-form input[name=eplace]', PLACE, 9);
tap(S2 + 3.9, '#event-submit', click('#event-submit'));
at(S2 + 4.1, () => {}, 'ding');

// 場景 3：連貼三次 —— 每一輪：加歌 →（第一輪才要）切到「貼上連結」→ 貼上 → 解析 → 加入
const ADD = '.row-end .btn.primary';
function addLink({ t0, text, first = false, badge = null, dup = false }) {
  tap(t0, '#add-btn', click('#add-btn'));
  let t = t0 + 0.6;
  if (first) { tap(t0 + 0.9, '#source-tabs [data-source="link"]', click('#source-tabs [data-source="link"]')); t = t0 + 1.5; }
  at(t, setValue('#add-body input', text), 'paste');
  FLASHES.push({ t0: t, t1: t + 0.4 });
  tap(t + 0.7, '#add-body form button[type=submit]', click('#add-body form button[type=submit]'));
  cue(t + 1.1, 'pop');
  if (badge) { BADGES.push({ t0: t + 1.0, t1: t + 2.3, text: badge, anchor: '.link-card' }); cue(t + 1.2, 'sparkle'); }
  const tAdd = t + (badge ? 2.5 : 1.7);
  if (dup) {
    tap(tAdd, '#add-body ' + ADD);                                         // 只有視覺：接著跳出「已經有人點了」的詢問
    CONFIRMS.push({ t0: tAdd + 0.25, t1: tAdd + 1.5, press: [tAdd + 1.0, tAdd + 1.2] });
    tap(tAdd + 1.05, '#confirm-go', click('#add-body ' + ADD));  // 按下詢問裡的「加入」才真的送出
    at(tAdd + 1.3, () => {}, 'ding');
    return tAdd + 1.8;
  }
  tap(tAdd, '#add-body ' + ADD, click('#add-body ' + ADD));
  at(tAdd + 0.25, () => {}, 'ding');
  return tAdd + 0.55;
}
const e1 = addLink({ t0: S3 + 0.4, text: YT_LINK, first: true });
const e2 = addLink({ t0: e1 + 0.2, text: BILI_LINK, badge: '支援 B 站連結，自動解析歌名與封面' });
const e3 = addLink({ t0: e2 + 0.2, text: SHARE, dup: true });

// 場景 4：大家的歌（別人也在即時加歌）→ 點歌曲跳轉到原影片
const T4 = S4 + 0.1;
tap(T4, '.tab[data-tab="all"]', click('.tab[data-tab="all"]'));
RINGS.push({ t0: T4 + 0.7, t1: T4 + 1.9, sel: '.dup' }); cue(T4 + 0.7, 'pop');
for (const [t, uid, i] of [[T4 + 2.2, 'u3', 0], [T4 + 2.9, 'u4', 1], [T4 + 3.6, 'u2', 2]]) at(t, () => fwin().__sim(uid, i), 'pop');
scrollTween(T4 + 2.2, T4 + 4.2, () => maxScroll());
// 跳轉 1：點叢雨加的 YouTube 歌
scrollTween(T4 + 4.3, T4 + 4.8, centerOn('Re:TrymenT'));
tap(T4 + 5.2, { card: 'Re:TrymenT' });
JUMPS.push({ t0: T4 + 5.4, t1: T4 + 6.8, key: 'Re:TrymenT', info: null });
// 跳轉 2：點自己貼的 B 站歌
scrollTween(T4 + 6.9, T4 + 7.4, centerOn('いつもこの場所で'));
tap(T4 + 7.8, { card: 'いつもこの場所で' });
JUMPS.push({ t0: T4 + 8.0, t1: T4 + 9.4, key: 'いつもこの場所で', info: null });
scrollTween(T4 + 9.5, T4 + 9.9, () => 0);
tap(T4 + 10.2, '#only-dup', click('#only-dup'));
tap(T4 + 11.0, '#only-dup', click('#only-dup'));
tap(T4 + 11.6, '#event-select');
MENUS.push({ t0: T4 + 11.65, t1: T4 + 12.5, anchor: '#event-select', items: ['上次日K', '米娜', '＋ 新增活動…'], hover: [[T4 + 11.65, -1], [T4 + 11.95, 0]] });
tap(T4 + 12.3, { menu: 0 }, selectEvent('e0'));
for (const j of JUMPS) { at(j.t0 - 0.05, () => { j.info = jumpInfo(j.key); }); cue(j.t0, 'swipe'); cue(j.t1 - 0.3, 'swipe'); }

ACTIONS.sort((a, b) => a.t - b.t);
TAPS.sort((a, b) => a.t - b.t);
CUES.sort((a, b) => a.t - b.t);
// 給 music.py 的段落提示
const SECTIONS = { groove: INTRO_END, arp: S3, full: S4, outro: S4_END, total: TOTAL };

function jumpInfo(key) {
  const c = cardByTitle(key); if (!c) return null;
  const a = c.querySelector('.title'); const img = c.querySelector('img');
  let host = '', path = '';
  try { const u = new URL(a.href); host = u.hostname.replace(/^www\./, ''); path = u.pathname + (u.hostname.includes('youtube') ? u.search.split('&')[0] : ''); } catch { /* ignore */ }
  return { title: a.textContent.trim(), channel: c.querySelector('.sub')?.textContent.trim() || '', img: img ? img.src : '', url: host + path, site: host.includes('bilibili') ? 'bilibili' : 'YouTube' };
}

// ---------- 狀態與座標 ----------
let fired = 0;
let lastT = 0;
function siteRect(sel, i = 0) {
  const el = fdoc() && q(sel, i);
  return el ? rectOf(el) : null;
}
function rectOf(el) {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
const stageOf = (x, y) => [SX0 + x * SC, SY0 + y * SC];
function place(el, siteX, siteY, extraScale = 1) {
  const [X, Y] = stageOf(siteX, siteY);
  el.style.left = X + 'px'; el.style.top = Y + 'px';
  el.style.transform = `scale(${SC * extraScale})`;
}
const activeMenu = () => MENUS.find((m) => lastT >= m.t0 - 0.3 && lastT <= m.t1 + 0.3) || MENUS.find((m) => m.t0 > lastT) || MENUS[MENUS.length - 1];
function menuTarget(i) {
  const m = activeMenu(); const a = siteRect(m.anchor); if (!a) return null;
  return { x: a.x + 40, y: a.y + a.h + 6 + 6 + i * 44 + 22 };
}
function tapPos(tgt) {
  if (typeof tgt === 'string') {
    if (tgt === '#confirm-go') { const el = $('#confirm-go'); if (!el || $('#confirm').style.display === 'none') return null; const r = el.getBoundingClientRect(); return { screen: [r.left + r.width / 2, r.top + r.height / 2] }; }
    const r = siteRect(tgt); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null;
  }
  if (tgt.menu !== undefined) return menuTarget(tgt.menu);
  if (tgt.card) { const c = cardByTitle(tgt.card); const th = c && c.querySelector('.thumb'); const r = th && rectOf(th); return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null; }
  return null;
}

// ---------- 逐格：第一階段（觸發動作、不依賴版面的視覺）----------
window.step = (t) => {
  lastT = t;
  while (fired < ACTIONS.length && ACTIONS[fired].t <= t + 1e-6) {
    try { ACTIONS[fired].fn(); } catch (e) { window.__errors.push(`t=${ACTIONS[fired].t}: ${e.message}`); }
    fired++;
  }
  for (const s of SCROLLS) {
    if (t < s.t0 || t > s.t1 + 1e-6) continue;
    const w = fwin();
    if (s.from === null) { s.from = w.scrollY; s.to = s.toFn(); }
    w.scrollTo(0, lerp(s.from, s.to, ease(seg(t, s.t0, s.t1))));
  }
  introOutro(t);
  headCaption(t);
  $('#bg .b1').style.transform = `translate(${Math.sin(t * 0.5) * 60}px, ${Math.cos(t * 0.4) * 40}px)`;
  $('#bg .b2').style.transform = `translate(${Math.cos(t * 0.4) * 70}px, ${Math.sin(t * 0.45) * 50}px)`;
  $('#bg .b3').style.transform = `translate(${Math.sin(t * 0.35) * 50}px, ${Math.cos(t * 0.42) * 60}px)`;
};

function buildWord(el) {
  if (el.dataset.built) return;
  el.innerHTML = [...'MakoSing'].map((c, i) => `<span style="color:${i >= 4 ? '#8a4fd6' : '#221d2b'}">${c}</span>`).join('');
  el.dataset.built = 1;
}
function introOutro(t) {
  const intro = $('#intro');
  intro.style.display = t < INTRO_END + 0.6 ? 'block' : 'none';
  if (t < INTRO_END + 0.6) {
    const logo = intro.querySelector('.logo');
    const s = easeOutBack(seg(t, 0.1, 0.7));
    logo.style.transform = `scale(${lerp(0.2, 1, s)}) rotate(${lerp(-18, 0, clamp(s))}deg)`;
    logo.style.opacity = seg(t, 0.1, 0.35);
    const word = $('#word'); buildWord(word);
    [...word.children].forEach((sp, i) => { const p = easeOut(seg(t, 0.45 + i * 0.05, 0.8 + i * 0.05)); sp.style.opacity = p; sp.style.transform = `translateY(${(1 - p) * 40}px)`; });
    const s1 = intro.querySelector('.s1'), s2 = intro.querySelector('.s2');
    s1.style.opacity = seg(t, 1.0, 1.4); s1.style.transform = `translateY(${(1 - easeOut(seg(t, 1.0, 1.4))) * 24}px)`;
    s2.style.opacity = seg(t, 1.5, 1.9); s2.style.transform = `translateY(${(1 - easeOut(seg(t, 1.5, 1.9))) * 24}px)`;
    $('#t-intro').style.right = '-70px';
    $('#t-intro').style.transform = `translateY(${(1 - easeOut(seg(t, 0.2, 0.9))) * 700 + ease(seg(t, INTRO_END - 0.5, INTRO_END + 0.1)) * 900}px)`;
    intro.style.opacity = 1 - ease(seg(t, INTRO_END - 0.5, INTRO_END + 0.1));
  }
  const outro = $('#outro');
  outro.style.display = t > OUTRO_AT ? 'block' : 'none';
  if (t > OUTRO_AT) {
    const u = t - OUTRO_AT;
    const logo = outro.querySelector('.logo');
    const s = easeOutBack(seg(u, 0.2, 0.8));
    logo.style.transform = `scale(${lerp(0.3, 1, s)})`; logo.style.opacity = seg(u, 0.2, 0.45);
    const word = $('#word2'); buildWord(word);
    [...word.children].forEach((sp, i) => { const p = easeOut(seg(u, 0.5 + i * 0.05, 0.85 + i * 0.05)); sp.style.opacity = p; sp.style.transform = `translateY(${(1 - p) * 36}px)`; });
    const a = outro.querySelector('.s1'), b = outro.querySelector('.s2');
    a.style.opacity = seg(u, 1.1, 1.5); a.style.transform = `translateY(${(1 - easeOut(seg(u, 1.1, 1.5))) * 22}px)`;
    b.style.opacity = seg(u, 1.7, 2.1); b.style.transform = `translateY(${(1 - easeOut(seg(u, 1.7, 2.1))) * 22}px)`;
    $('#t-out-l').style.transform = `translateY(${(1 - easeOut(seg(u, 0.3, 1.1))) * 900}px)`;
    $('#t-out-r').style.transform = `translateY(${(1 - easeOut(seg(u, 0.5, 1.3))) * 900}px)`;
  }
  $('#fade').style.opacity = clamp(seg(t, TOTAL - 0.8, TOTAL) + (1 - seg(t, 0, 0.3)));
}

function headCaption(t) {
  const sc = SCENES.find((s) => t >= s.t0 && t < s.t1);
  const head = $('#head'), cap = $('#cap');
  if (!sc) { head.style.opacity = 0; cap.style.opacity = 0; }
  else {
    if (head.dataset.no !== sc.no) { $('#step-no').textContent = sc.no; $('#step-title').textContent = sc.title; cap.textContent = sc.cap; head.dataset.no = sc.no; }
    const inP = easeOut(seg(t, sc.t0 + 0.05, sc.t0 + 0.4)); const outP = ease(seg(t, sc.t1 - 0.25, sc.t1));
    head.style.opacity = inP * (1 - outP); head.style.transform = `translateY(${(1 - inP) * -30}px)`;
    const inC = easeOut(seg(t, sc.t0 + 0.15, sc.t0 + 0.55));
    cap.style.opacity = inC * (1 - outP); cap.style.transform = `translateY(${(1 - inC) * 30}px)`;
  }
  const ph = $('#phone');
  const inP = easeOut(seg(t, PHONE_IN[0], PHONE_IN[1])); const outP = ease(seg(t, PHONE_OUT[0], PHONE_OUT[1]));
  ph.style.transform = `translateY(${(1 - inP) * 1700 + outP * 1800}px) scale(${lerp(0.94, 1, inP)})`;
  ph.style.opacity = t < PHONE_IN[0] || t > PHONE_OUT[1] ? 0 : 1;
}

// ---------- 逐格：第二階段（要看版面才能算的：手指、疊層）----------
window.post = (t) => {
  touch(t);

  const menuEl = $('#menu'); menuEl.style.display = 'none';
  for (const m of MENUS) {
    if (t >= m.t0 && t <= m.t1) {
      const a = siteRect(m.anchor); if (!a) continue;
      const idx = m.hover.reduce((acc, [tt, v]) => (t >= tt ? v : acc), -1);
      menuEl.innerHTML = m.items.map((it, i) => `<div class="${i === idx ? 'on' : ''}">${it}</div>`).join('');
      menuEl.style.display = 'block'; menuEl.style.width = a.w + 'px';
      place(menuEl, a.x, a.y + a.h + 6);
      menuEl.style.opacity = easeOut(seg(t, m.t0, m.t0 + 0.15)) * (1 - seg(t, m.t1 - 0.1, m.t1));
    }
  }
  const conf = $('#confirm'), shade = $('#shade');
  const cf = CONFIRMS.find((c) => t >= c.t0 && t <= c.t1);
  conf.style.display = cf ? 'block' : 'none'; shade.style.display = cf ? 'block' : 'none';
  if (cf) {
    const pr = easeOut(seg(t, cf.t0, cf.t0 + 0.2));
    place(conf, (390 - 310) / 2, 250 + (1 - pr) * 24); conf.style.opacity = pr;
    const [sx, sy] = stageOf(0, 0);
    Object.assign(shade.style, { left: sx + 'px', top: sy + 'px', width: 390 * SC + 'px', height: 774 * SC + 'px', transform: 'none' });
    conf.querySelector('#confirm-go').classList.toggle('press', t >= cf.press[0] && t <= cf.press[1]);
  }
  for (let i = 0; i < 3; i++) {
    const ring = $('#ring' + i); ring.style.display = 'none';
    for (const R of RINGS) {
      if (t < R.t0 || t > R.t1) continue;
      const el = [...fdoc().querySelectorAll(R.sel)].filter((e) => e.classList.contains('same'))[i]; if (!el) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > 774) continue;
      place(ring, r.left - 6, r.top - 5); ring.style.width = r.width + 12 + 'px'; ring.style.height = r.height + 10 + 'px';
      ring.style.display = 'block'; ring.style.opacity = seg(t, R.t0 + i * 0.1, R.t0 + 0.25 + i * 0.1) * (1 - seg(t, R.t1 - 0.25, R.t1));
      ring.style.transform += ` scale(${1 + 0.06 * Math.sin((t - R.t0) * 9)})`; ring.style.transformOrigin = '50% 50%';
    }
  }
  const fl = $('#flash'); fl.style.display = 'none';
  const F = FLASHES.find((f) => t >= f.t0 && t <= f.t1);
  if (F) { const r = siteRect('#add-body input'); if (r) { place(fl, r.x - 3, r.y - 3); fl.style.width = r.w + 6 + 'px'; fl.style.height = r.h + 6 + 'px'; fl.style.display = 'block'; fl.style.opacity = 1 - seg(t, F.t0, F.t1); } }
  const badge = $('#badge'); badge.style.display = 'none';
  const B = BADGES.find((b) => t >= b.t0 && t <= b.t1);
  if (B) {
    const r = siteRect(B.anchor);
    if (r) {
      badge.textContent = B.text; badge.style.display = 'block';
      place(badge, r.x + 14, r.y + 14); // 貼在封面圖的左上角，不蓋住輸入框
      const pr = easeOutBack(seg(t, B.t0, B.t0 + 0.3));
      badge.style.opacity = clamp(pr) * (1 - seg(t, B.t1 - 0.2, B.t1));
      badge.style.transform += ` scale(${lerp(0.8, 1, clamp(pr))})`;
    }
  }
  jumpPage(t);
};

/** 「點歌曲直接跳到原影片」：模擬瀏覽器打開影片頁面（從右邊滑進來，停一下再滑回去） */
function jumpPage(t) {
  const el = $('#jump'); el.style.display = 'none';
  const J = JUMPS.find((j) => t >= j.t0 && t <= j.t1);
  if (!J || !J.info) return;
  if (el.dataset.key !== J.key) {
    el.dataset.key = J.key;
    $('#jimg').src = J.info.img; $('#jtitle').textContent = J.info.title; $('#jchan').textContent = J.info.channel;
    $('#jurl').textContent = J.info.url; $('#jsite').textContent = J.info.site;
    el.dataset.site = J.info.site;
  }
  const inP = easeOut(seg(t, J.t0, J.t0 + 0.28)); const outP = ease(seg(t, J.t1 - 0.28, J.t1));
  el.style.display = 'block';
  el.style.transform = `translateX(${(1 - inP) * 772 + outP * 772}px)`;
  const prog = seg(t, J.t0 + 0.3, J.t1 - 0.2);
  $('#jprog').style.width = `${prog * 100}%`;
  $('#jplay').style.transform = `translate(-50%, -50%) scale(${1 + 0.05 * Math.sin((t - J.t0) * 8)})`;
  const note = $('#jnote'); note.style.opacity = easeOut(seg(t, J.t0 + 0.25, J.t0 + 0.5)) * (1 - seg(t, J.t1 - 0.4, J.t1 - 0.2));
}

function touch(t) {
  const el = $('#touch'), rip = $('#ripple');
  el.style.display = 'none'; rip.style.display = 'none';
  const prevDefault = { x: 330, y: 760 };
  for (let i = 0; i < TAPS.length; i++) {
    const tp = TAPS[i];
    const start = tp.t - 0.55, end = tp.t + 0.4;
    if (t < start || t > end) continue;
    if (TAPS[i + 1] && t > TAPS[i + 1].t - 0.55) continue;
    const pos = tapPos(tp.tgt); if (!pos) return;
    const to = toStage(pos);
    let from = prevDefault;
    if (i) { const pp = tapPos(TAPS[i - 1].tgt); from = pp ? pp : prevDefault; }
    const fromS = toStage(from);
    const p = ease(seg(t, start, tp.t - 0.08));
    const press = t > tp.t - 0.08 && t < tp.t + 0.1 ? 0.82 : 1;
    placeStage(el, lerp(fromS[0], to[0], p), lerp(fromS[1], to[1], p), press);
    el.style.display = 'block'; el.style.opacity = seg(t, start, start + 0.15) * (1 - seg(t, tp.t + 0.2, end));
    if (t >= tp.t && t < tp.t + 0.35) {
      const rp = seg(t, tp.t, tp.t + 0.35);
      placeStage(rip, to[0], to[1], lerp(0.8, 2.2, easeOut(rp))); rip.style.display = 'block'; rip.style.opacity = 1 - rp;
    }
    return;
  }
}
/** 點的位置統一成「畫面座標」：網站像素換成舞台座標；已經是畫面座標（{screen}）就直接用 */
function toStage(pos) { return pos.screen ? pos.screen : stageOf(pos.x, pos.y); }
function placeStage(el, vx, vy, extra = 1) { el.style.left = vx + 'px'; el.style.top = vy + 'px'; el.style.transform = `scale(${SC * extra})`; }

window.CUES = CUES;
window.SECTIONS = SECTIONS;
window.TOTAL = TOTAL;
window.__errors = [];
