// YouTube：授權（Google Identity Services 權杖用戶端）、讀播放清單、解析貼上的網址
// 全部在瀏覽器裡直接呼叫 Google API，不需要自己的伺服器。
import { googleClientId, youtubeApiKey } from './config.js';
import { extractVideoId, extractPlaylistId } from './shared.js';

const YT_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
const API = 'https://www.googleapis.com/youtube/v3';
const MAX_PAGES = 20; // 50 首 × 20 頁 = 最多 1000 首
const TOKEN_KEY = 'ktv-yt-token';

export class YouTubeError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

let token = null;
try {
  const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
  if (saved?.expiresAt > Date.now()) token = saved;
} catch { /* ignore */ }

function saveToken(t) {
  token = t;
  try { if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); else sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function youtubeStatus() {
  return {
    authorized: Boolean(token && token.expiresAt > Date.now()),
    canAuthorize: Boolean(googleClientId),
    apiKey: Boolean(youtubeApiKey),
  };
}

export function forgetYouTube() {
  saveToken(null);
}

// ---------- 授權 ----------
let gisPromise = null;
/** 先載入 Google 授權元件，讓使用者按下按鈕時能立刻跳出視窗（才不會被擋） */
export function preloadAuth() {
  if (!googleClientId) return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gisPromise = null; reject(new YouTubeError('無法載入 Google 授權元件，請檢查網路')); };
    document.head.append(s);
  });
  return gisPromise;
}

/** 跳出 Google 授權視窗，取得「查看 YouTube 帳戶」權限；hint 是建議的 Google 帳號 */
export async function authorize(hint) {
  if (!googleClientId) throw new YouTubeError('網站還沒設定 googleClientId，無法讀取 YouTube 播放清單');
  await preloadAuth();
  await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: YT_SCOPE,
      ...(hint ? { hint } : {}),
      callback: (resp) => {
        if (resp.error) return reject(new YouTubeError(`Google 授權失敗：${resp.error_description || resp.error}`));
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(resp, YT_SCOPE)) {
          return reject(new YouTubeError('沒有勾選「查看你的 YouTube 帳戶」，所以讀不到播放清單', 'denied'));
        }
        saveToken({ value: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000 });
        resolve();
      },
      error_callback: (err) => reject(new YouTubeError(err?.type === 'popup_closed' ? '已取消授權' : `Google 授權失敗：${err?.type || '未知錯誤'}`)),
    });
    client.requestAccessToken();
  });
}

// ---------- YouTube Data API ----------
async function ytGet(path, params, { allowKey = false } = {}) {
  const auth = youtubeStatus().authorized ? { token: token.value } : (allowKey && youtubeApiKey ? { key: youtubeApiKey } : null);
  if (!auth) throw new YouTubeError('需要先連結 YouTube 帳號', 'youtube_auth');

  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  else url.searchParams.set('key', auth.key);

  let res;
  try { res = await fetch(url, { headers }); } catch { throw new YouTubeError('連不上 YouTube，請檢查網路'); }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body;

  const reason = body?.error?.errors?.[0]?.reason || '';
  if (res.status === 401) { saveToken(null); throw new YouTubeError('YouTube 授權已過期，請重新連結', 'youtube_auth'); }
  if (reason === 'insufficientPermissions') { saveToken(null); throw new YouTubeError('尚未授權讀取 YouTube 播放清單', 'youtube_auth'); }
  if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') {
    throw new YouTubeError('YouTube API 今天的額度用完了，請明天再試，或改用「貼上連結」');
  }
  if (res.status === 404) throw new YouTubeError('找不到這個播放清單（可能已刪除或設為私人）', 'not_found');
  if (res.status === 403) throw new YouTubeError('沒有權限讀取這個播放清單（可能是別人的私人清單）');
  throw new YouTubeError(`YouTube 回應錯誤：${body?.error?.message || res.status}`);
}

export async function listMyPlaylists() {
  const playlists = [];
  try {
    const ch = await ytGet('/channels', { part: 'contentDetails', mine: 'true' });
    const likes = ch.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
    if (likes) playlists.push({ id: likes, title: '喜歡的影片', count: null, thumbnail: null, special: true });
  } catch (err) {
    if (err.code !== 'not_found') throw err; // 沒有 YouTube 頻道的帳號會 404
  }
  let pageToken;
  for (let i = 0; i < MAX_PAGES; i++) {
    let body;
    try {
      body = await ytGet('/playlists', { part: 'snippet,contentDetails', mine: 'true', maxResults: 50, pageToken });
    } catch (err) {
      if (err.code === 'not_found') break;
      throw err;
    }
    for (const p of body.items || []) {
      playlists.push({
        id: p.id,
        title: p.snippet?.title || '(未命名清單)',
        count: p.contentDetails?.itemCount ?? null,
        thumbnail: p.snippet?.thumbnails?.medium?.url || p.snippet?.thumbnails?.default?.url || null,
      });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return playlists;
}

export async function getPlaylistItems(playlistId) {
  let title = null;
  try {
    const info = await ytGet('/playlists', { part: 'snippet', id: playlistId }, { allowKey: true });
    title = info.items?.[0]?.snippet?.title || null;
  } catch (err) {
    if (err.code === 'youtube_auth') throw err;
  }
  const items = [];
  const seen = new Set();
  let pageToken;
  for (let i = 0; i < MAX_PAGES; i++) {
    const body = await ytGet('/playlistItems', { part: 'snippet,contentDetails', playlistId, maxResults: 50, pageToken }, { allowKey: true });
    for (const it of body.items || []) {
      const s = it.snippet || {};
      const videoId = s.resourceId?.videoId || it.contentDetails?.videoId;
      if (!videoId || !s.title) continue;
      if (/^(deleted|private) video$/i.test(s.title)) continue; // 已刪除／私人影片
      if (seen.has(videoId)) continue; // 同一份清單裡重複的只算一次
      seen.add(videoId);
      items.push({ videoId, title: s.title, channel: s.videoOwnerChannelTitle || '' });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  if (!title && playlistId.startsWith('LL')) title = '喜歡的影片';
  return { playlist: { id: playlistId, title: title || '播放清單' }, items };
}

/** 用 oEmbed 取影片標題（不需要授權）；失敗回傳 null */
async function videoInfo(videoId) {
  const url = new URL('https://www.youtube.com/oembed');
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set('format', 'json');
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    return { title: body.title || '', channel: body.author_name || '' };
  } catch {
    return null;
  }
}

/** 解析貼上的網址：YouTube 影片、YouTube 播放清單，或其他網站連結 */
export async function resolveUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error();
  } catch {
    throw new YouTubeError('請貼上完整網址（http:// 或 https:// 開頭）');
  }
  const videoId = extractVideoId(url.href);
  const playlistId = extractPlaylistId(url.href);
  if (videoId) {
    const info = await videoInfo(videoId);
    return {
      type: 'video', videoId, url: `https://www.youtube.com/watch?v=${videoId}`,
      title: info?.title || '', channel: info?.channel || '', playlistId,
      ...(info ? {} : { warning: '抓不到影片標題，請自己輸入歌名' }),
    };
  }
  if (playlistId) return { type: 'playlist', playlistId };
  return { type: 'link', url: url.href };
}
