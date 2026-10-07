// MakoSing — 前端畫面
import { extractVideoId, thumbnailFor, findDuplicates, youtubeSearchUrl, embedUrl } from './shared.js';
import { tachie } from './tachie.js';
import * as store from './store.js';
import * as yt from './youtube.js';

const $ = (sel, root = document) => root.querySelector(sel);

const S = {
  authUser: null,
  me: null,          // 自己的個人資料（users/{uid}）
  sessionKnown: false,
  dataReady: false,
  users: new Map(),
  events: [],        // 所有活動
  allSongs: [],      // 所有活動的歌
  songs: [],         // 目前參與活動的歌（allSongs 篩出來的，畫面與重複判斷都只看這個）
  dups: new Map(),   // songId -> [{song, level}]
  tab: 'all',
  filter: '',
  onlyDup: false,
};

// ---------- 工具 ----------
const ICONS = {
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
};
function icon(name) {
  const span = document.createElement('span');
  span.className = 'ic-wrap';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg class="ic" viewBox="0 0 24 24">${ICONS[name]}</svg>`; // 內容是上面的固定字串
  return span;
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, kind === 'error' ? 5000 : 2600);
}

const safeHref = (url) => (/^https?:\/\//i.test(url || '') ? url : '#');
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function thumb(song, cls = '') {
  const src = song.videoId ? thumbnailFor(song.videoId, song.thumb) : null;
  const label = /youtube\.com\/results/.test(song.url || '') ? 'YouTube 搜尋' : (hostOf(song.url) || '連結');
  const ph = () => h('span', { class: 'ph' }, h('span', { class: 'ph-icon' }, icon('note')), h('span', { class: 'ph-host' }, label));
  const a = h('a', { class: `thumb ${cls}`, href: safeHref(song.url), target: '_blank', rel: 'noopener noreferrer', tabindex: '-1', 'aria-hidden': 'true' });
  if (src) {
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(ph()), { once: true });
    a.append(img);
  } else {
    a.append(ph());
  }
  return a;
}

const nicknameOf = (userId) => S.users.get(userId)?.nickname || '（未命名）';

function avatar(user, size = 28) {
  const initial = [...(user?.nickname || '?')][0];
  const fallback = () => h('span', { class: 'avatar', style: `width:${size}px;height:${size}px` }, initial);
  if (user?.avatar) {
    const img = h('img', { class: 'avatar', src: user.avatar, alt: '', width: size, height: size, referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
    return img;
  }
  return fallback();
}

/** 把重複清單變成「小華、小明 也點了」這種文字 */
function dupText(dups, forUserId) {
  if (!dups?.length) return null;
  const names = [...new Set(dups.map((d) => (d.song.userId === S.me?.id ? '你' : nicknameOf(d.song.userId))))];
  const same = dups.some((d) => d.level === 'same');
  const selfOnly = dups.every((d) => d.song.userId === forUserId);
  const who = selfOnly ? '自己的清單裡已經有' : `${names.join('、')} 也點了`;
  return h('p', { class: `dup ${same ? 'same' : 'similar'}` }, same ? `重複：${who}` : `可能重複：${who}相似的歌`);
}

// ---------- 活動（篩選層） ----------
const curEventId = () => S.me?.eventId || '';
const eventById = (id) => S.events.find((e) => e.id === id) || null;
const curEvent = () => eventById(curEventId());
const eventLabel = (e) => [e.name, e.date, e.place].filter(Boolean).join('・');

/** 依目前參與的活動篩出歌，並重算重複（不同活動之間不互相比對） */
function rescope() {
  const id = curEventId();
  S.songs = id ? S.allSongs.filter((s) => (s.eventId || '') === id) : [];
  S.dups = new Map(S.songs.map((s) => [s.id, findDuplicates(s, S.songs, { excludeId: s.id })]));
}

/** 日期新的在前；沒有日期的排後面 */
function sortedEvents() {
  return [...S.events].sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
}

const mySongs = () => S.songs.filter((s) => s.userId === S.me?.id).sort((a, b) => a.order - b.order);
const otherSongs = () => S.songs.filter((s) => s.userId !== S.me?.id);

// ---------- 畫面 ----------
let tachieShown = false;
/** 登入頁每次出現都隨機換一張立繪（不和上一張重複）；載入失敗就整個隱藏，不影響登入 */
function pickTachie() {
  const box = $('#tachie');
  const img = $('#tachie-img');
  if (!tachie.length) return;
  let last = -1;
  try { last = Number(localStorage.getItem('ktv-tachie')); } catch { /* ignore */ }
  let i;
  do { i = Math.floor(Math.random() * tachie.length); } while (tachie.length > 1 && i === last);
  try { localStorage.setItem('ktv-tachie', String(i)); } catch { /* ignore */ }
  const t = tachie[i];
  box.classList.remove('ready');
  box.dataset.side = Math.random() < 0.5 ? 'left' : 'right'; // 左下角或右下角
  box.style.setProperty('--cap', t.maxH ? `${t.maxH}px` : '9999px'); // 原圖很小的，限制顯示高度避免放大變糊
  img.width = t.w;
  img.height = t.h;
  img.onload = () => box.classList.add('ready');
  img.onerror = () => { box.hidden = true; };
  box.hidden = false;
  img.src = t.src;
}

function showView(id) {
  for (const v of ['unconfigured-view', 'login-view', 'setup-view', 'main-view']) $(`#${v}`).hidden = v !== id;
  $('#loading').hidden = Boolean(id);
  if (id === 'login-view' && !tachieShown) pickTachie();
  tachieShown = id === 'login-view';
}

