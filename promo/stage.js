// 示範影片的時間軸。所有畫面都是「時間 t 的函數」：render.py 逐格呼叫 step(t) → 推進假時鐘 → post(t) → 截圖。
// 手機框裡跑的是真正的網站（app.js），只是資料層換成假資料；點擊、輸入由這裡依時間觸發。
const YT_LINK = 'https://www.youtube.com/watch?v=KeuXa4_xcf0';
const BILI_LINK = 'https://www.bilibili.com/video/BV1bzBxYdEZc/?spm_id_from=333.788.top_right_bar_window_custom_collection.content.click';
const SHARE = '【【纯k投屏】「IF*Else」——mochari ディメンション凸ラバース!!  ED-哔哩哔哩】 https://b23.tv/Ck414WP';
const TOTAL = 60.2;
const PHONE_IN = [4.0, 5.2], PHONE_OUT = [52.6, 53.6], OUTRO_AT = 53.8;

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
/** keys: [[t, value], ...]；段與段之間用 fn 平滑 */
function track(keys, t, fn = ease) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) return lerp(keys[i - 1][1], keys[i][1], fn(seg(t, keys[i - 1][0], keys[i][0])));
  }
  return keys[keys.length - 1][1];
}

// ---------- 時間軸登記 ----------
const ACTIONS = [];   // 依時間觸發一次的動作
const CUES = [];      // 音效提示（music.py 會讀）
const TAPS = [];      // 手指點擊的視覺
const FLASHES = [];   // 貼上時輸入框的閃光 {t0,t1}
const BADGES = [];    // 特別標示 {t0,t1,text,anchor}
const CONFIRMS = [];  // 「已經有人點了」的詢問 {t0,t1,press}
const MENUS = [];     // 假的下拉選單
const RINGS = [];     // 紅框
const q = (sel, i = 0) => [...fdoc().querySelectorAll(sel)][i] || null;
const at = (t, fn, cue) => { ACTIONS.push({ t, fn }); if (cue) CUES.push({ t, type: cue }); };
const cue = (t, type) => CUES.push({ t, type });
const click = (sel, i = 0) => () => { const el = q(sel, i); if (!el) throw new Error('找不到 ' + sel); el.click(); };
const setValue = (sel, value) => () => {
  const el = q(sel); if (!el) throw new Error('找不到 ' + sel);
  el.value = value; el.dispatchEvent(new (fwin().Event)('input', { bubbles: true }));
};
function typeInto(t0, sel, text, cps = 6) {
  const chars = [...text];
  at(t0, () => q(sel)?.focus());
  chars.forEach((_, i) => at(t0 + 0.12 + i / cps, setValue(sel, chars.slice(0, i + 1).join('')), i % 2 === 0 ? 'tick' : null));
  return t0 + 0.12 + chars.length / cps;
}
const selectEvent = (value) => () => {
  const el = q('#event-select'); el.value = value; el.dispatchEvent(new (fwin().Event)('change', { bubbles: true }));
};
/** 手指點擊：tgt 是 CSS 選擇器或 {menu: 項目序號}；act 在點下的瞬間執行（省略＝只有視覺） */
function tap(t, tgt, act, type = 'click') {
  TAPS.push({ t, tgt });
  if (act) ACTIONS.push({ t, fn: act });
  cue(t, type);
}

// ---------- 場景 ----------
const SCENES = [
  { t0: 4.4, t1: 12.4, no: '1', title: '登入', cap: '輸入暱稱就能開始，不用註冊' },
  { t0: 12.4, t1: 22.4, no: '2', title: '建立活動', cap: '選擇或新增這次要唱的活動' },
  { t0: 22.4, t1: 41.8, no: '3', title: '貼上連結', cap: 'YouTube、B 站連結或手機分享文字，直接貼' },
  { t0: 41.8, t1: 52.6, no: '4', title: '一目了然', cap: '重複的歌自動標出來，大家的歌即時同步' },
];
for (const s of SCENES) cue(s.t0 + 0.05, 'swipe');
cue(1.0, 'sparkle'); cue(3.9, 'whoosh'); cue(52.5, 'whoosh'); cue(56.0, 'sparkle');

