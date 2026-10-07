import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractVideoId, extractPlaylistId, normalizeTitle, findDuplicates, cleanNickname, isVideoId, videoUrl, thumbnailFor, normalizePasted, parseShared, embedUrl, isBilibiliCover } from '../docs/shared.js';

test('extractVideoId 支援各種 YouTube 網址', () => {
  const id = 'DYptgVvkVLQ';
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&list=PL123&t=30`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
  ]) assert.equal(extractVideoId(u), id, u);
  assert.equal(extractVideoId('https://example.com/watch?v=DYptgVvkVLQ'), null);
  assert.equal(extractVideoId('DYptgVvkVLQ'), null);
  assert.equal(extractVideoId('not a url'), null);
  assert.equal(extractVideoId(''), null);
});

test('extractVideoId 支援 bilibili BV 號', () => {
  const bv = 'BV1GJ411x7h7';
  for (const u of [
    `https://www.bilibili.com/video/${bv}`,
    `https://www.bilibili.com/video/${bv}/?spm_id_from=333.1007&vd_source=abc`,
    `https://bilibili.com/video/${bv}?p=2`,
    `https://m.bilibili.com/video/${bv}`,
  ]) assert.equal(extractVideoId(u), bv, u);
  assert.equal(extractVideoId('https://b23.tv/abcdEFg'), null); // 短網址認不出來，當一般連結
  assert.equal(extractVideoId('https://www.bilibili.com/video/av170001'), null);
  assert.equal(extractVideoId('https://example.com/video/BV1GJ411x7h7'), null);
  assert.equal(extractVideoId('https://www.bilibili.com/video/BV1GJ411x7'), null); // 長度不對
});

test('isVideoId、videoUrl、thumbnailFor 同時處理 YouTube 與 bilibili', () => {
  assert.ok(isVideoId('DYptgVvkVLQ') && isVideoId('BV1GJ411x7h7'));
  assert.ok(!isVideoId('BV1GJ411x7h7x') &&!isVideoId('short') && !isVideoId(null));
  assert.equal(videoUrl('BV1GJ411x7h7'), 'https://www.bilibili.com/video/BV1GJ411x7h7');
  assert.equal(videoUrl('DYptgVvkVLQ'), 'https://www.youtube.com/watch?v=DYptgVvkVLQ');
  assert.equal(thumbnailFor('BV1GJ411x7h7'), null);
  const cover = 'https://i2.hdslb.com/bfs/archive/abc123.jpg';
  assert.equal(thumbnailFor('BV1GJ411x7h7', cover), `${cover}@320w_180h.jpg`);
  assert.equal(thumbnailFor('BV1GJ411x7h7', 'https://evil.example/a.jpg'), null); // 只收 hdslb.com
  assert.equal(thumbnailFor('BV1GJ411x7h7', 'http://i2.hdslb.com/a.jpg'), null);   // 只收 https
  assert.ok(isBilibiliCover(cover) && !isBilibiliCover('https://hdslb.com.evil.example/a.jpg') && !isBilibiliCover(''));
  assert.match(thumbnailFor('DYptgVvkVLQ'), /ytimg\.com/);
});

test('findDuplicates：同一支 bilibili 影片算重複', () => {
  const songs = [{ id: '1', userId: 'a', title: '某首歌', videoId: 'BV1GJ411x7h7' }];
  assert.deepEqual(findDuplicates({ title: '完全不同', videoId: 'BV1GJ411x7h7' }, songs).map((d) => d.level), ['same']);
});

test('normalizePasted：嵌入代碼換回影片網址', () => {
  const bili = '<iframe src="//player.bilibili.com/player.html?isOutside=true&aid=117393753899831&bvid=BV1Uppw6yEMr&cid=42513074607&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>';
  assert.equal(normalizePasted(bili), 'https://www.bilibili.com/video/BV1Uppw6yEMr');
  assert.equal(extractVideoId(normalizePasted(bili)), 'BV1Uppw6yEMr');
  assert.equal(normalizePasted(bili.replace('p=1', 'p=3')), 'https://www.bilibili.com/video/BV1Uppw6yEMr?p=3');
  assert.equal(normalizePasted('<iframe width="560" src="https://www.youtube.com/embed/DYptgVvkVLQ?si=x"></iframe>'), 'https://www.youtube.com/watch?v=DYptgVvkVLQ');
  // 不是 iframe、或不認得的網站：原樣（去頭尾空白）
  assert.equal(normalizePasted('  https://youtu.be/DYptgVvkVLQ '), 'https://youtu.be/DYptgVvkVLQ');
  assert.equal(normalizePasted('<iframe src="https://evil.example/x"></iframe>'), '<iframe src="https://evil.example/x"></iframe>');
  assert.equal(normalizePasted(null), '');
});