function render() {
  renderUserbox();
  if (!store.configured) return showView('unconfigured-view');
  if (!S.sessionKnown) return showView(null);
  if (!S.authUser) return showView('login-view');
  if (!S.me) return showView(S.loggingIn ? null : 'setup-view');
  if (!S.dataReady) return showView(null);
  showView('main-view');
  for (const b of document.querySelectorAll('.tab')) {
    const on = b.dataset.tab === S.tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  }
  $('#tab-all').hidden = S.tab !== 'all';
  $('#tab-mine').hidden = S.tab !== 'mine';
  $('#my-count').textContent = mySongs().length || '';
  renderEventPicker();
  renderEveryone();
  renderMine();
}

function renderUserbox() {
  const box = $('#userbox');
  box.replaceChildren();
  if (!S.me) return;
  box.append(
    h('button', { class: 'me-btn', title: '修改暱稱', onclick: openNickDialog }, avatar(S.me, 26), h('span', { class: 'me-name' }, S.me.nickname)),
    h('button', { class: 'btn ghost sm', onclick: logout }, '登出'),
  );
}

function noEventPrompt() {
  return h('div', { class: 'empty' },
    h('p', {}, S.events.length ? '還沒選擇要參與的活動。' : '還沒有任何活動，先建立一個吧。'),
    h('button', { class: 'btn primary', onclick: () => (S.events.length ? $('#event-select').focus() : openEventDialog()) }, S.events.length ? '選擇活動' : '＋ 新增活動'));
}

