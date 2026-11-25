// Alur utama pencatatan: ekstrak (Gemini) -> normalisasi (kode) -> cek masa depan/ganda -> simpan -> budget.
import { randomBytes } from 'node:crypto';
import { appendRows, readTransaksi, setState, updateRange } from './sheets.js';
import { downloadFile, editMarkup, esc, send } from './telegram.js';
import { extract } from './gemini.js';
import {
  budgetStats, burnTooFast, crossedLimit, daysInMonth, isActive, isDuplicate, milestoneToAlert, normalizeTx, rupiah, stale, tzOffsetLabel,
} from './calculator.js';

export const newId = () => randomBytes(4).toString('hex');
export const categoriesOf = (ctx) => (ctx.kategori.length ? ctx.kategori.map((k) => k.nama) : ['Lainnya']);
export const geminiCtx = (ctx) => ({
  tz: ctx.tz, offset: tzOffsetLabel(ctx.tz), today: ctx.today.iso, weekday: ctx.today.weekday, categories: categoriesOf(ctx),
});
const quiet = (p) => Promise.resolve(p).catch(() => {});

// Siapa saja yang satu "kolam" budget dengan user ini, dan targetnya (keluarga = target milik Admin).
export function scopeOf(user, users) {
  if (user.mode === 'Keluarga') {
    const ids = users.filter((u) => u.mode === 'Keluarga').map((u) => u.id);
    if (!ids.includes(user.id)) ids.push(user.id);
    const admin = users.find((u) => u.role === 'Admin') ?? user;
    return { ids, target: admin.target, record: admin, family: true };
  }
  return { ids: [user.id], target: user.target, record: user, family: false };
}

export const buttonsFor = (id, withNb = true) => ({
  inline_keyboard: [[{ text: '🗑️ Hapus', callback_data: `del:${id}` }, ...(withNb ? [{ text: '🚫 Di Luar Budget', callback_data: `nb:${id}` }] : [])]],
});

export function txBlock(tx, header = '✅ Tercatat') {
  return [
    header,
    `🏷️ <b>${esc(tx.title)}</b> · ${esc(tx.kategori)}`,
    `💵 ${rupiah(tx.nominal)} · 📅 ${tx.tanggal}${tx.metode ? ` · ${esc(tx.metode)}` : ''}`,
    ...(tx.hitung ? [] : ['🚫 Di luar budget']),
    ...(tx.deskripsi ? [esc(tx.deskripsi)] : []),
    ...(tx.warning ? [`⚠️ ${esc(tx.warning)}`] : []),
  ].join('\n');
}

// Baris ringkasan budget + peringatan milestone (sekali per ambang) + burn rate.
export async function budgetBlock(ctx, rows) {
  const { ids, target, record, family } = scopeOf(ctx.user, ctx.users);
  if (!(target > 0)) return ['ℹ️ Target budget belum diatur. Ketik <code>/setbudget 5jt</code> (hanya Admin untuk mode keluarga).'];
  const { year, month, day, ym } = ctx.today;
  const st = budgetStats({ rows, scopeIds: ids, ym, target, day, dim: daysInMonth(year, month) });
  const lines = [`📊 Terpakai: ${Math.round(st.pct)}% (${rupiah(st.spent)} / ${rupiah(target)})`];
  if (burnTooFast(st.pct, st.dayPct, day)) {
    lines.push(`🔥 Burn rate terlalu cepat: ${Math.round(st.pct)}% budget habis di ${Math.round(st.dayPct)}% perjalanan bulan.`);
  }
  const last = record.alertMonth === ym ? record.lastMilestone : 0;
  const m = milestoneToAlert(st.pct, last);
  if (m) {
    await updateRange('Config_Users', `F${record.row}:G${record.row}`, [[m, ym]]);
    record.lastMilestone = m;
    record.alertMonth = ym;
    const msg = m >= 100 ? `⛔ Budget bulan ini sudah TERLAMPAUI (${Math.round(st.pct)}%).` : m >= 90 ? '🚨 Budget sudah 90% terpakai!' : '⚠️ Budget sudah 75% terpakai.';
    lines.push(msg);
    if (family) {
      for (const id of ids.filter((i) => i !== ctx.user.id)) {
        await quiet(send(id, `${msg}\n(${rupiah(st.spent)} / ${rupiah(target)}, dicatat oleh ${esc(ctx.user.nama)})`));
      }
    }
  }
  return lines;
}

