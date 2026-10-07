// 前後端共用：網址解析、歌名正規化、重複判斷
// 這個檔同時被瀏覽器（public/app.js）和伺服器（server.js、測試）import。

const VIDEO_ID_RE = /^[\w-]{11}$/;

/** 從各種 YouTube 網址取出影片 ID（watch、youtu.be、shorts、embed、live、music.youtube.com） */
export function extractVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (VIDEO_ID_RE.test(s)) return null; // 單純 11 碼字串不當網址處理，避免誤判一般文字
  let url;
  try { url = new URL(s); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return VIDEO_ID_RE.test(id) ? id : null;
  }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') return null;
  const v = url.searchParams.get('v');
  if (v && VIDEO_ID_RE.test(v)) return v;
  const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** 從 YouTube 網址取出播放清單 ID（list=...） */
export function extractPlaylistId(input) {
  if (!input) return null;
  let url;
  try { url = new URL(String(input).trim()); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be') return null;
  const list = url.searchParams.get('list');
  return list && /^[\w-]{2,64}$/.test(list) ? list : null;
}

export function thumbnailFor(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null;
}

export function youtubeSearchUrl(title) {
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(title);
}

// YouTube 標題常見的雜訊字，比對重複前先拿掉
const NOISE = [
  /official\s*(music\s*)?(video|mv|audio|lyric video)/g,
  /music\s*video/g,
  /lyrics?\s*video/g,
  /\b(mv|m\/v|hd|4k|remaster(ed)?|lyrics?|audio)\b/g,
  /官方(完整版)?|完整版|高畫質|動態歌詞|歌詞版|字幕版|伴唱版|ktv版?/g,
];

/** 把歌名轉成比對用的字串：全形轉半形、小寫、去雜訊字、去空白與標點 */
export function normalizeTitle(title) {
  let s = String(title || '').normalize('NFKC').toLowerCase();
  for (const re of NOISE) s = s.replace(re, ' ');
  return s.replace(/[\s\p{P}\p{S}]+/gu, '');
}

/**
 * 找出和 item 重複的歌。
 * - same：同一支影片，或正規化後歌名完全相同
 * - similar：一方歌名包含另一方（例如「晴天」vs「周杰倫【晴天】MV」）
 * @param {{title:string, videoId?:string|null}} item
 * @param {Array<{id:string,title:string,videoId?:string|null}>} songs
 * @param {{excludeId?:string}} [opts]
 */
export function findDuplicates(item, songs, opts = {}) {
  const key = normalizeTitle(item.title);
  const out = [];
  for (const song of songs) {
    if (opts.excludeId && song.id === opts.excludeId) continue;
    if (item.videoId && song.videoId && item.videoId === song.videoId) {
      out.push({ song, level: 'same' });
      continue;
    }
    const other = normalizeTitle(song.title);
    if (!key || !other) continue;
    if (key === other) out.push({ song, level: 'same' });
    else if (Math.min(key.length, other.length) >= 2 && (key.includes(other) || other.includes(key))) {
      out.push({ song, level: 'similar' });
    }
  }
  return out;
}

/** 暱稱清理：去頭尾空白、控制字元、多重空白；「/」換成全形；長度 1–20 */
export function cleanNickname(name) {
  const s = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\//g, '／').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, 20).join('');
}

/** 暱稱在 Firestore 的文件 ID：'n_' + 小寫暱稱（firestore.rules 會用同樣規則檢查，避免冒用別人的暱稱） */
export function nicknameDocId(name) {
  return 'n_' + cleanNickname(name).toLowerCase();
}