function renderEveryone() {
  const root = $('#people');
  root.replaceChildren();
  const q = S.filter.trim().toLowerCase();
  const ev = curEvent();
  if (!ev) {
    $('#stats').textContent = '';
    root.append(noEventPrompt());
    return;
  }

  const byUser = new Map();
  for (const s of [...S.songs].sort((a, b) => a.order - b.order)) {
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId).push(s);
  }
  // 參與這個活動的人（就算還沒點歌也會列出來）
  const participants = [...S.users.values()].filter((u) => u.eventId === ev.id).map((u) => u.id);
  const ids = [...new Set([...byUser.keys(), ...participants])].sort((a, b) => {
    if (a === S.me.id) return -1;
    if (b === S.me.id) return 1;
    return nicknameOf(a).localeCompare(nicknameOf(b), 'zh-Hant');
  });

  const dupCount = S.songs.filter((s) => S.dups.get(s.id)?.some((d) => d.level === 'same')).length;
  $('#stats').textContent = `${ids.length} 人參與、共 ${S.songs.length} 首`
    + (S.songs.length ? (dupCount ? `，其中 ${dupCount} 首有重複` : '，目前沒有重複') : '');

  let shown = 0;
  for (const uid of ids) {
    const nick = nicknameOf(uid);
    const all = byUser.get(uid) || [];
    const songs = all.filter((s) => {
      if (S.onlyDup && !S.dups.get(s.id)?.length) return false;
      if (!q) return true;
      return s.title.toLowerCase().includes(q) || nick.toLowerCase().includes(q) || (s.channel || '').toLowerCase().includes(q);
    });
    // 還沒點歌的參與者：沒有搜尋或篩選時才列出
    if (!songs.length && (all.length || q || S.onlyDup)) continue;
    shown++;
    root.append(h('section', { class: 'person' },
      h('header', { class: 'person-head' },
        avatar(S.users.get(uid), 30),
        h('h3', {}, nick, uid === S.me.id ? h('span', { class: 'you' }, '（你）') : null),
        h('span', { class: 'muted small' }, `${all.length} 首`),
      ),
      songs.length ? h('div', { class: 'grid' }, songs.map(songCard)) : h('p', { class: 'muted small' }, '還沒點歌'),
    ));
  }

  if (!shown) {
    root.append(h('div', { class: 'empty' }, h('p', {}, '沒有符合條件的歌。')));
  } else if (!S.songs.length) {
    root.append(h('div', { class: 'empty' }, h('button', { class: 'btn primary', onclick: () => { switchTab('mine'); openAddDialog(); } }, '＋ 加第一首歌')));
  }
}
function songCard(s) {
  return h('article', { class: 'song-card' },
    thumb(s),
    h('div', { class: 'meta' },
      h('a', { class: 'title', href: safeHref(s.url), target: '_blank', rel: 'noopener noreferrer', title: s.title }, s.title),
      s.channel ? h('p', { class: 'sub' }, s.channel) : null,
      dupText(S.dups.get(s.id), s.userId),
    ),
  );
}

function renderMine() {
  const list = $('#my-list');
  list.replaceChildren();
  const songs = mySongs();
  $('#clear-mine').hidden = songs.length === 0;
  if (!songs.length) {
    list.append(h('li', { class: 'empty' }, h('p', {}, curEvent() ? '你還沒有點歌。' : '請先在上方選擇要參與的活動。')));
    return;
  }
  songs.forEach((s, i) => {
    list.append(h('li', { class: 'my-row' },
      h('span', { class: 'num' }, i + 1),
      thumb(s, 'sm'),
      h('div', { class: 'meta' },
        h('a', { class: 'title', href: safeHref(s.url), target: '_blank', rel: 'noopener noreferrer' }, s.title),
        s.channel ? h('p', { class: 'sub' }, s.channel) : null,
        dupText(S.dups.get(s.id), s.userId),
      ),
      h('div', { class: 'actions' },
        h('button', { class: 'icon-btn', title: '往上', 'aria-label': '往上移', disabled: i === 0, onclick: () => move(s, -1) }, icon('up')),
        h('button', { class: 'icon-btn', title: '往下', 'aria-label': '往下移', disabled: i === songs.length - 1, onclick: () => move(s, 1) }, icon('down')),
        h('button', { class: 'btn ghost sm', onclick: () => openEditDialog(s) }, '編輯'),
        h('button', { class: 'btn ghost sm', onclick: () => openAddDialog({ replace: s }) }, '更換'),
        h('button', { class: 'btn ghost sm danger-text', onclick: () => removeSong(s) }, '刪除'),
      ),
    ));
  });
}

function switchTab(tab) {
  S.tab = tab;
  try { localStorage.setItem('ktv-tab', tab); } catch { /* ignore */ }
  render();
}

// ---------- 我的歌：操作 ----------
async function move(song, delta) {
  const songs = mySongs();
  const i = songs.indexOf(song);
  const j = i + delta;
  if (j < 0 || j >= songs.length) return;
  [songs[i], songs[j]] = [songs[j], songs[i]];
  try { await store.reorderSongs(songs); } catch (e) { toast(e.message, 'error'); }
}

async function removeSong(song) {
  if (!confirm(`確定要刪除「${song.title}」？`)) return;
  try { await store.deleteSong(song); toast('已刪除'); } catch (e) { toast(e.message, 'error'); }
}

