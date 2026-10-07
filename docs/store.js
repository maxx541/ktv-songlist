// Firebase 資料層：登入（暱稱／Google）與 Firestore 讀寫
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithPopup, GoogleAuthProvider, signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, doc, getDoc, collection, onSnapshot, runTransaction,
  writeBatch, serverTimestamp, updateDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './config.js';
import { cleanNickname, nicknameDocId, extractVideoId, isVideoId, isBilibiliId, isBilibiliCover, videoUrl, youtubeSearchUrl } from './shared.js';

/** config.js 還沒填 Firebase 設定時，網站只會顯示「還沒設定好」 */
export const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const MAX_SONGS_PER_USER = 100;

let auth;
let db;
if (configured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, {});
}

export class UserError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** 把 Firebase 的錯誤碼翻成看得懂的中文 */
function friendly(err) {
  if (err instanceof UserError) return err;
  const map = {
    'auth/too-many-requests': '嘗試太多次了，請稍後再試',
    'auth/popup-closed-by-user': '已取消登入',
    'auth/cancelled-popup-request': '已取消登入',
    'auth/popup-blocked': '瀏覽器擋住了登入視窗，請允許彈出視窗後再試',
    'auth/network-request-failed': '網路連線失敗，請檢查網路',
    'auth/operation-not-allowed': '這種登入方式還沒在 Firebase 開啟（見 README 設定步驟）',
    'auth/unauthorized-domain': '這個網址還沒加進 Firebase 的「授權網域」（見 README 設定步驟）',
    'permission-denied': '沒有權限（可能是暱稱已被別人使用）',
    unavailable: '連不上資料庫，請檢查網路',
  };
  const e = new UserError(map[err?.code] || `發生錯誤：${err?.message || err}`, err?.code);
  console.error(err);
  return e;
}

const wrap = (fn) => async (...args) => {
  try { return await fn(...args); } catch (err) { throw friendly(err); }
};

function providerOf(user) {
  if (user.isAnonymous) return 'anonymous';
  return 'google';
}

// ---------- 登入狀態 ----------
/**
 * 監聽登入狀態與個人資料。cb({ user, profile })；
 * 已登入但還沒設定暱稱時 profile 為 null。
 */
export function watchSession(cb) {
  let unsubProfile = null;
  return onAuthStateChanged(auth, (user) => {
    unsubProfile?.();
    unsubProfile = null;
    if (!user) return cb({ user: null, profile: null });
    unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      cb({ user, profile: snap.exists() ? { id: user.uid, ...snap.data(), provider: providerOf(user) } : null });
    }, (err) => console.error(err));
  });
}