function limitWarnings(ctx, rows, saved) {
  const { ids } = scopeOf(ctx.user, ctx.users);
  const byCat = {};
  for (const t of saved) if (t.tanggal.startsWith(ctx.today.ym)) byCat[t.kategori] = (byCat[t.kategori] ?? 0) + t.nominal;
  return Object.entries(byCat).flatMap(([kategori, newSum]) => {
    const limit = ctx.kategori.find((k) => k.nama === kategori)?.limit ?? 0;
    return crossedLimit({ rows, ids, ym: ctx.today.ym, kategori, limit, newSum })
      ? [`⚠️ Kategori <b>${esc(kategori)}</b> melewati limit ${rupiah(limit)} bulan ini.`]
      : [];
  });
}

export async function saveAndReport(ctx, txs, rows) {
  const stamp = new Date().toISOString();
  const saved = txs.map((t) => ({ ...t, id: newId() }));
  await appendRows(
    'Transaksi',
    saved.map((t) => [t.id, ctx.updateId, stamp, t.tanggal, Number(ctx.user.id), ctx.user.nama, t.kategori, t.title, t.deskripsi, t.nominal, t.metode, t.hitung, 'ACTIVE']),
  );
  for (const t of saved) {
    rows.push({ row: 0, id: t.id, ts: stamp, tanggal: t.tanggal, userId: ctx.user.id, nama: ctx.user.nama, kategori: t.kategori, title: t.title, deskripsi: t.deskripsi, nominal: t.nominal, metode: t.metode, hitung: t.hitung, status: 'ACTIVE' });
  }
  const footer = [...limitWarnings(ctx, rows, saved), ...(await budgetBlock(ctx, rows))].join('\n');
  for (let i = 0; i < saved.length; i++) {
    const text = txBlock(saved[i]) + (i === saved.length - 1 && footer ? `\n\n${footer}` : '');
    await send(ctx.chatId, text, { reply_markup: buttonsFor(saved[i].id, saved[i].hitung) });
  }
}

async function askConfirm(ctx, flagged) {
  const nonce = newId();
  const state = flagged.some((f) => f.reasons.some((r) => r.includes('masa depan'))) ? 'AWAITING_FUTURE_DATE_CONFIRM' : 'AWAITING_DUPLICATE_CONFIRM';
  await setState(ctx.state, state, { nonce, txs: flagged.map((f) => f.tx) });
  const body = flagged.map((f) => `${txBlock(f.tx, '🧾')}\n${f.reasons.map((r) => `⚠️ ${esc(r)}`).join('\n')}`).join('\n\n');
  await send(ctx.chatId, `❓ <b>Perlu konfirmasi</b>\n\n${body}\n\nTetap simpan?`, {
    reply_markup: { inline_keyboard: [[{ text: '✅ Ya, Simpan', callback_data: `cf:${nonce}:y` }, { text: '❌ Batal', callback_data: `cf:${nonce}:n` }]] },
  });
}

export async function processNormalized(ctx, txs, rows) {
  rows ??= await readTransaksi();
  const now = Date.now();
  const clean = [];
  const flagged = [];
  for (const tx of txs) {
    const reasons = [];
    if (tx.tanggal > ctx.today.iso) reasons.push(`Tanggal ${tx.tanggal} ada di masa depan.`);
    if (isDuplicate(rows, ctx.user.id, tx, now)) reasons.push('Mirip dengan transaksi yang baru dicatat (kurang dari 10 menit lalu).');
    (reasons.length ? flagged : clean).push({ tx, reasons });
  }
  if (clean.length) await saveAndReport(ctx, clean.map((c) => c.tx), rows);
  if (flagged.length) await askConfirm(ctx, flagged);
}

export async function processRaws(ctx, raws) {
  const txs = [];
  const errors = [];
  for (const raw of raws) {
    const r = normalizeTx(raw, { categories: categoriesOf(ctx), today: ctx.today.iso });
    if (r.error) errors.push(r.error);
    else txs.push(r.tx);
  }
  for (const e of errors) await send(ctx.chatId, `⚠️ ${esc(e)}`);
  if (txs.length) await processNormalized(ctx, txs);
}

export async function handleText(ctx, text) {
  const raws = await extract({ prompt: geminiCtx(ctx), text });
  if (!raws.length) {
    return send(ctx.chatId, 'Aku tidak menemukan transaksi di pesan itu.\nContoh: <code>kopi 20rb</code>, <code>kemarin bensin 50rb</code>, atau <code>beli kopi 20rb dan parkir 5rb</code>. Ketik /start untuk bantuan.');
  }
  return processRaws(ctx, raws);
}