async function logout() {
  if (S.me.provider === 'anonymous'
    && !confirm(`用暱稱登入的帳號，登出後就不能再用「${S.me.nickname}」登入，也不能再修改你的歌。

確定要登出？`)) return;
  yt.forgetYouTube();
  try { await store.logout(); } catch (e) { toast(e.message, 'error'); }
}

// ---------- 加歌／更換對話框 ----------
const add = {
  replace: null,  // 正在更換的歌（null 表示一般加歌）
  source: 'youtube',
  picker: null,   // { playlist, items, selected:Set, query }
};

function openAddDialog({ replace = null, source } = {}) {
  if (!curEvent()) { // 歌一定要存在某個活動裡
    toast('請先選擇要參與的活動', 'error');
    if (S.events.length) $('#event-select').focus(); else openEventDialog();
    return;
  }
  add.replace = replace;
  add.picker = null;
  add.source = source || (yt.youtubeStatus().authorized ? 'youtube' : (add.source || 'youtube'));
  $('#add-title').textContent = replace ? `更換：${replace.title}` : '加歌';
  const dlg = $('#add-dialog');
  if (!dlg.open) dlg.showModal();
  yt.preloadAuth().catch(() => {});
  renderAddBody();
}

function setSource(src) {
  add.source = src;
  add.picker = null;
  renderAddBody();
}

function renderAddBody() {
  for (const b of document.querySelectorAll('#source-tabs button')) b.classList.toggle('active', b.dataset.source === add.source);
  $('#source-tabs').hidden = Boolean(add.picker);
  const body = $('#add-body');
  const foot = $('#add-foot');
  body.replaceChildren();
  foot.replaceChildren();
  foot.hidden = true;
  body.scrollTop = 0;
  if (add.picker) return renderPicker(body, foot);
  if (add.source === 'link') return renderLinkSource(body);
  return renderYouTubeSource(body);
}

function playlistUrlForm(body) {
  const input = h('input', { type: 'url', inputmode: 'url', placeholder: 'https://www.youtube.com/playlist?list=...', 'aria-label': '播放清單網址' });
  const form = h('form', { class: 'inline-form', onsubmit: async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    try {
      const r = await yt.resolveUrl(input.value);
      if (r.playlistId) openPicker(r.playlistId);
      else toast('這不是播放清單網址，請改用「貼上連結」', 'error');
    } catch (err) { toast(err.message, 'error'); }
  } }, input, h('button', { class: 'btn', type: 'submit' }, '載入'));
  body.append(h('div', { class: 'block' }, h('h3', {}, '貼上公開播放清單網址'), form));
}

async function connectYouTube() {
  try {
    await yt.authorize(store.currentEmail());
    toast('已連結 YouTube');
    renderAddBody();
  } catch (err) { toast(err.message, 'error'); }
}

async function renderYouTubeSource(body) {
  const st = yt.youtubeStatus();
  if (!st.authorized) {
    if (st.apiKey) playlistUrlForm(body); // 公開清單直接貼網址，不用連結帳號
    body.append(h('div', { class: 'block connect' },
      h('h3', {}, '從你的 YouTube 播放清單挑歌'),
      st.canAuthorize
        ? h('button', { class: 'btn google', onclick: connectYouTube }, '連結 Google／YouTube 帳號')
        : h('p', { class: 'warn small' }, '尚未設定 YouTube 讀取權限，請改用「貼上連結」。'),
    ));
    return;
  }
  const listBox = h('div', { class: 'block' }, h('h3', {}, '我的播放清單'), h('p', { class: 'muted' }, '讀取中…'));
  body.append(listBox);
  playlistUrlForm(body);
  try {
    const playlists = await yt.listMyPlaylists();
    if (add.source !== 'youtube' || add.picker || !listBox.isConnected) return; // 使用者已經切走
    listBox.replaceChildren(h('h3', {}, '我的播放清單'));
    if (!playlists.length) listBox.append(h('p', { class: 'muted' }, '你的 YouTube 帳號沒有播放清單。'));
    listBox.append(h('ul', { class: 'pl-list' }, playlists.map((p) => h('li', {},
      h('button', { class: 'pl-item', onclick: () => openPicker(p.id) },
        p.thumbnail
          ? h('img', { src: p.thumbnail, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })
          : h('span', { class: 'ph' }, h('span', { class: 'ph-icon' }, icon(p.special ? 'heart' : 'note'))),
        h('span', { class: 'pl-meta' }, h('strong', {}, p.title), h('span', { class: 'muted small' }, p.count != null ? `${p.count} 部影片` : '')),
        h('span', { class: 'chev' }, icon('right')),
      )))));
  } catch (err) {
    if (err.code === 'youtube_auth') return renderAddBody();
    listBox.replaceChildren(h('h3', {}, '我的播放清單'), h('p', { class: 'error' }, err.message));
  }
}

