// 前後端共用：網址解析、歌名正規化、重複判斷
// 這個檔同時被瀏覽器（public/app.js）和伺服器（server.js、測試）import。

const VIDEO_ID_RE = /^[\w-]{11}$/;
// bilibili 的 BV 號：BV1 開頭、共 12 碼（YouTube 影片 ID 是 11 碼，不會撞）
const BILIBILI_ID_RE = /^BV1[1-9A-HJ-NP-Za-km-z]{9}$/;

/** 可以存進 videoId 欄位的值：YouTube 11 碼，或 bilibili BV 號 */
export const isVideoId = (v) => typeof v === 'string' && (VIDEO_ID_RE.test(v) || BILIBILI_ID_RE.test(v));

/** videoId 是 bilibili 的 BV 號嗎 */
export const isBilibiliId = (v) => typeof v === 'string' && BILIBILI_ID_RE.test(v);

/** videoId → 標準影片網址 */
export function videoUrl(videoId) {
  return isBilibiliId(videoId)
    ? `https://www.bilibili.com/video/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
}

/** 內嵌播放器網址（目前只有 bilibili；YouTube 用縮圖就好）。不會自動播放 */
export function embedUrl(videoId) {
  return isBilibiliId(videoId)
    ? `https://player.bilibili.com/player.html?isOutside=true&bvid=${videoId}&p=1&autoplay=0&high_quality=1`
    : null;
}

/**
 * 使用者可能貼的是網站提供的「嵌入代碼」（<iframe src="...">），這裡把它換回一般影片網址。
 * 不是 iframe 就原樣回傳。支援 bilibili 播放器（player.bilibili.com，含 p 分P）與 YouTube embed。
 */