// 場景 1：登入
tap(6.0, '#login-form input[name=nickname]', () => q('#login-form input[name=nickname]').focus());
typeInto(6.3, '#login-form input[name=nickname]', '小明', 5);
tap(7.7, '#login-form button[type=submit]', click('#login-form button[type=submit]'));
at(8.4, () => {}, 'ding');

// 場景 2：建立活動
tap(12.9, '#event-select');
MENUS.push({ t0: 12.95, t1: 14.9, anchor: '#event-select', items: ['社課迎新', '＋ 新增活動…'], hover: [[12.95, -1], [13.6, 0], [14.0, 1]] });
tap(14.5, { menu: 1 }, selectEvent('__new'));
typeInto(15.3, '#event-form input[name=ename]', '週五日K', 5);
at(16.5, setValue('#event-form input[name=edate]', '2026-10-10'), 'pop');
typeInto(17.0, '#event-form input[name=eplace]', '好樂迪', 5);
tap(18.3, '#event-submit', click('#event-submit'));
at(18.5, () => {}, 'ding');

// 場景 3：連貼三次 —— 每一輪：加歌 →（第一輪才要）切到「貼上連結」→ 貼上 → 解析 → 看結果 → 加入
const ADD = '.row-end .btn.primary';
function addLink({ t0, text, first = false, badge = null, dup = false }) {
  tap(t0, '#add-btn', click('#add-btn'));
  let t = t0 + 0.9;
  if (first) { tap(t0 + 1.2, '#source-tabs [data-source="link"]', click('#source-tabs [data-source="link"]')); t = t0 + 2.0; }
  at(t, setValue('#add-body input', text), 'paste');
  FLASHES.push({ t0: t, t1: t + 0.6 });
  tap(t + 1.0, '#add-body form button[type=submit]', click('#add-body form button[type=submit]'));
  cue(t + 1.5, 'pop');
  if (badge) { BADGES.push({ t0: t + 1.5, t1: t + 3.6, text: badge, anchor: '.link-card' }); cue(t + 1.9, 'sparkle'); }
  const tAdd = t + (badge ? 3.8 : 2.4) + (dup ? 0.4 : 0);
  CAMS.push([t + 1.3, '.link-card'], [dup ? tAdd + 0.1 : tAdd - 0.2, null]);
  if (dup) {
    tap(tAdd, '#add-body ' + ADD);                                         // 只有視覺：接著跳出「已經有人點了」的詢問
    CONFIRMS.push({ t0: tAdd + 0.3, t1: tAdd + 1.9, press: [tAdd + 1.35, tAdd + 1.6] });
    tap(tAdd + 1.45, '#confirm-go', click('#add-body ' + ADD));             // 按下詢問裡的「加入」才真的送出
    at(tAdd + 1.7, () => {}, 'ding');
    return tAdd + 2.4;
  }
  tap(tAdd, '#add-body ' + ADD, click('#add-body ' + ADD));
  at(tAdd + 0.3, () => {}, 'ding');
  return tAdd + 0.8;
}
const CAMS = [];   // 場景 3 內動態產生的攝影機關鍵點：[t, 目標]
const e1 = addLink({ t0: 22.9, text: YT_LINK, first: true });
const e2 = addLink({ t0: e1 + 0.5, text: BILI_LINK, badge: '支援 B 站連結，自動解析歌名與封面' });
const e3 = addLink({ t0: e2 + 0.5, text: SHARE, badge: null, dup: true });

