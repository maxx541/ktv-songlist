// 示範影片用的假資料層：取代 docs/store.js，讓「真正的 app.js」不用登入也能跑出完整畫面。
// 流程：登入頁 → 輸入暱稱（主角「有地將臣」）→ 還沒參與活動 → 建立活動「米娜」時，茉子、叢雨、芳乃也一起參與。
// 示範用到的所有歌曲，都只來自使用者提供的連結（YT／BILI 由 render.py 在建置時抓好放進 demo-data.js）。
import { YT, BILI } from './demo-data.js';

const now = Date.now();
const user = (id, nickname, eventId = '') => [id, { id, nickname, provider: 'anonymous', eventId }];
const song = (id, userId, title, vid, eventId, order, extra = {}) => ({
  id, userId, title, url: extra.url || `https://www.youtube.com/watch?v=${vid}`, videoId: vid, channel: extra.channel || '',
  order, eventId, createdAt: now + order, ...extra,
});
const biliSong = (id, userId, bvid, eventId, order) => song(id, userId, BILI[bvid].title, bvid, eventId, order, { url: `https://www.bilibili.com/video/${bvid}`, channel: BILI[bvid].channel });

const db = {
  users: new Map([user('me', '有地將臣', ''), user('u2', '茉子', 'e0'), user('u3', '叢雨', ''), user('u4', '芳乃', '')]),
  events: [{ id: 'e0', name: '上次日K', date: '2026-09-28', place: '錢櫃', createdBy: 'u2', createdAt: now - 99999 }],
  songs: [],
};

// 另一個活動（上次日K）裡的歌：用來展示「不同活動互不干擾」
db.songs.push(song('o1', 'u2', YT[2].title, YT[2].id, 'e0', 1, { channel: YT[2].channel }), biliSong('o2', 'u3', 'BV1bzBxYdEZc', 'e0', 1));

// 新活動建立時，茉子已經點好的一首（跟主角之後貼的是同一支 B 站影片，用來示範重複偵測）
function seed(eventId) {
  db.songs.push(biliSong('s_dup', 'u2', 'BV1Va9yBmEfH', eventId, 1));
}

// 示範用：模擬「別人」即時加歌（YT 前三首）
window.__sim = (uid, i) => {
  const y = YT[i];
  const n = db.songs.filter((s) => s.userId === uid && s.eventId === 'e_new').length + 1;
  db.songs.push(song(`sim_${i}`, uid, y.title, y.id, 'e_new', n, { channel: y.channel }));
  pushData();
};

window.__db = db;
window.confirm = () => true; // 加入重複的歌時，程式會問「還是要加入嗎」，示範時由影片自己畫出這個詢問

let sessionCb = null;
let dataCb = null;
let loggedIn = false;
const profile = () => ({ ...db.users.get('me') });
const pushSession = () => sessionCb && sessionCb(loggedIn ? { user: { uid: 'me' }, profile: profile() } : { user: null, profile: null });
const pushData = () => dataCb && dataCb({ users: new Map(db.users), songs: [...db.songs], events: [...db.events] });

export class UserError extends Error {}
export const configured = true;
export const MAX_SONGS_PER_USER = 100;
export const watchSession = (cb) => { sessionCb = cb; setTimeout(pushSession, 0); return () => {}; };
export const watchData = (cb) => { dataCb = cb; setTimeout(pushData, 0); return () => {}; };

export const loginWithNickname = async () => { loggedIn = true; pushSession(); pushData(); };
export const loginWithGoogle = async () => {};
export const setNickname = async () => {};
export const logout = async () => {};
export const currentEmail = () => null;
export const currentProvider = () => 'anonymous';

export const joinEvent = async (id) => { db.users.get('me').eventId = id || ''; pushSession(); pushData(); };
export const createEvent = async (raw) => {
  if (!raw.name.trim()) throw new UserError('請輸入活動名稱');
  const id = 'e_new';
  db.events.push({ id, name: raw.name, date: raw.date, place: raw.place, createdBy: 'me', createdAt: Date.now() });
  for (const u of ['me', 'u2', 'u3', 'u4']) db.users.get(u).eventId = id; // 其他人也來參與
  seed(id);
  pushSession(); pushData();
  return id;
};
export const updateEvent = async (id, raw) => { Object.assign(db.events.find((e) => e.id === id), raw); pushData(); };

export const addSongs = async (items, mine, eventId) => {
  if (!eventId) throw new UserError('請先選擇要參與的活動');
  items.forEach((it, i) => db.songs.push(song('n' + Math.random(), 'me', it.title, it.videoId, eventId, mine.length + i + 1, { url: it.url, channel: it.channel || '' })));
  pushData();
  return items.length;
};
export const updateSong = async () => {};
export const deleteSong = async () => {};
export const reorderSongs = async () => {};
export const clearSongs = async () => {};