export function normalizePasted(input) {
  const s = String(input ?? '').trim();
  const src = s.match(/<iframe[^>]+src\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!src) return s;
  let url;
  try { url = new URL(src.replace(/&amp;/g, '&').replace(/^\/\//, 'https://')); } catch { return s; }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'player.bilibili.com') {
    const bvid = url.searchParams.get('bvid') || '';
    if (!BILIBILI_ID_RE.test(bvid)) return s;
    const p = Number(url.searchParams.get('p'));
    return videoUrl(bvid) + (p > 1 ? `?p=${p}` : '');
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const m = url.pathname.match(/^\/embed\/([\w-]{11})/);
    if (m) return `https://www.youtube.com/watch?v=${m[1]}`;
  }
  return s;
}

/**
 * 使用者貼的可能是 App／網站「分享」出來的整段文字，例如 bilibili：
 *   【【纯k投屏】「IF*Else」——mochari ED】 https://www.bilibili.com/video/BV1Va9yBmEfH/?share_source=copy_web
 * 這裡把「網址」和「前面的歌名」分開。順便處理 iframe 嵌入代碼。
 * 歌名只是備案（查不到標題時用），所以去掉分享格式最外層的【】與網站名稱後綴；沒有就回傳空字串。
 * @returns {{ url: string, title: string }}
 */
export function parseShared(input) {
  const s = normalizePasted(input);
  const m = s.match(/https?:\/\/[^\s　<>"'「」【】（）]+/i);
  if (!m) return { url: s, title: '' };
  let title = s.slice(0, m.index).replace(/\s+/g, ' ').trim();
  if (title.startsWith('【') && title.endsWith('】')) title = title.slice(1, -1).trim(); // 分享文字最外層的【】
  // 去掉網站名稱後綴：「…-哔哩哔哩」（手機分享）、「…_哔哩哔哩_bilibili」（網頁標題）
  title = title.replace(/[\s_\-－]*(?:(?:哔哩哔哩|嗶哩嗶哩)(?:[\s_\-－]*bilibili)?|bilibili)$/i, '').trim();
  return { url: m[0].replace(/[),.;，。；、]+$/, ''), title: [...title].slice(0, 200).join('') };
}

/** 從 bilibili 影片網址取出 BV 號（bilibili.com/video/BV…，含手機版）。b23.tv 短網址要轉址才知道，這裡認不出來 */
function extractBilibiliId(url) {
  const host = url.hostname.replace(/^(www|m)\./, '');
  if (host !== 'bilibili.com') return null;
  const m = url.pathname.match(/^\/video\/(BV\w{10})\/?/);
  return m && BILIBILI_ID_RE.test(m[1]) ? m[1] : null;
}

/** 從各種 YouTube／bilibili 網址取出影片 ID（YouTube：watch、youtu.be、shorts、embed、live、music.youtube.com；bilibili：BV 號） */
export function extractVideoId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (VIDEO_ID_RE.test(s)) return null; // 單純 11 碼字串不當網址處理，避免誤判一般文字
  let url;
  try { url = new URL(s); } catch { return null; }
  const bili = extractBilibiliId(url);
  if (bili) return bili;
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

/**
 * yt-dlp 格式：畫質最高 720p；音質選最高的 AAC（m4a，mp4 都能放）；沒有 m4a 才退而求其次用其他最高音質；輸出 mp4。
 * 影片來源是 B 站時一樣適用（yt-dlp 內建 B 站解析器，直接貼網址就能下載）。
 */
export const YTDLP_FORMAT = 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]';

/** 活動名稱 → 可以當資料夾名稱的字串（拿掉 Windows 不能用的字元；空的就用預設名稱） */
export function ytdlpFolder(name) {
  return String(name || '').replace(/[\\/:*?"<>|%^!&]/g, '').replace(/\s+/g, ' ').replace(/[.\s]+$/g, '').trim().slice(0, 40) || 'MakoSing';
}

/**
 * 把一批歌變成可以直接貼到 Windows cmd 執行的 yt-dlp 指令。
 * - 只收 http(s) 網址；YouTube「搜尋連結」（沒挑到影片時自動產生的）不是影片，略過；重複的網址只留一個
 * - 每個網址都用雙引號包起來（網址裡常有 & ）；cmd 一行最多約 8191 字，超過就拆成多段，每段是一條完整指令
 * - 檔案放在 %USERPROFILE%\Downloads\MakoSing\<資料夾名稱>，檔名是「標題 [影片ID]」
 * @returns {string[]} 指令（沒有可下載的歌就是空陣列）
 */
export function ytdlpCommands(songs, folderName = '', maxLen = 7000) {
  const urls = [];
  for (const s of songs) {
    const u = String(s?.url || '').trim();
    if (!/^https?:\/\//i.test(u) || /youtube\.com\/results/i.test(u) || /["%^]/.test(u)) continue;
    if (!urls.includes(u)) urls.push(u);
  }
  if (!urls.length) return [];
  const dir = ytdlpFolder(folderName);
  const head = `yt-dlp -f "${YTDLP_FORMAT}" --merge-output-format mp4 --no-playlist --windows-filenames`
    + ` -P "%USERPROFILE%\\Downloads\\MakoSing\\${dir}" -o "%(title).100s [%(id)s].%(ext)s"`;
  const out = [];
  let cur = head;
  for (const u of urls) {
    if (cur.length + u.length + 3 > maxLen && cur !== head) { out.push(cur); cur = head; }
    cur += ` "${u}"`;
  }
  out.push(cur);
  return out;
}

/** bilibili 封面網址要是 hdslb.com 的 https 圖片（資料庫規則也用同樣條件） */
export const isBilibiliCover = (u) => typeof u === 'string' && u.length <= 500 && /^https:\/\/([a-z0-9-]+\.)*hdslb\.com\/.+/.test(u);

/**
 * 縮圖網址。YouTube 由 ID 組出來；bilibili 的封面網址無法由 BV 號推算，要用 thumb（查詢時存下來的），
 * 沒有就回傳 null（畫面顯示預設圖示）。
 */
export function thumbnailFor(videoId, thumb) {
  if (!videoId) return null;
  if (isBilibiliId(videoId)) return isBilibiliCover(thumb) ? `${thumb}@320w_180h.jpg` : null;
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
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