// 場景 4：大家的歌（別人也在即時加歌）
const T4 = 41.9;
tap(T4, '.tab[data-tab="all"]', click('.tab[data-tab="all"]'));
RINGS.push({ t0: T4 + 0.9, t1: T4 + 2.6, sel: '.dup' }); cue(T4 + 0.9, 'pop');
for (const [t, uid, i] of [[T4 + 3.2, 'u3', 0], [T4 + 4.4, 'u4', 1], [T4 + 5.6, 'u2', 2]]) at(t, () => fwin().__sim(uid, i), 'pop');
const SCROLL = [[T4 + 3.0, 0], [T4 + 3.4, 0], [T4 + 6.6, 1]];   // 1＝捲到底
tap(T4 + 7.2, '#only-dup', () => { fwin().scrollTo(0, 0); click('#only-dup')(); });
tap(T4 + 8.4, '#only-dup', () => { click('#only-dup')(); fwin().scrollTo(0, 0); });
tap(T4 + 9.1, '#event-select');
MENUS.push({ t0: T4 + 9.15, t1: T4 + 10.4, anchor: '#event-select', items: ['社課迎新', '週五日K', '＋ 新增活動…'], hover: [[T4 + 9.15, -1], [T4 + 9.6, 0]] });
tap(T4 + 10.0, { menu: 0 }, selectEvent('e0'));

ACTIONS.sort((a, b) => a.t - b.t);
TAPS.sort((a, b) => a.t - b.t);
CUES.sort((a, b) => a.t - b.t);

// 攝影機：[t, 倍率, 目標]。目標是選擇器或 null（回到整體）
const CAM_KEYS = [[0, 1, null], [18.8, 1, null], [19.6, 1.55, '#event-select'], [21.6, 1.55, '#event-select'], [22.2, 1, null]];
for (const [t, target] of CAMS) CAM_KEYS.push(target ? [t, 1.45, target] : [t, 1, null]);
CAM_KEYS.push([T4 + 0.5, 1, null], [T4 + 1.0, 1.25, '.song-card .dup, .my-row .dup'], [T4 + 2.4, 1.25, '.song-card .dup, .my-row .dup'], [T4 + 3.0, 1, null]);
CAM_KEYS.sort((a, b) => a[0] - b[0]);
// 同一個目標要連著放大的時段，中間不要先縮回 1：把「縮回」和下一個「放大」之間太近的關鍵點拿掉
for (let i = CAM_KEYS.length - 2; i > 0; i--) { if (CAM_KEYS[i][1] === 1 && CAM_KEYS[i][2] === null && CAM_KEYS[i + 1][1] > 1 && CAM_KEYS[i + 1][0] - CAM_KEYS[i][0] < 0.6) CAM_KEYS.splice(i, 1); }

