// Tes alur end-to-end dengan Google Sheets, Gemini, dan Telegram palsu (fetch di-mock). Tanpa internet, tanpa kunci asli.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
Object.assign(process.env, {
  TELEGRAM_BOT_TOKEN: 'TOKEN', GEMINI_API_KEY: 'k', GOOGLE_SHEET_ID: 'SID', GOOGLE_SERVICE_ACCOUNT_EMAIL: 'bot@x.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: `"${privateKey.replace(/\n/g, '\\n')}"`, // sengaja pakai \n literal + tanda kutip, seperti saat di-paste ke Vercel
  ADMIN_TELEGRAM_ID: '111', TELEGRAM_WEBHOOK_SECRET: 'rahasia', BOT_TZ: 'Asia/Makassar',
});

const tabs = { Config_Users: [], Kategori: [['Makanan & Minuman', 0], ['Transportasi', 0], ['Lainnya', 0]], _State: [], Transaksi: [] };
const sent = [];
const geminiCalls = [];
let geminiQueue = [];
let mid = 100;
let uid = 0;
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
const col = (L) => L.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

function parseRange(r) {
  const m = /^'(.+)'!([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(r);
  return { tab: m[1], c0: col(m[2]), row: Number(m[3] || 1), c1: m[4] ? col(m[4]) : col(m[2]) };
}
function read(r) {
  const { tab, c0, c1, row } = parseRange(r);
  return tabs[tab].slice(row - 2).map((x) => x.slice(c0, c1 + 1));
}
function sheets(u, opts) {
  const path = decodeURIComponent(u.pathname.split('/spreadsheets/SID')[1]);
  if (path === '/values:batchGet') return json({ valueRanges: u.searchParams.getAll('ranges').map((r) => { const v = read(r); return v.length ? { values: v } : {}; }) });
  const range = path.replace('/values/', '');
  if (opts.method === 'POST') { // append
    const { tab } = parseRange(range.replace(/:append$/, ''));
    const first = tabs[tab].length + 2;
    const rows = JSON.parse(opts.body).values;
    tabs[tab].push(...rows.map((r) => [...r]));
    return json({ updates: { updatedRange: `'${tab}'!A${first}:M${first + rows.length - 1}` } });
  }
  if (opts.method === 'PUT') {
    const { tab, c0, row } = parseRange(range);
    JSON.parse(opts.body).values.forEach((vals, i) => {
      tabs[tab][row - 2 + i] ??= [];
      vals.forEach((v, j) => { tabs[tab][row - 2 + i][c0 + j] = v; });
    });
    return json({});
  }
  const v = read(range);
  return json(v.length ? { values: v } : {});
}

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(String(url));
  if (u.host === 'oauth2.googleapis.com') return json({ access_token: 't', expires_in: 3600 });
  if (u.host === 'sheets.googleapis.com') return sheets(u, opts);
  if (u.host === 'generativelanguage.googleapis.com') {
    geminiCalls.push(JSON.parse(opts.body));
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(geminiQueue.shift() ?? { transaksi: [] }) }] } }] });
  }
  if (u.host === 'api.telegram.org' && u.pathname.startsWith('/file/')) return new Response(Buffer.from('abc'));
  if (u.host === 'api.telegram.org') {
    const method = u.pathname.split('/').pop();
    if (method === 'getFile') return json({ ok: true, result: { file_path: 'f/x', file_size: 100 } });
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : { form: true };
    sent.push({ method, ...body });
    return json({ ok: true, result: { message_id: ++mid } });
  }
  if (u.host === 'quickchart.io') return new Response(Buffer.from('png'));
  throw new Error(`fetch tidak di-mock: ${url}`);
};