async function openPicker(playlistId) {
  const body = $('#add-body');
  body.replaceChildren(h('p', { class: 'muted center pad' }, '讀取播放清單…'));
  $('#source-tabs').hidden = true;
  try {
    const data = await yt.getPlaylistItems(playlistId);
    add.picker = { playlist: data.playlist, items: data.items, selected: new Set(), query: '' };
    renderAddBody();
  } catch (err) {
    add.picker = null;
    renderAddBody();
    toast(err.message, 'error');
  }
}

/** 一首候選歌在目前狀態下的標記 */
function itemStatus(item) {
  const mine = mySongs().filter((s) => s.id !== add.replace?.id);
  const inMine = Boolean(item.videoId) && mine.some((s) => s.videoId === item.videoId);
  const others = findDuplicates(item, otherSongs());
  const selfSimilar = inMine ? [] : findDuplicates(item, mine);
  return { inMine, others, selfSimilar };
}

function statusChips(st) {
  const chips = [];
  if (st.inMine) chips.push(h('span', { class: 'chip ok' }, '已在你的清單'));
  if (st.others.length) {
    const names = [...new Set(st.others.map((d) => nicknameOf(d.song.userId)))].join('、');
    const same = st.others.some((d) => d.level === 'same');
    chips.push(h('span', { class: `chip ${same ? 'bad' : 'maybe'}` }, same ? `${names} 已點` : `${names} 點了相似的歌`));
  }
  if (st.selfSimilar.length) chips.push(h('span', { class: 'chip maybe' }, '你的清單有相似的歌'));
  return chips;
}

