// Foto struk: baca (Gemini Vision) -> simpan ke _State -> pilih item (tombol / ketik nomor atau nama) -> hitung proporsional.
import { downloadFile, editMarkup, esc, send } from './telegram.js';
import { extract } from './gemini.js';
import { setState } from './sheets.js';
import { allocateSelection, bulletLines, computeTotals, isValidISODate, matchKategori, parseSelection, rupiah, stale } from './calculator.js';
import { categoriesOf, geminiCtx, newId, processNormalized, processRaws } from './transaksi.js';

const quiet = (p) => Promise.resolve(p).catch(() => {});

function render(p) {
  const rows = p.lines.map((l, i) => `${i + 1}. ${esc(l.nama)}${l.qty !== 1 ? ` x${l.qty}` : ''} — ${rupiah(l.line)}`);
  return [
    `🧾 <b>${esc(p.title)}</b> · ${p.tanggal}`,
    ...rows,
    '',
    `Subtotal: ${rupiah(p.subtotal)}`,
    ...(p.adjust ? [`Pajak/service/diskon: ${p.adjust > 0 ? '+' : ''}${rupiah(p.adjust)}`] : []),
    `<b>Total: ${rupiah(p.subtotal + p.adjust)}</b>`,
    ...(p.warning ? [`⚠️ ${esc(p.warning)}`] : []),
    '',
    'Atau ketik nomor item yang kamu bayar saja (contoh: <code>1, 3</code> atau <code>ayam dan nasi</code>).',
  ].join('\n');
}

async function startSelection(ctx, raw, totals) {
  const payload = {
    nonce: newId(),
    title: String(raw.title ?? '').trim().slice(0, 60) || 'Struk',
    kategori: matchKategori(raw.kategori, categoriesOf(ctx)),
    tanggal: isValidISODate(raw.tanggal) ? raw.tanggal : ctx.today.iso,
    metode: String(raw.metode_bayar ?? '').trim().slice(0, 30),
    hitung: !raw.is_incidental,
    catatan: (Array.isArray(raw.catatan) ? raw.catatan : []).map((c) => `• ${String(c).trim()}`).filter((c) => c !== '• '),
    lines: totals.lines,
    subtotal: totals.subtotal,
    adjust: totals.adjust,
    warning: totals.warning,
  };
  await setState(ctx.state, 'AWAITING_RECEIPT_SELECTION', payload);
  await send(ctx.chatId, render(payload), {
    reply_markup: { inline_keyboard: [[{ text: '✅ Simpan Semua', callback_data: `rc:${payload.nonce}:all` }, { text: '❌ Batal', callback_data: `rc:${payload.nonce}:no` }]] },
  });
}

export async function handlePhoto(ctx, msg) {
  const photo = msg.photo.at(-1);
  const data = await downloadFile(photo.file_id, 8 * 1024 * 1024);
  await send(ctx.chatId, '🔍 Membaca struk…');
  const raws = await extract({ prompt: geminiCtx(ctx), text: msg.caption || 'Ini foto struk atau bukti pembayaran.', media: { mime: 'image/jpeg', data } });
  if (!raws.length) return send(ctx.chatId, 'Aku tidak bisa membaca transaksi dari foto itu. Coba foto lebih dekat, terang, dan tegak, atau ketik manual.');
  const totals = computeTotals(raws[0]);
  if (raws.length === 1 && totals.lines.length >= 2) return startSelection(ctx, raws[0], totals);
  return processRaws(ctx, raws);
}

async function finalize(ctx, p, idxs) {
  const al = allocateSelection(p, idxs);
  if (!(al.nominal > 0)) return send(ctx.chatId, 'Total item terpilih 0. Pilih item lain.');
  await setState(ctx.state, 'IDLE');
  const tx = {
    title: p.title,
    kategori: p.kategori,
    tanggal: p.tanggal,
    nominal: al.nominal,
    deskripsi: [...bulletLines(al.chosen), ...p.catatan].join('\n'),
    metode: p.metode,
    hitung: p.hitung,
    warning: p.warning,
  };
  return processNormalized(ctx, [tx]);
}

const fresh = (st) => st.state === 'AWAITING_RECEIPT_SELECTION' && st.payload && !stale(st.updatedAt);

// Teks bebas saat menunggu pilihan: true = sudah diproses sebagai pilihan; false = bukan pilihan (lanjut jadi transaksi biasa).
export async function handleSelectionText(ctx, text) {
  if (!fresh(ctx.state)) return false;
  const sel = parseSelection(text, ctx.state.payload.lines);
  if (!sel) return false;
  if (sel.invalid) {
    await send(ctx.chatId, `Nomor di luar daftar. Pilih 1 sampai ${ctx.state.payload.lines.length}.`);
    return true;
  }
  await finalize(ctx, ctx.state.payload, sel.idx);
  return true;
}

export async function handleReceiptCallback(ctx, cbq, nonce, choice) {
  const msgId = cbq.message.message_id;
  const st = ctx.state;
  await quiet(editMarkup(ctx.chatId, msgId));
  if (!fresh(st) || st.payload.nonce !== nonce) return send(ctx.chatId, 'Struk ini sudah kedaluwarsa atau sudah diproses. Kirim ulang fotonya kalau perlu.');
  if (choice === 'no') {
    await setState(st, 'IDLE');
    return send(ctx.chatId, '❌ Struk dibatalkan. Tidak ada yang disimpan.');
  }
  return finalize(ctx, st.payload, st.payload.lines.map((_, i) => i));
}