const { handleUpdate, default: handler } = await import('../api/webhook.js');
const FROM = { id: 111, first_name: 'Angel', is_bot: false };
const CHAT = { id: 111, type: 'private' };
const text = (t, extra = {}, from = FROM) => ({ update_id: ++uid, message: { message_id: ++mid, from, chat: { ...CHAT, id: from.id }, text: t, ...extra } });
const cb = (data) => ({ update_id: ++uid, callback_query: { id: `c${uid}`, from: FROM, data, message: { message_id: ++mid, chat: CHAT } } });
const lastMsg = () => sent.filter((s) => s.method === 'sendMessage').at(-1)?.text ?? '';
const tx = (o) => ({ title: 'Kopi', items: [], catatan: [], pajak: null, total_akhir: 20000, tanggal: null, kategori: 'Makanan & Minuman', metode_bayar: '', is_incidental: false, ...o });
const active = () => tabs.Transaksi.filter((r) => r[12] === 'ACTIVE');

test('orang asing ditolak tanpa menulis apa pun', async () => {
  await handleUpdate(text('kopi 20rb', {}, { id: 999, first_name: 'Asing', is_bot: false }));
  assert.match(lastMsg(), /belum terdaftar/);
  assert.match(lastMsg(), /999/);
  assert.equal(tabs._State.length, 0);
  assert.equal(tabs.Config_Users.length, 0);
  assert.equal(geminiCalls.length, 0);
});

test('/start: Admin otomatis terdaftar + ditanya budget', async () => {
  await handleUpdate(text('/start'));
  assert.deepEqual(tabs.Config_Users[0].slice(0, 4), [111, 'Angel', 'Admin', 'Pribadi']);
  assert.equal(tabs._State[0][1], 'AWAITING_BUDGET');
  assert.equal(tabs._State[0][4], uid);
  const q = sent.filter((s) => s.method === 'sendMessage').at(-1);
  assert.equal(q.reply_markup.inline_keyboard[0].length, 3);
});

test('jawaban budget bebas "4,5jt"', async () => {
  await handleUpdate(text('4,5jt'));
  assert.equal(tabs.Config_Users[0][4], 4500000);
  assert.equal(tabs._State[0][1], 'IDLE');
  assert.equal(geminiCalls.length, 0); // tidak perlu AI
});

test('transaksi teks tersimpan + ringkasan budget, update ganda diabaikan', async () => {
  geminiQueue = [{ transaksi: [tx({})] }];
  const u = text('kopi 20rb');
  await handleUpdate(u);
  assert.equal(tabs.Transaksi.length, 1);
  const r = tabs.Transaksi[0];
  assert.equal(r[1], u.update_id);
  assert.equal(r[9], 20000);
  assert.equal(r[11], true);
  assert.equal(r[12], 'ACTIVE');
  assert.equal(tabs._State[0][4], u.update_id);
  assert.match(lastMsg(), /✅ Tercatat/);
  assert.match(lastMsg(), /Terpakai: 0% \(Rp 20\.000 \/ Rp 4\.500\.000\)/);
  const calls = geminiCalls.length;
  await handleUpdate(u); // retry Telegram
  assert.equal(tabs.Transaksi.length, 1);
  assert.equal(geminiCalls.length, calls);
});

test('prompt Gemini berisi zona waktu & kategori dari sheet', () => {
  const sys = geminiCalls.at(-1).systemInstruction.parts[0].text;
  assert.match(sys, /Asia\/Makassar \(UTC\+08:00\)/);
  assert.match(sys, /Makanan & Minuman, Transportasi, Lainnya/);
});

test('transaksi identik < 10 menit minta konfirmasi (deteksi ganda)', async () => {
  geminiQueue = [{ transaksi: [tx({})] }];
  await handleUpdate(text('kopi 20rb'));
  assert.equal(tabs.Transaksi.length, 1);
  assert.equal(tabs._State[0][1], 'AWAITING_DUPLICATE_CONFIRM');
  const nonce = JSON.parse(tabs._State[0][2]).nonce;
  await handleUpdate(cb(`cf:${nonce}:n`));
  assert.equal(tabs.Transaksi.length, 1);
  assert.equal(tabs._State[0][1], 'IDLE');
});