function renderPicker(body, foot) {
  const p = add.picker;
  const single = Boolean(add.replace);
  const search = h('input', { type: 'search', placeholder: `在 ${p.items.length} 首中搜尋`, value: p.query, 'aria-label': '搜尋播放清單' });
  const list = h('ul', { class: 'pick-list' });
  const count = h('span', { class: 'muted' });
  const submit = h('button', { class: 'btn primary', disabled: true, onclick: submitPicker }, single ? '用這首更換' : '加入');

  const sync = () => {
    const n = p.selected.size;
    count.textContent = single ? (n ? '已選 1 首' : '請選一首') : `已選 ${n} 首`;
    submit.disabled = n === 0;
    submit.textContent = single ? '用這首更換' : (n ? `加入 ${n} 首` : '加入');
  };

  const draw = () => {
    list.replaceChildren();
    const q = p.query.trim().toLowerCase();
    const items = p.items.filter((it) => !q || it.title.toLowerCase().includes(q) || it.channel.toLowerCase().includes(q));
    if (!items.length) list.append(h('li', { class: 'muted center pad' }, p.items.length ? '沒有符合的歌' : '這個播放清單是空的'));
    for (const it of items) {
      const st = itemStatus(it);
      const input = h('input', {
        type: single ? 'radio' : 'checkbox', name: 'pick', checked: p.selected.has(it.videoId), disabled: st.inMine,
        onchange: (e) => {
          if (single) p.selected.clear();
          if (e.target.checked) p.selected.add(it.videoId); else p.selected.delete(it.videoId);
          sync();
        },
      });
      list.append(h('li', {}, h('label', { class: `pick-row${st.inMine ? ' disabled' : ''}` },
        input,
        h('span', { class: 'thumb sm' }, h('img', { src: thumbnailFor(it.videoId), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' })),
        h('span', { class: 'meta' }, h('span', { class: 'title' }, it.title), it.channel ? h('span', { class: 'sub' }, it.channel) : null, h('span', { class: 'chips' }, statusChips(st))),
      )));
    }
  };

  search.addEventListener('input', () => { p.query = search.value; draw(); });
  body.append(
    h('div', { class: 'picker-head' },
      h('button', { class: 'btn ghost sm', onclick: () => { add.picker = null; renderAddBody(); } }, icon('left'), '返回'),
      h('strong', { class: 'picker-title' }, p.playlist.title),
    ),
    search,
    list,
  );
  foot.hidden = false;
  foot.append(count, h('span', { class: 'spacer' }), submit);
  draw();
  sync();
}

async function submitPicker() {
  const p = add.picker;
  const items = p.items.filter((it) => p.selected.has(it.videoId)).map((it) => ({
    title: it.title, videoId: it.videoId, url: `https://www.youtube.com/watch?v=${it.videoId}`, channel: it.channel,
  }));
  await saveItems(items);
}

/** 加入（或更換）前檢查重複，確認後送出 */
async function saveItems(items) {
  if (!items.length) return;
  const warn = [];
  for (const it of items) {
    const st = itemStatus(it);
    if (st.others.some((d) => d.level === 'same')) {
      warn.push(`・${it.title}（${[...new Set(st.others.map((d) => nicknameOf(d.song.userId)))].join('、')} 已點）`);
    }
  }
  if (warn.length && !confirm(`這些歌已經有人點了：\n${warn.slice(0, 8).join('\n')}${warn.length > 8 ? `\n…等 ${warn.length} 首` : ''}\n\n還是要${add.replace ? '更換' : '加入'}嗎？`)) return;

  try {
    if (add.replace) {
      const it = items[0];
      await store.updateSong(add.replace, { title: it.title, url: it.url || '', channel: it.channel || '', thumb: it.thumb || '' });
      toast('已更換');
    } else {
      const n = await store.addSongs(items, mySongs(), curEventId());
      toast(`已加入 ${n} 首`);
    }
    $('#add-dialog').close();
    switchTab('mine');
  } catch (err) { toast(err.message, 'error'); }
}

function renderLinkSource(body) {
  // type 用 text 而不是 url：要讓人也能貼「嵌入代碼」（<iframe ...>）
  const input = h('input', { type: 'text', inputmode: 'url', required: true, autocomplete: 'off', placeholder: '貼上 YouTube／bilibili 網址、播放清單，或嵌入代碼', 'aria-label': '網址或嵌入代碼' });
  const result = h('div', { class: 'link-result' });
  const form = h('form', { class: 'inline-form', onsubmit: async (e) => {
    e.preventDefault();
    result.replaceChildren(h('p', { class: 'muted' }, '解析中…'));
    try {
      const r = await yt.resolveUrl(input.value);
      if (r.type === 'playlist') return openPicker(r.playlistId);
      showLinkResult(result, r);
    } catch (err) {
      result.replaceChildren(h('p', { class: 'error' }, err.message));
    }
  } }, input, h('button', { class: 'btn', type: 'submit' }, '解析'));
  body.append(h('div', { class: 'block' },
    h('h3', {}, add.replace ? '貼上新歌的連結' : '貼上連結'),
    form, result));
  setTimeout(() => input.focus(), 50);
}

function showLinkResult(box, r) {
  const titleInput = h('input', { value: r.title || '', maxlength: 200, required: true, placeholder: '輸入歌名', 'aria-label': '歌名' });
  const chips = h('span', { class: 'chips' });
  const item = () => ({ title: titleInput.value.trim(), url: r.url, videoId: r.videoId || null, channel: r.channel || '', thumb: r.thumb || '' });
  const updateChips = () => chips.replaceChildren(...statusChips(itemStatus(item())));
  titleInput.addEventListener('input', updateChips);
  // 注意：replaceChildren 收到 null 會把它變成文字「null」，所以用 filter(Boolean) 把空的拿掉
  box.replaceChildren(...[
    h('div', { class: 'link-card' },
      thumb({ url: r.url, videoId: r.videoId, thumb: r.thumb }, 'sm'),
      h('div', { class: 'meta stack' },
        h('label', { class: 'field' }, h('span', {}, '歌名'), titleInput),
        r.channel ? h('span', { class: 'sub' }, r.channel) : null,
        r.warning ? h('span', { class: 'warn small' }, r.warning) : null,
        chips,
      ),
    ),
    embedUrl(r.videoId) && !r.title // 中繼有查到歌名就不需要播放器；沒查到才顯示讓人對照歌名
      ? h('div', { class: 'embed-player' },
        h('iframe', { src: embedUrl(r.videoId), title: 'bilibili 播放器', loading: 'lazy', scrolling: 'no', frameborder: 'no', allowfullscreen: 'true', referrerpolicy: 'no-referrer-when-downgrade', allow: 'fullscreen' }))
      : null,
    h('div', { class: 'row-end' },
      r.playlistId ? h('button', { class: 'btn ghost', onclick: () => openPicker(r.playlistId) }, '改成匯入整個播放清單') : null,
      h('button', { class: 'btn primary', onclick: () => {
        if (!titleInput.value.trim()) { titleInput.focus(); return toast('請輸入歌名', 'error'); }
        saveItems([item()]);
      } }, add.replace ? '用這首更換' : '加入'),
    ),
  ].filter(Boolean));
  updateChips();
  if (!r.title) titleInput.focus();
}

// ---------- 編輯對話框 ----------
let editing = null;
function openEditDialog(song) {
  editing = song;
  const form = $('#edit-form');
  form.title.value = song.title;
  form.url.value = song.url === youtubeSearchUrl(song.title) ? '' : song.url;
  $('#edit-error').hidden = true;
  updateEditPreview();
  $('#edit-dialog').showModal();
}

function updateEditPreview() {
  const form = $('#edit-form');
  const url = form.url.value.trim();
  const videoId = extractVideoId(url);
  $('#edit-preview').replaceChildren(thumb({ url: url || youtubeSearchUrl(form.title.value), videoId }, 'sm'));
  const dups = findDuplicates({ title: form.title.value, videoId }, S.songs, { excludeId: editing?.id });
  const p = $('#edit-dup');
  p.hidden = !dups.length;
  if (dups.length) p.textContent = `注意：${[...new Set(dups.map((d) => (d.song.userId === S.me.id ? '你自己' : nicknameOf(d.song.userId))))].join('、')} 有${dups.some((d) => d.level === 'same') ? '相同' : '相似'}的歌`;
}

$('#edit-form').addEventListener('input', updateEditPreview);
$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await store.updateSong(editing, { title: form.title.value, url: form.url.value.trim() });
    $('#edit-dialog').close();
    toast('已儲存');
  } catch (err) {
    $('#edit-error').textContent = err.message;
    $('#edit-error').hidden = false;
  }
});
$('#edit-replace').addEventListener('click', () => {
  $('#edit-dialog').close();
  openAddDialog({ replace: editing });
});

