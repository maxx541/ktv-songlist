import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractVideoId, extractPlaylistId, normalizeTitle, findDuplicates, cleanNickname, isVideoId, videoUrl, thumbnailFor } from '../docs/shared.js';

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
  assert.match(thumbnailFor('DYptgVvkVLQ'), /ytimg\.com/);
});

test('findDuplicates：同一支 bilibili 影片算重複', () => {
  const songs = [{ id: '1', userId: 'a', title: '某首歌', videoId: 'BV1GJ411x7h7' }];
  assert.deepEqual(findDuplicates({ title: '完全不同', videoId: 'BV1GJ411x7h7' }, songs).map((d) => d.level), ['same']);
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
