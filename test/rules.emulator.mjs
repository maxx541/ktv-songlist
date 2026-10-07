// Firestore 規則測試：對本機模擬器（預設 127.0.0.1:8080，專案 demo-ktv）送 REST 請求，檢查哪些寫入該被擋。
// 用法：
//   firebase emulators:start --only firestore --project demo-ktv   （或已經有模擬器在跑）
//   node test/rules.emulator.mjs
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/demo-ktv/databases/(default)/documents`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = (uid) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ user_id: uid, sub: uid, aud: 'demo-ktv', firebase: { sign_in_provider: 'anonymous' } })}.`;

function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { integerValue: String(v) };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  throw new Error('unsupported');
}
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)]));
const now = new Date();

async function write(as, path, data, { mask } = {}) {
  const q = mask ? '?' + mask.map((m) => `updateMask.fieldPaths=${m}`).join('&') : '';
  const res = await fetch(`${BASE}/${path}${q}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${as === 'owner' ? 'owner' : tokenFor(as)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields(data) }),
  });
  return res.ok;
}

/** 一次寫入多個文件（同一批，規則用 existsAfter 看得到批次內的新文件） */
async function commit(as, writes) {
  const res = await fetch(`${BASE.replace('/documents', '')}/documents:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(as)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: writes.map((w) => ({
        update: { name: `projects/demo-ktv/databases/(default)/documents/${w.path}`, fields: fields(w.data) },
        ...(w.mask ? { updateMask: { fieldPaths: w.mask } } : {}),
      })),
    }),
  });
  return res.ok;
}

let failed = 0;
function check(name, got, want) {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? '通過' : '失敗'}  ${name}（${got ? '允許' : '拒絕'}，預期${want ? '允許' : '拒絕'}）`);
}

const user = (n) => ({ nickname: n, nicknameKey: `n_${n}`, avatar: null, provider: 'anonymous', createdAt: now, updatedAt: now });
for (const n of ['alice', 'bob']) {
  await write('owner', `nicknames/n_${n}`, { uid: n === 'alice' ? 'u1' : 'u2' });
  await write('owner', `users/${n === 'alice' ? 'u1' : 'u2'}`, user(n));
}
await write('owner', 'events/e_old', { name: 'x', date: '', place: '', createdBy: 'u1', createdAt: now, updatedAt: now });
await fetch(`${BASE}/events/e_old`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } }); // 清掉上一輪留下的

const ev = (over = {}) => ({ name: '週五唱歌', date: '2026-10-10', place: '好樂迪', createdBy: 'u1', createdAt: now, updatedAt: now, ...over });
check('登入的人可以建立活動', await write('u1', 'events/e1', ev()), true);
check('不能用別人的名義建立活動', await write('u2', 'events/e2', ev({ createdBy: 'u1' })), false);
check('日期格式錯誤被擋', await write('u1', 'events/e3', ev({ date: '10/10/2026' })), false);
check('名稱空白被擋', await write('u1', 'events/e4', ev({ name: '' })), false);
check('日期與位置可以留空', await write('u1', 'events/e5', ev({ date: '', place: '' })), true);
check('建立者可以改活動', await write('u1', 'events/e1', ev({ name: '週五唱歌（改）' })), true);
check('別人不能改活動', await write('u2', 'events/e1', ev({ name: '被改了', createdBy: 'u2' })), false);
check('不能刪除活動', (await fetch(`${BASE}/events/e1`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokenFor('u1')}` } })).ok, false);

check('參與存在的活動', await write('u1', 'users/u1', { ...user('alice'), eventId: 'e1' }), true);
check('不能參與不存在的活動', await write('u1', 'users/u1', { ...user('alice'), eventId: 'nope' }), false);
check('可以改回「都不參與」（空字串）', await write('u1', 'users/u1', { ...user('alice'), eventId: '' }), true);
check('舊格式（沒有 eventId）的個人資料仍可寫入', await write('u2', 'users/u2', user('bob')), true);

const song = (over = {}) => ({ userId: 'u1', title: '告白氣球', url: 'https://youtu.be/DYptgVvkVLQ', videoId: 'DYptgVvkVLQ', channel: '', thumb: '', order: 1, createdAt: now, updatedAt: now, ...over });
check('歌可以存進存在的活動', await write('u1', 'songs/s1', song({ eventId: 'e1' })), true);
check('歌不能存進不存在的活動', await write('u1', 'songs/s2', song({ eventId: 'nope' })), false);
check('舊格式的歌（沒有 eventId）仍可寫入', await write('u1', 'songs/s3', song()), true);
check('不能替別人點歌', await write('u2', 'songs/s4', song({ eventId: 'e1' })), false);

check('建立活動並同時參與（同一批寫入）', await commit('u2', [
  { path: 'events/e9', data: ev({ createdBy: 'u2' }) },
  { path: 'users/u2', data: { eventId: 'e9', updatedAt: now }, mask: ['eventId', 'updatedAt'] },
]), true);

console.log(failed ? `\n${failed} 項失敗` : '\n全部通過');
process.exit(failed ? 1 : 0);