// ---------- 修改暱稱 ----------
function openNickDialog() {
  const form = $('#nick-form');
  form.nickname.value = S.me.nickname;
  $('#nick-error').hidden = true;
  $('#nick-dialog').showModal();
  form.nickname.select();
}

$('#nick-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#nick-error');
  err.hidden = true;
  try {
    if (e.target.nickname.value.trim() !== S.me.nickname) await store.setNickname(e.target.nickname.value);
    $('#nick-dialog').close();
    toast('已更新');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

// ---------- 活動選單與活動對話框 ----------
/** 「我的歌」旁邊的下拉選單：選了就是參與那個活動，之後加的歌都存進去 */
function renderEventPicker() {
  const sel = $('#event-select');
  const ev = curEvent();
  sel.replaceChildren(
    ...(ev ? [] : [h('option', { value: '' }, '選擇活動…')]),
    ...sortedEvents().map((e) => h('option', { value: e.id }, e.name)), // 選單只顯示名稱
    h('option', { value: '__new' }, '＋ 新增活動…'),
  );
  sel.value = ev ? ev.id : '';
  sel.title = ev ? eventLabel(ev) : '選擇要參與的活動'; // 日期與位置只在滑鼠停留時顯示
  $('#event-edit').hidden = !(ev && ev.createdBy === S.me?.id); // 只有建立者能改
}

$('#event-select').addEventListener('change', async (e) => {
  const v = e.target.value;
  if (v === '__new') { renderEventPicker(); openEventDialog(); return; }
  if (!v || v === curEventId()) return;
  try { await store.joinEvent(v); toast('已切換活動'); } catch (err) { toast(err.message, 'error'); renderEventPicker(); }
});

let eventEditing = null;
function openEventDialog(ev = null) {
  eventEditing = ev;
  const f = $('#event-form');
  $('#event-title').textContent = ev ? '編輯活動' : '新增活動';
  $('#event-submit').textContent = ev ? '儲存' : '建立並參與';
  f.ename.value = ev?.name || '';
  f.edate.value = ev ? ev.date : new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); // 新活動預設今天
  f.eplace.value = ev?.place || '';
  $('#event-error').hidden = true;
  $('#event-dialog').showModal();
  f.ename.focus();
}