test('parseShared：分享文字取出網址與備用歌名', () => {
  // bilibili 分享（歌名被最外層【】包住，裡面還有自己的【】）
  const share = '【【纯k投屏】「IF*Else」——mochari ディメンション凸ラバース!!  ED】 https://www.bilibili.com/video/BV1Va9yBmEfH/?share_source=copy_web';
  const r = parseShared(share);
  assert.equal(r.url, 'https://www.bilibili.com/video/BV1Va9yBmEfH/?share_source=copy_web');
  assert.equal(r.title, '【纯k投屏】「IF*Else」——mochari ディメンション凸ラバース!! ED');
  assert.equal(extractVideoId(r.url), 'BV1Va9yBmEfH');
  // 手機分享：標題尾巴是「-哔哩哔哩」，網址是 b23.tv 短網址
  const mobile = parseShared('【【纯k投屏】「IF*Else」——mochari ディメンション凸ラバース!!  ED-哔哩哔哩】 https://b23.tv/Ck414WP');
  assert.equal(mobile.url, 'https://b23.tv/Ck414WP');
  assert.equal(mobile.title, '【纯k投屏】「IF*Else」——mochari ディメンション凸ラバース!! ED');
  // 只有網址：沒有備用歌名
  assert.deepEqual(parseShared('https://youtu.be/DYptgVvkVLQ'), { url: 'https://youtu.be/DYptgVvkVLQ', title: '' });
  // 一般「歌名 網址」；網址後面緊接中文標點時不要吃進去
  assert.deepEqual(parseShared('告白氣球 https://youtu.be/DYptgVvkVLQ。'), { url: 'https://youtu.be/DYptgVvkVLQ', title: '告白氣球' });
  // 標題末尾的網站名稱要去掉
  assert.equal(parseShared('某首歌_哔哩哔哩_bilibili https://www.bilibili.com/video/BV1Va9yBmEfH').title, '某首歌');
  // 嵌入代碼照舊可用
  assert.equal(parseShared('<iframe src="//player.bilibili.com/player.html?bvid=BV1Uppw6yEMr&p=1"></iframe>').url, 'https://www.bilibili.com/video/BV1Uppw6yEMr');
  // 沒有網址：原樣回傳
  assert.deepEqual(parseShared('隨便打字'), { url: '隨便打字', title: '' });
});

test('embedUrl 只給 bilibili', () => {
  assert.match(embedUrl('BV1Uppw6yEMr'), /^https:\/\/player\.bilibili\.com\/player\.html\?.*bvid=BV1Uppw6yEMr.*autoplay=0/);
  assert.equal(embedUrl('DYptgVvkVLQ'), null);
  assert.equal(embedUrl(null), null);
});

test('extractPlaylistId', () => {
  assert.equal(extractPlaylistId('https://www.youtube.com/playlist?list=PLabc_DEF-123'), 'PLabc_DEF-123');
  assert.equal(extractPlaylistId('https://www.youtube.com/watch?v=DYptgVvkVLQ&list=PLx1'), 'PLx1');
  assert.equal(extractPlaylistId('https://example.com/?list=PLx1'), null);
});

test('normalizeTitle 去掉 MV、Official Video、全形與標點', () => {
  assert.equal(normalizeTitle('周杰倫【晴天】Official Music Video'), normalizeTitle('周杰倫 晴天'));
  assert.equal(normalizeTitle('Shape Of You (Official Video) [4K]'), 'shapeofyou');
  assert.equal(normalizeTitle('ＡＢＣ　ｍｖ'), 'abc');
});

test('findDuplicates：同影片、同名、包含關係', () => {
  const songs = [
    { id: '1', userId: 'a', title: '周杰倫 Jay Chou【晴天 Sunny Day】-Official Music Video', videoId: 'DYptgVvkVLQ' },
    { id: '2', userId: 'b', title: '告白氣球', videoId: null },
    { id: '3', userId: 'c', title: '光年之外', videoId: 'T4SimnaiktU' },
  ];
  // 同一支影片，標題不同也算
  assert.deepEqual(findDuplicates({ title: '隨便', videoId: 'DYptgVvkVLQ' }, songs).map((d) => [d.song.id, d.level]), [['1', 'same']]);
  // 歌名相同（大小寫、空白不同）
  assert.deepEqual(findDuplicates({ title: ' 告白 氣球 ' }, songs).map((d) => [d.song.id, d.level]), [['2', 'same']]);
  // 包含關係 → 可能重複
  assert.deepEqual(findDuplicates({ title: '晴天' }, songs).map((d) => [d.song.id, d.level]), [['1', 'similar']]);
  // 排除自己
  assert.equal(findDuplicates(songs[2], songs, { excludeId: '3' }).length, 0);
  // 單一字不比對包含，避免誤判
  assert.equal(findDuplicates({ title: '天' }, songs).length, 0);
});

test('cleanNickname', () => {
  assert.equal(cleanNickname('  小  明\n'), '小 明');
  assert.equal([...cleanNickname('一'.repeat(30))].length, 20);
  assert.equal(cleanNickname(null), '');
});