test('tanggal masa depan minta konfirmasi, lalu simpan', async () => {
  geminiQueue = [{ transaksi: [tx({ title: 'Tiket konser', total_akhir: 300000, tanggal: '2099-01-01' })] }];
  await handleUpdate(text('tiket konser 300rb tgl 1 januari 2099'));
  assert.equal(tabs.Transaksi.length, 1);
  assert.equal(tabs._State[0][1], 'AWAITING_FUTURE_DATE_CONFIRM');
  const nonce = JSON.parse(tabs._State[0][2]).nonce;
  await handleUpdate(cb(`cf:${nonce}:y`));
  assert.equal(tabs.Transaksi.length, 2);
  assert.equal(tabs.Transaksi[1][3], '2099-01-01');
  await handleUpdate(cb(`cf:${nonce}:y`)); // tombol lama diklik lagi
  assert.equal(tabs.Transaksi.length, 2);
  assert.match(lastMsg(), /kedaluwarsa/);
});

test('multi-item dalam satu chat -> 2 baris', async () => {
  geminiQueue = [{ transaksi: [tx({ title: 'Bensin', total_akhir: 50000, kategori: 'Transportasi' }), tx({ title: 'Parkir', total_akhir: 5000, kategori: 'Transportasi' })] }];
  await handleUpdate(text('bensin 50rb dan parkir 5rb'));
  assert.deepEqual(tabs.Transaksi.slice(2).map((r) => [r[7], r[9]]), [['Bensin', 50000], ['Parkir', 5000]]);
});

test('foto struk: pilih "1, 3" -> total proporsional (pajak dibagi)', async () => {
  geminiQueue = [{ transaksi: [tx({ title: 'Warung X', items: [{ nama: 'Ayam geprek', harga_satuan: 25000, qty: 1 }, { nama: 'Es teh', harga_satuan: 8000, qty: 1 }, { nama: 'Nasi putih', harga_satuan: 7000, qty: 1 }], pajak: 4000, total_akhir: 44000 })] }];
  const before = geminiCalls.length;
  await handleUpdate({ update_id: ++uid, message: { message_id: ++mid, from: FROM, chat: CHAT, photo: [{ file_id: 'a' }, { file_id: 'b' }] } });
  assert.equal(geminiCalls.length, before + 1);
  assert.ok(geminiCalls.at(-1).contents[0].parts.some((p) => p.inline_data?.mime_type === 'image/jpeg'));
  assert.equal(tabs._State[0][1], 'AWAITING_RECEIPT_SELECTION');
  assert.match(lastMsg(), /1\. Ayam geprek/);
  const rows = tabs.Transaksi.length;
  await handleUpdate(text('1, 3'));
  assert.equal(tabs.Transaksi.length, rows + 1);
  const r = tabs.Transaksi.at(-1);
  assert.equal(r[9], 35200);
  assert.equal(r[8], '• Ayam geprek\n• Nasi putih');
  assert.equal(tabs._State[0][1], 'IDLE');
});

test('voice note dikirim ke Gemini sebagai audio/ogg', async () => {
  geminiQueue = [{ transaksi: [tx({ title: 'Cilok', total_akhir: 10000 })] }];
  await handleUpdate({ update_id: ++uid, message: { message_id: ++mid, from: FROM, chat: CHAT, voice: { file_id: 'v', duration: 5 } } });
  assert.ok(geminiCalls.at(-1).contents[0].parts.some((p) => p.inline_data?.mime_type === 'audio/ogg'));
  assert.equal(tabs.Transaksi.at(-1)[7], 'Cilok');
});