/** 登記（或改成）某個暱稱。暱稱撞名時丟 UserError */
async function claimNickname(user, rawNickname) {
  const nickname = cleanNickname(rawNickname);
  if (!nickname) throw new UserError('請輸入暱稱');
  const key = nicknameDocId(nickname);
  const nickRef = doc(db, 'nicknames', key);
  const userRef = doc(db, 'users', user.uid);
  const provider = providerOf(user);
  await runTransaction(db, async (tx) => {
    const nickSnap = await tx.get(nickRef);
    const userSnap = await tx.get(userRef);
    if (nickSnap.exists() && nickSnap.data().uid !== user.uid) throw new UserError('這個暱稱已經有人用了，請換一個', 'nickname_taken');
    const old = userSnap.exists() ? userSnap.data() : null;
    if (old && old.nicknameKey !== key) tx.delete(doc(db, 'nicknames', old.nicknameKey));
    tx.set(nickRef, { uid: user.uid });
    tx.set(userRef, {
      nickname,
      nicknameKey: key,
      avatar: provider === 'google' && user.photoURL?.startsWith('https://') ? user.photoURL : null,
      provider,
      createdAt: old?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * 暱稱登入：建立匿名帳號並登記暱稱。
 * 暱稱已被登記就不能用（沒有密碼，所以只有原本那台裝置能繼續使用自己的暱稱；想換裝置請用 Google 登入）。
 */
export const loginWithNickname = wrap(async (rawNickname) => {
  const nickname = cleanNickname(rawNickname);
  if (!nickname) throw new UserError('請輸入暱稱');
  const taken = (await getDoc(doc(db, 'nicknames', nicknameDocId(nickname)))).exists();
  if (taken) throw new UserError('這個暱稱已經有人用了，請換一個', 'nickname_taken');
  const cred = await signInAnonymously(auth);
  try {
    await claimNickname(cred.user, nickname);
  } catch (err) {
    await cred.user.delete().catch(() => {}); // 剛好被別人搶走暱稱：把剛建的帳號刪掉
    throw err;
  }
});

export const loginWithGoogle = wrap(async () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, provider);
});

/** 已登入但沒有暱稱（第一次用 Google 登入），或要改暱稱 */
export const setNickname = wrap(async (nickname) => {
  await claimNickname(auth.currentUser, nickname);
});

export const logout = wrap(async () => { await signOut(auth); });

export function currentProvider() {
  return auth.currentUser ? providerOf(auth.currentUser) : null;
}

export function currentEmail() {
  const u = auth.currentUser;
  return u && providerOf(u) === 'google' ? u.email : null;
}

// ---------- 歌單資料 ----------
/** 即時監聽所有人與所有歌；cb({ users: Map, songs: [] }) */
export function watchData(cb, onError) {
  let users = new Map();
  let songs = [];
  let ready = 0;
  const emit = () => { if (ready >= 2) cb({ users, songs }); };
  const u1 = onSnapshot(collection(db, 'users'), (snap) => {
    users = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    if (ready < 2) ready++;
    emit();
  }, onError);
  const u2 = onSnapshot(collection(db, 'songs'), (snap) => {
    songs = snap.docs.map((d) => {
      const data = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, ...data, createdAt: data.createdAt?.toMillis?.() ?? Date.now() };
    }).sort((a, b) => a.createdAt - b.createdAt);
    if (ready < 2) ready++;
    emit();
  }, onError);
  return () => { u1(); u2(); };
}

function cleanText(t, max) {
  return [...String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, max).join('');
}

function cleanUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  try {
    const url = new URL(s);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href.length <= 1000 ? url.href : null;
  } catch {
    return null;
  }
}

/** 整理成可存的歌曲欄位；不合法就丟 UserError */
export function buildSong(raw) {
  const title = cleanText(raw.title, 200);
  if (!title) throw new UserError('歌名不能空白');
  let url = cleanUrl(raw.url);
  if (url === null) throw new UserError('連結格式不正確（要是 http:// 或 https:// 開頭的網址）');
  let videoId = null;
  if (url) videoId = extractVideoId(url);
  else if (isVideoId(raw.videoId)) videoId = raw.videoId;
  if (!url) url = videoId ? videoUrl(videoId) : youtubeSearchUrl(title);
  const thumb = videoId && isBilibiliId(videoId) && isBilibiliCover(raw.thumb) ? raw.thumb : '';
  return { title, url, videoId, channel: cleanText(raw.channel, 100), thumb };
}

/** 新增多首歌；mine 是自己目前的歌（用來算順序與上限） */
export const addSongs = wrap(async (items, mine) => {
  if (!items.length) throw new UserError('沒有要加入的歌');
  if (mine.length + items.length > MAX_SONGS_PER_USER) {
    throw new UserError(`每人最多 ${MAX_SONGS_PER_USER} 首，你已經有 ${mine.length} 首`);
  }
  const uid = auth.currentUser.uid;
  let order = mine.reduce((m, s) => Math.max(m, s.order || 0), 0);
  const batch = writeBatch(db);
  for (const raw of items) {
    const ref = doc(collection(db, 'songs'));
    batch.set(ref, { userId: uid, ...buildSong(raw), order: ++order, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return items.length;
});

/** 編輯或更換。fields 可包含 title、url、channel */
export const updateSong = wrap(async (song, fields) => {
  const wasSearchUrl = song.url === youtubeSearchUrl(song.title);
  const hasUrl = fields.url !== undefined;
  const next = buildSong({
    title: fields.title ?? song.title,
    url: hasUrl ? fields.url : (wasSearchUrl ? '' : song.url), // 搜尋連結跟著新歌名重產
    channel: hasUrl ? (fields.channel ?? '') : song.channel,
    // 沒換影片就沿用原本的封面；換成別支影片時，由呼叫端帶新的 thumb
    thumb: fields.thumb ?? (!hasUrl || extractVideoId(fields.url) === song.videoId ? song.thumb : ''),
  });
  await updateDoc(doc(db, 'songs', song.id), { ...next, updatedAt: serverTimestamp() });
});

export const deleteSong = wrap(async (song) => { await deleteDoc(doc(db, 'songs', song.id)); });

export const reorderSongs = wrap(async (orderedSongs) => {
  const batch = writeBatch(db);
  orderedSongs.forEach((s, i) => batch.update(doc(db, 'songs', s.id), { order: i + 1 }));
  await batch.commit();
});

export const clearSongs = wrap(async (songs) => {
  for (let i = 0; i < songs.length; i += 400) {
    const batch = writeBatch(db);
    for (const s of songs.slice(i, i + 400)) batch.delete(doc(db, 'songs', s.id));
    await batch.commit();
  }
});