// ---------- 狀態與座標 ----------
let fired = 0;
let lastT = 0;
function siteRect(sel, i = 0) {
  const el = fdoc() && q(sel, i);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
const stageOf = (x, y) => [SX0 + x * SC, SY0 + y * SC];
const cam = { k: 1, cx: 540, cy: 960 };
const view = (X, Y) => [540 + (X - cam.cx) * cam.k, 960 + (Y - cam.cy) * cam.k];
function place(el, siteX, siteY, extraScale = 1) {
  const [X, Y] = stageOf(siteX, siteY);
  const [vx, vy] = view(X, Y);
  el.style.left = vx + 'px'; el.style.top = vy + 'px';
  el.style.transform = `scale(${SC * cam.k * extraScale})`;
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
  return null;
}

// ---------- 逐格：第一階段（觸發動作、不依賴版面的視覺）----------
window.step = (t) => {
  lastT = t;
  while (fired < ACTIONS.length && ACTIONS[fired].t <= t + 1e-6) {
    try { ACTIONS[fired].fn(); } catch (e) { window.__errors.push(`t=${ACTIONS[fired].t}: ${e.message}`); }
    fired++;
  }
  if (t >= SCROLL[0][0] && t <= T4 + 7.1) {
    const w = fwin(); const max = Math.max(0, w.document.documentElement.scrollHeight - w.innerHeight);
    w.scrollTo(0, track(SCROLL, t, ease) * max);
  }
  introOutro(t);
  headCaption(t);
  $('#bg .b1').style.transform = `translate(${Math.sin(t * 0.35) * 60}px, ${Math.cos(t * 0.3) * 40}px)`;
  $('#bg .b2').style.transform = `translate(${Math.cos(t * 0.28) * 70}px, ${Math.sin(t * 0.33) * 50}px)`;
  $('#bg .b3').style.transform = `translate(${Math.sin(t * 0.25) * 50}px, ${Math.cos(t * 0.31) * 60}px)`;
};

function buildWord(el) {
  if (el.dataset.built) return;
  el.innerHTML = [...'MakoSing'].map((c, i) => `<span style="color:${i >= 4 ? '#8a4fd6' : '#221d2b'}">${c}</span>`).join('');
  el.dataset.built = 1;
}
function introOutro(t) {
  const intro = $('#intro');
  intro.style.display = t < 5 ? 'block' : 'none';
  if (t < 5) {
    const logo = intro.querySelector('.logo');
    const s = easeOutBack(seg(t, 0.2, 0.95));
    logo.style.transform = `scale(${lerp(0.2, 1, s)}) rotate(${lerp(-18, 0, clamp(s))}deg)`;
    logo.style.opacity = seg(t, 0.2, 0.5);
    const word = $('#word'); buildWord(word);
    [...word.children].forEach((sp, i) => { const p = easeOut(seg(t, 0.7 + i * 0.07, 1.15 + i * 0.07)); sp.style.opacity = p; sp.style.transform = `translateY(${(1 - p) * 40}px)`; });
    const s1 = intro.querySelector('.s1'), s2 = intro.querySelector('.s2');
    s1.style.opacity = seg(t, 1.5, 2.0); s1.style.transform = `translateY(${(1 - easeOut(seg(t, 1.5, 2.0))) * 24}px)`;
    s2.style.opacity = seg(t, 2.3, 2.9); s2.style.transform = `translateY(${(1 - easeOut(seg(t, 2.3, 2.9))) * 24}px)`;
    const tc = $('#t-intro');
    tc.style.right = '-70px'; tc.style.transform = `translateY(${(1 - easeOut(seg(t, 0.4, 1.5))) * 700 + ease(seg(t, 3.9, 4.6)) * 900}px)`;
    intro.style.opacity = 1 - ease(seg(t, 3.9, 4.6));
  }
  const outro = $('#outro');
  outro.style.display = t > OUTRO_AT ? 'block' : 'none';
  if (t > OUTRO_AT) {
    const u = t - OUTRO_AT;
    const logo = outro.querySelector('.logo');
    const s = easeOutBack(seg(u, 0.3, 1.0));
    logo.style.transform = `scale(${lerp(0.3, 1, s)})`; logo.style.opacity = seg(u, 0.3, 0.6);
    const word = $('#word2'); buildWord(word);
    [...word.children].forEach((sp, i) => { const p = easeOut(seg(u, 0.7 + i * 0.06, 1.1 + i * 0.06)); sp.style.opacity = p; sp.style.transform = `translateY(${(1 - p) * 36}px)`; });
    const a = outro.querySelector('.s1'), b = outro.querySelector('.s2');
    a.style.opacity = seg(u, 1.5, 2.0); a.style.transform = `translateY(${(1 - easeOut(seg(u, 1.5, 2.0))) * 22}px)`;
    b.style.opacity = seg(u, 2.2, 2.7); b.style.transform = `translateY(${(1 - easeOut(seg(u, 2.2, 2.7))) * 22}px)`;
    $('#t-out-l').style.transform = `translateY(${(1 - easeOut(seg(u, 0.5, 1.6))) * 900}px)`;
    $('#t-out-r').style.transform = `translateY(${(1 - easeOut(seg(u, 0.8, 1.9))) * 900}px)`;
  }
  $('#fade').style.opacity = clamp(seg(t, TOTAL - 1.0, TOTAL) + (1 - seg(t, 0, 0.35)));
}

function headCaption(t) {
  const sc = SCENES.find((s) => t >= s.t0 && t < s.t1);
  const head = $('#head'), cap = $('#cap');
  if (!sc) { head.style.opacity = 0; cap.style.opacity = 0; }
  else {
    if (head.dataset.no !== sc.no) { $('#step-no').textContent = sc.no; $('#step-title').textContent = sc.title; cap.textContent = sc.cap; head.dataset.no = sc.no; }
    const inP = easeOut(seg(t, sc.t0 + 0.1, sc.t0 + 0.6)); const outP = ease(seg(t, sc.t1 - 0.35, sc.t1));
    head.style.opacity = inP * (1 - outP); head.style.transform = `translateY(${(1 - inP) * -30}px)`;
    const inC = easeOut(seg(t, sc.t0 + 0.3, sc.t0 + 0.9));
    cap.style.opacity = inC * (1 - outP); cap.style.transform = `translateY(${(1 - inC) * 30}px)`;
  }
  const ph = $('#phone');
  const inP = easeOut(seg(t, PHONE_IN[0], PHONE_IN[1])); const outP = ease(seg(t, PHONE_OUT[0], PHONE_OUT[1]));
  ph.style.transform = `translateY(${(1 - inP) * 1700 + outP * 1800}px) scale(${lerp(0.94, 1, inP)})`;
  ph.style.opacity = t < PHONE_IN[0] || t > PHONE_OUT[1] ? 0 : 1;
}

// ---------- 逐格：第二階段（要看版面才能算的：攝影機、手指、疊層）----------
function camPoint(sel) {
  if (!sel) return [540, 960];
  const r = siteRect(sel); if (!r) return [540, 960];
  const [X, Y] = stageOf(r.x + r.w / 2, r.y + r.h / 2);
  return [lerp(540, X, 0.82), lerp(960, Y, 0.82)];
}
window.post = (t) => {
  let k = 1, cx = 540, cy = 960;
  for (let i = 1; i < CAM_KEYS.length; i++) {
    const [t0, k0, g0] = CAM_KEYS[i - 1], [t1, k1, g1] = CAM_KEYS[i];
    if (t <= t1 || i === CAM_KEYS.length - 1) {
      const p = ease(seg(t, t0, t1)); const c0 = camPoint(g0), c1 = camPoint(g1);
      k = lerp(k0, k1, p); cx = lerp(c0[0], c1[0], p); cy = lerp(c0[1], c1[1], p);
      break;
    }
  }
  Object.assign(cam, { k, cx, cy });
  $('#cam').style.transform = `translate(${540 - cx * k}px, ${960 - cy * k}px) scale(${k})`;
  // 放大時手機會蓋過標題與字幕，所以放大的時候把它們淡出
  const dim = 1 - clamp((k - 1) / 0.12);
  $('#head').style.opacity = Number($('#head').style.opacity) * dim;
  $('#cap').style.opacity = Number($('#cap').style.opacity) * dim;
  touch(t);

  const menuEl = $('#menu'); menuEl.style.display = 'none';
  for (const m of MENUS) {
    if (t >= m.t0 && t <= m.t1) {
      const a = siteRect(m.anchor); if (!a) continue;
      const idx = m.hover.reduce((acc, [tt, v]) => (t >= tt ? v : acc), -1);
      menuEl.innerHTML = m.items.map((it, i) => `<div class="${i === idx ? 'on' : ''}">${it}</div>`).join('');
      menuEl.style.display = 'block'; menuEl.style.width = a.w + 'px';
      place(menuEl, a.x, a.y + a.h + 6);
      menuEl.style.opacity = easeOut(seg(t, m.t0, m.t0 + 0.2)) * (1 - seg(t, m.t1 - 0.12, m.t1));
    }
  }
  const conf = $('#confirm'), shade = $('#shade');
  const cf = CONFIRMS.find((c) => t >= c.t0 && t <= c.t1);
  conf.style.display = cf ? 'block' : 'none'; shade.style.display = cf ? 'block' : 'none';
  if (cf) {
    const pr = easeOut(seg(t, cf.t0, cf.t0 + 0.25));
    place(conf, (390 - 310) / 2, 250 + (1 - pr) * 24); conf.style.opacity = pr;
    const [sx, sy] = stageOf(0, 0); const [vx, vy] = view(sx, sy);
    Object.assign(shade.style, { left: vx + 'px', top: vy + 'px', width: 390 * SC * cam.k + 'px', height: 774 * SC * cam.k + 'px', transform: 'none' });
    conf.querySelector('#confirm-go').classList.toggle('press', t >= cf.press[0] && t <= cf.press[1]);
  }
  for (let i = 0; i < 3; i++) {
    const ring = $('#ring' + i); ring.style.display = 'none';
    for (const R of RINGS) {
      if (t < R.t0 || t > R.t1) continue;
      const el = [...fdoc().querySelectorAll(R.sel)].filter((e) => e.classList.contains('same'))[i]; if (!el) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > 774) continue;
      place(ring, r.left - 6, r.top - 5); ring.style.width = r.width + 12 + 'px'; ring.style.height = r.height + 10 + 'px';
      ring.style.display = 'block'; ring.style.opacity = seg(t, R.t0 + i * 0.12, R.t0 + 0.3 + i * 0.12) * (1 - seg(t, R.t1 - 0.3, R.t1));
      ring.style.transform += ` scale(${1 + 0.06 * Math.sin((t - R.t0) * 7)})`; ring.style.transformOrigin = '50% 50%';
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
      const pr = easeOutBack(seg(t, B.t0, B.t0 + 0.4));
      badge.style.opacity = clamp(pr) * (1 - seg(t, B.t1 - 0.3, B.t1));
      badge.style.transform += ` scale(${lerp(0.8, 1, clamp(pr))})`;
    }
  }
};