test('Reply-to-Edit lewat ID di tombol, tanpa baris baru', async () => {
  const row = tabs.Transaksi[0];
  const n = tabs.Transaksi.length;
  geminiQueue = [{ transaksi: [tx({ total_akhir: 78000 })] }];
  await handleUpdate(text('salah, harusnya 78rb', { reply_to_message: { from: { is_bot: true }, text: 'apa saja', reply_markup: { inline_keyboard: [[{ text: '🗑️ Hapus', callback_data: `del:${row[0]}` }]] } } }));
  assert.equal(tabs.Transaksi.length, n);
  assert.equal(row[9], 78000);
  assert.match(lastMsg(), /✏️ Diperbarui/);
});

test('Reply-to-Edit tanpa ID -> fallback transaksi ACTIVE terakhir', async () => {
  const last = tabs.Transaksi.at(-1);
  geminiQueue = [{ transaksi: [tx({ title: 'Cilok', total_akhir: 12000 })] }];
  await handleUpdate(text('harusnya 12rb', { reply_to_message: { from: { is_bot: true }, text: '✅ Tercatat\nCilok' } }));
  assert.equal(last[9], 12000);
});

test('Soft delete: tombol Hapus & /undo mengubah Status, tidak menghapus baris, dan budget mengabaikannya', async () => {
  const n = tabs.Transaksi.length;
  const victim = tabs.Transaksi[0];
  await handleUpdate(cb(`del:${victim[0]}`));
  assert.equal(victim[12], 'DELETED');
  await handleUpdate(text('/undo'));
  assert.equal(tabs.Transaksi.length, n);
  assert.equal(tabs.Transaksi.at(-1)[12], 'DELETED');
  const expected = tabs.Transaksi.filter((r) => r[12] === 'ACTIVE' && r[11] === true && String(r[3]).startsWith('2026') ).reduce((s, r) => s + r[9], 0);
  await handleUpdate(text('/budget'));
  assert.ok(lastMsg().includes(`Terpakai: Rp ${String(expected).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`), lastMsg());
});

test('Di Luar Budget: Hitung_Budget jadi FALSE', async () => {
  const row = active().at(-1);
  await handleUpdate(cb(`nb:${row[0]}`));
  assert.equal(row[11], false);
  assert.match(lastMsg(), /ditandai di luar budget/);
});

test('/invite menambah anggota & mode keluarga; /keluarga dan /cari berjalan', async () => {
  await handleUpdate(text('/invite 222222222 Rina'));
  assert.deepEqual(tabs.Config_Users[1].slice(0, 4), [222222222, 'Rina', 'Member', 'Keluarga']);
  assert.equal(tabs.Config_Users[0][3], 'Keluarga');
  await handleUpdate(text('/keluarga'));
  assert.match(lastMsg(), /Rina/);
  await handleUpdate(text('/cari bensin'));
  assert.match(lastMsg(), /Bensin/);
  await handleUpdate(text('/ekspor'));
  assert.equal(sent.at(-1).method, 'sendDocument');
});

test('anggota (Member) tidak boleh ubah target keluarga', async () => {
  await handleUpdate(text('/setbudget 9jt', {}, { id: 222222222, first_name: 'Rina', is_bot: false }));
  assert.equal(tabs.Config_Users[0][4], 4500000);
  assert.match(lastMsg(), /hanya bisa diubah oleh Admin/);
});

test('/laporan mengirim grafik + analisis', async () => {
  geminiQueue = [];
  await handleUpdate(text('/laporan'));
  assert.ok(sent.some((s) => s.method === 'sendPhoto'));
  assert.match(lastMsg(), /Laporan/);
});

test('webhook menolak tanpa secret token yang benar', async () => {
  const mk = () => { const r = { code: 0, status(c) { r.code = c; return r; }, send() { return r; } }; return r; };
  let res = mk();
  await handler({ method: 'POST', headers: {}, body: text('x') }, res);
  assert.equal(res.code, 401);
  res = mk();
  await handler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'salah' }, body: text('x') }, res);
  assert.equal(res.code, 401);
  res = mk();
  await handler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'rahasia' }, body: { update_id: ++uid } }, res);
  assert.equal(res.code, 200);
  res = mk();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 405);
});
