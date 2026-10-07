// 示範影片用：取代 docs/youtube.js。貼上的內容依關鍵字對應到固定的影片資料（不連網）。
import { YT, BILI } from './demo-data.js';

export class YouTubeError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
export const youtubeStatus = () => ({ authorized: false, canAuthorize: true, apiKey: true });
export const forgetYouTube = () => {};
export const preloadAuth = () => Promise.resolve();
export const authorize = async () => {};
export const listMyPlaylists = async () => [];
export const getPlaylistItems = async () => ({ playlist: { id: 'x', title: '' }, items: [] });

export async function resolveUrl(raw) {
  await new Promise((r) => setTimeout(r, 60));
  const text = String(raw);
  if (text.includes('KeuXa4_xcf0')) {
    const y = YT.find((v) => v.id === 'KeuXa4_xcf0');
    return { type: 'video', videoId: y.id, url: `https://www.youtube.com/watch?v=${y.id}`, title: y.title, channel: y.channel, playlistId: null };
  }
  const bvid = text.includes('BV1bzBxYdEZc') ? 'BV1bzBxYdEZc' : 'BV1Va9yBmEfH'; // 其餘（含 b23.tv 短網址的分享文字）都是第一支
  return { type: 'video', videoId: bvid, url: `https://www.bilibili.com/video/${bvid}`, title: BILI[bvid].title, channel: BILI[bvid].channel, thumb: '' };
}