function touch(t) {
  const el = $('#touch'), rip = $('#ripple');
  el.style.display = 'none'; rip.style.display = 'none';
  const prevDefault = { x: 330, y: 760 };
  for (let i = 0; i < TAPS.length; i++) {
    const tp = TAPS[i];
    const start = tp.t - 0.8, end = tp.t + 0.5;
    if (t < start || t > end) continue;
    if (TAPS[i + 1] && t > TAPS[i + 1].t - 0.8) continue;
    const pos = tapPos(tp.tgt); if (!pos) return;
    const to = toStage(pos);
    let from = prevDefault;
    if (i) { const pp = tapPos(TAPS[i - 1].tgt); from = pp ? pp : prevDefault; }
    const fromS = toStage(from);
    const p = ease(seg(t, start, tp.t - 0.1));
    const press = t > tp.t - 0.1 && t < tp.t + 0.12 ? 0.82 : 1;
    placeStage(el, lerp(fromS[0], to[0], p), lerp(fromS[1], to[1], p), press);
    el.style.display = 'block'; el.style.opacity = seg(t, start, start + 0.2) * (1 - seg(t, tp.t + 0.25, end));
    if (t >= tp.t && t < tp.t + 0.45) {
      const rp = seg(t, tp.t, tp.t + 0.45);
      placeStage(rip, to[0], to[1], lerp(0.8, 2.2, easeOut(rp))); rip.style.display = 'block'; rip.style.opacity = 1 - rp;
    }
    return;
  }
}
/** 點的位置統一成「最後畫面座標」：網站像素會套用攝影機；已經是畫面座標（{screen}）就直接用 */
function toStage(pos) {
  if (pos.screen) return pos.screen;
  const [X, Y] = stageOf(pos.x, pos.y); return view(X, Y);
}
function placeStage(el, vx, vy, extra = 1) {
  el.style.left = vx + 'px'; el.style.top = vy + 'px'; el.style.transform = `scale(${SC * cam.k * extra})`;
}

window.CUES = CUES;
window.TOTAL = TOTAL;
window.__errors = [];