$('#event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#event-error');
  err.hidden = true;
  const data = { name: f.ename.value, date: f.edate.value, place: f.eplace.value };
  try {
    if (eventEditing) { await store.updateEvent(eventEditing.id, data); toast('已更新活動'); }
    else { await store.createEvent(data); toast('已建立並參與'); switchTab('mine'); }
    $('#event-dialog').close();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});
$('#event-edit').addEventListener('click', () => openEventDialog(curEvent()));

// ---------- 登入 ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const err = $('#login-error');
  const btn = form.querySelector('button[type="submit"]');
  err.hidden = true;
  btn.disabled = true;
  S.loggingIn = true; // 登入到登記暱稱之間不要閃過「設定暱稱」畫面
  try {
    await store.loginWithNickname(form.nickname.value);
    form.reset();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
    S.loggingIn = false;
    render();
  }
});

$('#google-login').addEventListener('click', async () => {
  try { await store.loginWithGoogle(); } catch (ex) {
    $('#login-error').textContent = ex.message;
    $('#login-error').hidden = false;
  }
});

$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#setup-error');
  err.hidden = true;
  try { await store.setNickname(e.target.nickname.value); } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});
$('#setup-cancel').addEventListener('click', () => store.logout());

// ---------- 共用事件 ----------
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => switchTab(b.dataset.tab));
for (const b of document.querySelectorAll('#source-tabs button')) b.addEventListener('click', () => setSource(b.dataset.source));
$('#add-btn').addEventListener('click', () => openAddDialog());
$('#filter').addEventListener('input', (e) => { S.filter = e.target.value; renderEveryone(); });
$('#only-dup').addEventListener('change', (e) => { S.onlyDup = e.target.checked; renderEveryone(); });
$('#clear-mine').addEventListener('click', async () => {
  const songs = mySongs();
  if (!confirm(`確定要清空你的 ${songs.length} 首歌？`)) return;
  try { await store.clearSongs(songs); toast('已清空'); } catch (err) { toast(err.message, 'error'); }
});
for (const dlg of document.querySelectorAll('dialog')) {
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
}

// LINE、Facebook、Instagram 的內建瀏覽器，Google 不允許登入
const ua = navigator.userAgent;
if (/\bLine\/|FBAN|FBAV|Instagram/i.test(ua)) {
  $('#inapp-banner').hidden = false;
  const url = new URL(location.href);
  url.searchParams.set('openExternalBrowser', '1'); // LINE 支援這個參數，會改用外部瀏覽器開啟
  $('#open-external').href = url.href;
}

// ---------- 啟動 ----------
try { S.tab = localStorage.getItem('ktv-tab') === 'mine' ? 'mine' : 'all'; } catch { /* ignore */ }

let stopData = null;
if (store.configured) {
  store.watchSession(({ user, profile }) => {
    const changedUser = user?.uid !== S.authUser?.uid;
    S.authUser = user;
    S.me = profile;
    S.sessionKnown = true;
    if (changedUser) {
      stopData?.();
      stopData = null;
      S.dataReady = false;
      S.allSongs = [];
      S.events = [];
      if (user) {
        stopData = store.watchData(({ users, songs, events }) => {
          S.users = users;
          S.allSongs = songs;
          S.events = events;
          S.dataReady = true;
          rescope();
          render();
        }, (err) => { console.error(err); toast('讀取歌單失敗，請重新整理', 'error'); });
      }
    }
    rescope(); // 參與的活動換了，歌單要跟著換
    if (user && !profile) {
      const form = $('#setup-form');
      if (!form.nickname.value) form.nickname.value = (user.displayName || '').slice(0, 20);
    }
    render();
  });
} else {
  render();
}