export async function handleVoice(ctx, msg) {
  const v = msg.voice;
  if ((v.duration ?? 0) > 60) return send(ctx.chatId, '🎙️ Voice note maksimal 60 detik. Coba pecah jadi beberapa pesan.');
  const data = await downloadFile(v.file_id, 5 * 1024 * 1024);
  const raws = await extract({ prompt: geminiCtx(ctx), text: 'Ini pesan suara dari user. Dengarkan lalu ekstrak transaksinya.', media: { mime: 'audio/ogg', data } });
  if (!raws.length) return send(ctx.chatId, '🎙️ Aku tidak menangkap transaksi dari suaranya. Coba ulangi dengan lebih jelas, atau ketik manual.');
  return processRaws(ctx, raws);
}

export async function handleConfirm(ctx, cbq, nonce, choice) {
  const st = ctx.state;
  const chat = ctx.chatId;
  const msgId = cbq.message.message_id;
  const valid = ['AWAITING_FUTURE_DATE_CONFIRM', 'AWAITING_DUPLICATE_CONFIRM'].includes(st.state) && st.payload?.nonce === nonce && !stale(st.updatedAt);
  await quiet(editMarkup(chat, msgId));
  if (!valid) return send(chat, 'Permintaan ini sudah kedaluwarsa atau sudah diproses.');
  const txs = st.payload.txs;
  await setState(st, 'IDLE');
  if (choice !== 'y') return send(chat, '❌ Dibatalkan. Tidak ada yang disimpan.');
  return saveAndReport(ctx, txs, await readTransaksi());
}

// Reply-to-Edit: id dari tombol "del:<id>" pada pesan yang di-reply; id=null -> transaksi ACTIVE terakhir milik user.
export async function editTransaction(ctx, msg, id) {
  const rows = await readTransaksi();
  const own = (r) => r.userId === ctx.user.id || ctx.user.role === 'Admin';
  let row;
  if (id) {
    row = rows.find((r) => r.id === id);
    if (!row || !isActive(row)) return send(ctx.chatId, 'Transaksi itu sudah dihapus atau tidak ditemukan.');
    if (!own(row)) return send(ctx.chatId, 'Kamu hanya bisa mengedit transaksimu sendiri.');
  } else {
    row = rows.filter((r) => isActive(r) && r.userId === ctx.user.id).at(-1);
    if (!row) return send(ctx.chatId, 'Belum ada transaksi aktif yang bisa diedit.');
  }
  const current = { title: row.title, kategori: row.kategori, tanggal: row.tanggal, nominal: row.nominal, deskripsi: row.deskripsi, metode_bayar: row.metode, is_incidental: !row.hitung };
  const raws = await extract({
    mode: 'edit',
    prompt: geminiCtx(ctx),
    text: `Transaksi saat ini: ${JSON.stringify(current)}\nKoreksi dari user: ${msg.text}`,
  });
  if (!raws.length) return send(ctx.chatId, 'Aku tidak mengerti koreksinya. Contoh: <code>salah, harusnya 78rb</code> atau <code>ganti tanggal ke kemarin</code>.');
  const r = normalizeTx(raws[0], { categories: categoriesOf(ctx), today: ctx.today.iso });
  if (r.error) return send(ctx.chatId, `⚠️ ${esc(r.error)}`);
  const tx = { ...r.tx, deskripsi: r.tx.deskripsi || row.deskripsi };
  if (tx.tanggal > ctx.today.iso) return send(ctx.chatId, 'Edit ke tanggal masa depan ditolak. Hapus transaksinya lalu catat ulang kalau memang disengaja.');
  await updateRange('Transaksi', `D${row.row}:L${row.row}`, [[tx.tanggal, Number(row.userId), row.nama, tx.kategori, tx.title, tx.deskripsi, tx.nominal, tx.metode, tx.hitung]]);
  Object.assign(row, { tanggal: tx.tanggal, kategori: tx.kategori, title: tx.title, deskripsi: tx.deskripsi, nominal: tx.nominal, metode: tx.metode, hitung: tx.hitung });
  const footer = (await budgetBlock(ctx, rows)).join('\n');
  return send(ctx.chatId, `${txBlock(tx, '✏️ Diperbarui')}\n\n${footer}`, { reply_markup: buttonsFor(row.id, tx.hitung) });
}
