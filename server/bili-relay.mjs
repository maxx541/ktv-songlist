// bilibili 影片資訊中繼（跑在自己的電腦上）。
// 瀏覽器不能直接問 bilibili（CORS），雲端主機的 IP 又會被 bilibili 擋（HTTP 412），
// 所以由家裡這台電腦代為查詢，只回傳歌名、上傳者、封面網址。不需要安裝任何套件。
//   執行：node server/bili-relay.mjs      測試：GET http://127.0.0.1:8787/?bvid=BV17x411w7KC
import http from 'node:http';
import { createHash } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const ALLOWED_ORIGINS = ['https://maxx541.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const BVID_RE = /^BV1[1-9A-HJ-NP-Za-km-z]{9}$/;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, Referer: 'https://www.bilibili.com/' };
const OK_TTL = 7 * 24 * 3600_000; // 查到的結果快取 7 天
const MISS_TTL = 10 * 60_000;     // 查不到的先記 10 分鐘，避免被重複敲
const MAX_UPSTREAM_PER_MIN = 20;  // 每分鐘最多問 bilibili 幾次，避免家裡 IP 被封
// WBI 簽名用的字元重排表（bilibili-API-collect：docs/misc/sign/wbi.md）
const MIXIN = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];

const cache = new Map();   // bvid -> { value, expiresAt }
let wbiKey = null;         // { value, expiresAt }
let windowStart = Date.now();
let windowCount = 0;

function allowUpstream() {
  const now = Date.now();
  if (now - windowStart > 60_000) { windowStart = now; windowCount = 0; }
  return ++windowCount <= MAX_UPSTREAM_PER_MIN;
}

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(`bilibili 回應 ${res.status}（不是 JSON）`); }
}

async function getMixinKey() {
  if (wbiKey && wbiKey.expiresAt > Date.now()) return wbiKey.value;
  const body = await getJson('https://api.bilibili.com/x/web-interface/nav');
  const img = body?.data?.wbi_img;
  if (!img?.img_url || !img?.sub_url) throw new Error('取不到 WBI 金鑰');
  const name = (u) => u.slice(u.lastIndexOf('/') + 1, u.lastIndexOf('.'));
  const raw = name(img.img_url) + name(img.sub_url);
  wbiKey = { value: MIXIN.map((i) => raw[i]).join('').slice(0, 32), expiresAt: Date.now() + 3600_000 };
  return wbiKey.value;
}

async function signedQuery(params) {
  const key = await getMixinKey();
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  const q = Object.keys(p).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ''))}`).join('&');
  return `${q}&w_rid=${createHash('md5').update(q + key).digest('hex')}`;
}

/** 查一支影片；回傳 { title, channel, pic }，影片不存在回傳 null，其他問題丟錯 */
async function lookup(bvid) {
  const body = await getJson(`https://api.bilibili.com/x/web-interface/wbi/view?${await signedQuery({ bvid })}`);
  if ([-404, 62002, 62004, 62012].includes(body.code)) return null;
  if (body.code !== 0 || !body.data?.title) {
    wbiKey = null; // 簽名可能失效，下次重新取
    throw new Error(`bilibili 回應 code=${body.code}`);
  }
  const d = body.data;
  return { title: d.title, channel: d.owner?.name || '', pic: String(d.pic || '').replace(/^http:\/\//, 'https://') };
}

function send(res, status, data, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin' };
  if (ALLOWED_ORIGINS.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') return send(res, 200, { ok: true }, origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...(ALLOWED_ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Methods': 'GET', Vary: 'Origin' });
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, origin);
  if (!ALLOWED_ORIGINS.includes(origin)) return send(res, 403, { error: 'forbidden' }, origin);

  const bvid = url.searchParams.get('bvid') || '';
  if (!BVID_RE.test(bvid)) return send(res, 400, { error: 'bad_bvid' }, origin);

  const hit = cache.get(bvid);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value ? send(res, 200, hit.value, origin) : send(res, 404, { error: 'not_found' }, origin);
  }
  if (!allowUpstream()) return send(res, 429, { error: 'rate_limited' }, origin);
  try {
    const value = await lookup(bvid);
    cache.set(bvid, { value, expiresAt: Date.now() + (value ? OK_TTL : MISS_TTL) });
    return value ? send(res, 200, value, origin) : send(res, 404, { error: 'not_found' }, origin);
  } catch (err) {
    console.error(new Date().toISOString(), bvid, err.message);
    return send(res, 502, { error: 'upstream' }, origin);
  }
});

// 只聽本機：對外網址由 Tailscale Funnel 轉進來，電腦不會直接暴露在網路上
server.listen(PORT, '127.0.0.1', () => console.log(`bili-relay 已啟動：http://127.0.0.1:${PORT}`));
