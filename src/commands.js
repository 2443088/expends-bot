// Slash commands + tombol inline (Hapus, Di Luar Budget, budget cepat, konfirmasi, pilihan struk).
import { appendRows, readTransaksi, setState, updateRange } from './sheets.js';
import { editMarkup, editText, esc, send, sendFile } from './telegram.js';
import { generateText } from './gemini.js';
import {
  budgetStats, csvCell, daysInMonth, isActive, namaBulan, parseCommand, parseNominal, prevMonthKey, rupiah, sumBy,
} from './calculator.js';
import { budgetBlock, buttonsFor, handleConfirm, scopeOf } from './transaksi.js';
import { handleReceiptCallback } from './receipt.js';

const quiet = (p) => Promise.resolve(p).catch(() => {});

export const HELP = [
  '<b>Expends Bot</b>: catat keuangan tanpa ribet.',
  '',
  '<b>Cara mencatat</b>',
  '• Ketik: <code>kopi 20rb</code>, <code>kemarin bensin 50rb</code>, <code>beli kopi 20rb dan parkir 5rb</code>',
  '• Kirim <b>voice note</b> (maks 60 detik)',
  '• Kirim <b>foto struk</b>, lalu pilih item yang kamu bayar',
  '• <b>Reply</b> pesan "✅ Tercatat" dengan koreksi, mis. <i>salah, harusnya 78rb</i>',
  '',
  '<b>Perintah</b>',
  '/budget: sisa anggaran &amp; batas aman harian',
  '/setbudget <code>5jt</code>: ubah target bulanan',
  '/laporan: ringkasan + grafik + saran',
  '/undo: hapus transaksi terakhirmu',
  '/cari <code>kata</code>: cari riwayat',
  '/ekspor: unduh CSV bulan ini',
  '/sheet: buka Google Sheets',
  '/keluarga: anggota &amp; kontribusi',
  '/invite <code>id nama</code>: tambah anggota (Admin)',
].join('\n');

const BUDGET_KB = {
  inline_keyboard: [[
    { text: 'Rp 3.000.000', callback_data: 'bd:3000000' },
    { text: 'Rp 5.000.000', callback_data: 'bd:5000000' },
    { text: 'Rp 10.000.000', callback_data: 'bd:10000000' },
  ]],
};

const canSetBudget = (ctx) => !(scopeOf(ctx.user, ctx.users).family && ctx.user.role !== 'Admin');

export async function onboard(ctx) {
  await send(ctx.chatId, `Halo <b>${esc(ctx.user.nama)}</b>! 👋\n\n${HELP}`);
  if (scopeOf(ctx.user, ctx.users).target <= 0 && canSetBudget(ctx)) {
    await setState(ctx.state, 'AWAITING_BUDGET');
    await send(ctx.chatId, '💰 Berapa target <b>maksimal pengeluaran per bulan</b>? Pilih tombol, atau ketik angkanya (contoh: <code>4,5jt</code>).', { reply_markup: BUDGET_KB });
  }
}

export async function setBudget(ctx, amount) {
  const { family, record } = scopeOf(ctx.user, ctx.users);
  if (!canSetBudget(ctx)) return send(ctx.chatId, 'Target budget keluarga hanya bisa diubah oleh Admin.');
  await updateRange('Config_Users', `E${record.row}:G${record.row}`, [[amount, 0, ctx.today.ym]]);
  Object.assign(record, { target: amount, lastMilestone: 0, alertMonth: ctx.today.ym });
  if (ctx.state.state === 'AWAITING_BUDGET') await setState(ctx.state, 'IDLE');
  return send(ctx.chatId, `✅ Target budget bulanan${family ? ' keluarga' : ''}: <b>${rupiah(amount)}</b>`);
}

// Jawaban bebas untuk pertanyaan budget. Hanya angka polos >= Rp 100.000 yang dianggap jawaban (kalau tidak, itu transaksi biasa).
export async function tryBudgetAnswer(ctx, text) {
  if (ctx.state.state !== 'AWAITING_BUDGET') return false;
  const n = parseNominal(text);
  if (!n || n < 100000) return false;
  await setBudget(ctx, n);
  return true;
}

// ---------- perintah ----------
async function start(ctx) {
  return onboard(ctx);
}

async function setbudgetCmd(ctx, args) {
  const n = parseNominal(args);
  if (!n) return send(ctx.chatId, 'Format: <code>/setbudget 5jt</code> atau <code>/setbudget 4.500.000</code>');
  return setBudget(ctx, n);
}

async function budgetCmd(ctx) {
  const { ids, target, family } = scopeOf(ctx.user, ctx.users);
  if (!(target > 0)) return send(ctx.chatId, 'Target budget belum diatur. Ketik <code>/setbudget 5jt</code>.');
  const { year, month, day, ym } = ctx.today;
  const st = budgetStats({ rows: await readTransaksi(), scopeIds: ids, ym, target, day, dim: daysInMonth(year, month) });
  const over = st.remaining < 0;
  return send(ctx.chatId, [
    `💰 <b>Budget ${namaBulan(ym)}</b>${family ? ' (keluarga)' : ''}`,
    `Target: ${rupiah(target)}`,
    `Terpakai: ${rupiah(st.spent)} (${Math.round(st.pct)}%)`,
    over ? `⛔ Terlampaui ${rupiah(-st.remaining)}` : `Sisa: ${rupiah(st.remaining)}`,
    `Sisa hari: ${st.daysLeft} (termasuk hari ini)`,
    over ? 'Batas aman harian: Rp 0' : `✅ Batas aman per hari: <b>${rupiah(st.safeDaily)}</b>`,
    '',
    '<i>Hanya transaksi bertanda "dihitung budget" yang masuk.</i>',
  ].join('\n'));
}

async function qcPie(labels, data, title) {
  const res = await fetch('https://quickchart.io/chart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: '4', backgroundColor: 'white', width: 700, height: 500, format: 'png',
      chart: { type: 'pie', data: { labels, datasets: [{ data }] }, options: { plugins: { title: { display: true, text: title }, legend: { position: 'right' } } } },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`QuickChart ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function laporanCmd(ctx) {
  const rows = await readTransaksi();
  const { ids, target, family } = scopeOf(ctx.user, ctx.users);
  const { year, month, day, ym } = ctx.today;
  const cur = sumBy(rows, 'kategori', { ids, ym });
  if (!cur.total) return send(ctx.chatId, `Belum ada pengeluaran di ${namaBulan(ym)}.`);
  const prev = sumBy(rows, 'kategori', { ids, ym: prevMonthKey(ym), maxDay: day });
  const sorted = Object.entries(cur.groups).sort((a, b) => b[1] - a[1]);
  const pct = (v) => Math.round((v / cur.total) * 100);
  const delta = prev.total ? Math.round(((cur.total - prev.total) / prev.total) * 100) : null;

  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
  const labels = [...top.map(([k, v]) => `${k} (${rupiah(v)})`), ...(rest ? [`Lainnya (${rupiah(rest)})`] : [])];
  const data = [...top.map(([, v]) => v), ...(rest ? [rest] : [])];
  try {
    const png = await qcPie(labels, data, `Pengeluaran ${namaBulan(ym)}`);
    await sendFile('sendPhoto', 'photo', ctx.chatId, png, 'laporan.png', 'image/png', `📊 Total ${rupiah(cur.total)}`);
  } catch (e) {
    console.error('chart gagal', e);
  }

  let analysis = '';
  try {
    const facts = {
      bulan: namaBulan(ym), total: cur.total, total_bulan_lalu_periode_sama: prev.total, perubahan_persen: delta,
      kategori: sorted.map(([nama, total]) => ({ nama, total, persen: pct(total) })),
      ...(target > 0 ? (() => { const st = budgetStats({ rows, scopeIds: ids, ym, target, day, dim: daysInMonth(year, month) }); return { budget: { target, terpakai: st.spent, persen_terpakai: Math.round(st.pct), persen_hari_berlalu: Math.round(st.dayPct) } }; })() : {}),
    };
    analysis = await generateText(
      `Kamu analis keuangan pribadi. Dari FACTS (JSON) tulis analisis singkat bahasa Indonesia santai: 1 kalimat tren/pos terbesar, lalu 2 saran penghematan konkret. ATURAN: pakai HANYA angka yang ada di FACTS, jangan menghitung atau mengarang angka baru. Tanpa markdown, tanpa judul.\nFACTS:\n${JSON.stringify(facts)}`,
    );
  } catch (e) {
    console.error('analisis gagal', e);
  }

  const lines = [
    `📊 <b>Laporan ${namaBulan(ym)}</b>${family ? ' (keluarga)' : ''}`,
    `Total: <b>${rupiah(cur.total)}</b>${delta === null ? '' : ` (${delta >= 0 ? '↑' : '↓'}${Math.abs(delta)}% vs periode sama bulan lalu)`}`,
    '',
    ...sorted.slice(0, 5).map(([k, v], i) => `${i + 1}. ${esc(k)}: ${rupiah(v)} (${pct(v)}%)`),
    ...(analysis ? ['', `💡 ${esc(analysis)}`] : []),
  ];
  return send(ctx.chatId, lines.join('\n'));
}

async function undoCmd(ctx) {
  const rows = await readTransaksi();
  const row = rows.filter((r) => isActive(r) && r.userId === ctx.user.id).at(-1);
  if (!row) return send(ctx.chatId, 'Tidak ada transaksi aktif untuk dihapus.');
  await updateRange('Transaksi', `M${row.row}`, [['DELETED']]);
  return send(ctx.chatId, `↩️ Dihapus: <b>${esc(row.title)}</b> · ${rupiah(row.nominal)} · ${row.tanggal}`);
}

async function cariCmd(ctx, args) {
  const q = args.toLowerCase();
  if (!q) return send(ctx.chatId, 'Format: <code>/cari kopi</code>');
  const { ids, family } = scopeOf(ctx.user, ctx.users);
  const hits = (await readTransaksi())
    .filter((r) => isActive(r) && ids.includes(r.userId) && (r.title.toLowerCase().includes(q) || r.deskripsi.toLowerCase().includes(q)))
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.row - a.row)
    .slice(0, 10);
  if (!hits.length) return send(ctx.chatId, `Tidak ada hasil untuk "${esc(args)}".`);
  return send(ctx.chatId, [`🔎 <b>${hits.length} hasil terbaru</b> untuk "${esc(args)}"`, ...hits.map((r) => `📅 ${r.tanggal} · <b>${esc(r.title)}</b> · ${rupiah(r.nominal)} · ${esc(r.kategori)}${family ? ` · ${esc(r.nama)}` : ''}`)].join('\n'));
}

async function sheetCmd(ctx) {
  const { ids } = scopeOf(ctx.user, ctx.users);
  const today = (await readTransaksi()).filter((r) => isActive(r) && ids.includes(r.userId) && r.tanggal === ctx.today.iso);
  const total = today.reduce((s, r) => s + r.nominal, 0);
  return send(ctx.chatId, `📄 Pengeluaran hari ini: <b>${rupiah(total)}</b> (${today.length} transaksi)`, {
    reply_markup: { inline_keyboard: [[{ text: '📄 Buka Google Sheets', url: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}` }]] },
  });
}

async function inviteCmd(ctx, args) {
  if (ctx.user.role !== 'Admin') return send(ctx.chatId, 'Hanya Admin yang bisa menambah anggota.');
  const m = /^(\d{5,15})\s+(.+)$/.exec(args);
  if (!m) return send(ctx.chatId, 'Format: <code>/invite 123456789 Nama</code>\n(ID Telegram didapat dari @userinfobot oleh anggota tersebut.)');
  if (ctx.users.some((u) => u.id === m[1])) return send(ctx.chatId, 'ID itu sudah terdaftar.');
  const nama = m[2].trim().slice(0, 40);
  const row = await appendRows('Config_Users', [[Number(m[1]), nama, 'Member', 'Keluarga', 0, 0, '']]);
  ctx.users.push({ row, id: m[1], nama, role: 'Member', mode: 'Keluarga', target: 0, lastMilestone: 0, alertMonth: '' });
  if (ctx.user.mode !== 'Keluarga') {
    await updateRange('Config_Users', `D${ctx.user.row}`, [['Keluarga']]);
    ctx.user.mode = 'Keluarga';
  }
  return send(ctx.chatId, `✅ <b>${esc(nama)}</b> ditambahkan ke keluarga.\nMinta dia membuka bot ini dan menekan /start. Budget keluarga memakai target milik Admin.`);
}

async function keluargaCmd(ctx) {
  const { ids, family } = scopeOf(ctx.user, ctx.users);
  if (!family) return send(ctx.chatId, 'Belum ada anggota keluarga. Admin bisa menambah lewat <code>/invite id nama</code>.');
  const { groups, total } = sumBy(await readTransaksi(), 'userId', { ids, ym: ctx.today.ym });
  const lines = ctx.users
    .filter((u) => ids.includes(u.id))
    .map((u) => ({ u, v: groups[u.id] ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .map(({ u, v }) => `• <b>${esc(u.nama)}</b>${u.role === 'Admin' ? ' (Admin)' : ''}: ${rupiah(v)}${total ? ` (${Math.round((v / total) * 100)}%)` : ''}`);
  return send(ctx.chatId, [`👨‍👩‍👧 <b>Keluarga · ${namaBulan(ctx.today.ym)}</b>`, ...lines, `Total: <b>${rupiah(total)}</b>`].join('\n'));
}

async function eksporCmd(ctx) {
  const { ids } = scopeOf(ctx.user, ctx.users);
  const rows = (await readTransaksi())
    .filter((r) => isActive(r) && ids.includes(r.userId) && r.tanggal.startsWith(ctx.today.ym))
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.row - b.row);
  if (!rows.length) return send(ctx.chatId, 'Belum ada transaksi bulan ini untuk diekspor.');
  const head = ['Tanggal', 'Kategori', 'Title', 'Deskripsi', 'Nominal', 'Metode_Bayar', 'Hitung_Budget', 'Nama_User'];
  const body = rows.map((r) => [r.tanggal, r.kategori, r.title, r.deskripsi.replace(/\n/g, ' | '), r.nominal, r.metode, r.hitung ? 'TRUE' : 'FALSE', r.nama].map(csvCell).join(','));
  const csv = `\ufeff${[head.join(','), ...body].join('\r\n')}`;
  return sendFile('sendDocument', 'document', ctx.chatId, Buffer.from(csv, 'utf8'), `expends-${ctx.today.ym}.csv`, 'text/csv', `📤 ${rows.length} transaksi · ${namaBulan(ctx.today.ym)}`);
}

const COMMANDS = {
  start, help: start, setbudget: setbudgetCmd, budget: budgetCmd, laporan: laporanCmd, undo: undoCmd,
  cari: cariCmd, sheet: sheetCmd, invite: inviteCmd, keluarga: keluargaCmd, ekspor: eksporCmd,
};

export async function handleCommand(ctx, msg) {
  const parsed = parseCommand(msg.text);
  const fn = parsed && COMMANDS[parsed.cmd];
  if (!fn) return send(ctx.chatId, HELP);
  return fn(ctx, parsed.args);
}

// ---------- tombol inline ----------
const canTouch = (ctx, row) => row.userId === ctx.user.id || ctx.user.role === 'Admin';

export async function handleCallback(ctx, cbq) {
  const [kind, a, b] = String(cbq.data ?? '').split(':');
  const chat = ctx.chatId;
  const msgId = cbq.message.message_id;

  if (kind === 'cf') return handleConfirm(ctx, cbq, a, b);
  if (kind === 'rc') return handleReceiptCallback(ctx, cbq, a, b);

  if (kind === 'bd') {
    await quiet(editMarkup(chat, msgId));
    const n = Number(a);
    return n > 0 ? setBudget(ctx, n) : undefined;
  }

  if (kind === 'del' || kind === 'nb') {
    const rows = await readTransaksi();
    const row = rows.find((r) => r.id === a);
    if (!row || !isActive(row)) {
      await quiet(editMarkup(chat, msgId));
      return send(chat, 'Transaksi itu sudah dihapus atau tidak ditemukan.');
    }
    if (!canTouch(ctx, row)) return send(chat, 'Kamu hanya bisa mengubah transaksimu sendiri.');
    if (kind === 'del') {
      await updateRange('Transaksi', `M${row.row}`, [['DELETED']]);
      return quiet(editText(chat, msgId, `🗑️ Dihapus: <b>${esc(row.title)}</b> · ${rupiah(row.nominal)}`, { reply_markup: { inline_keyboard: [] } }));
    }
    if (!row.hitung) return quiet(editMarkup(chat, msgId, buttonsFor(row.id, false)));
    await updateRange('Transaksi', `L${row.row}`, [[false]]);
    row.hitung = false;
    await quiet(editMarkup(chat, msgId, buttonsFor(row.id, false)));
    const lines = await budgetBlock(ctx, rows);
    return send(chat, [`🚫 <b>${esc(row.title)}</b> (${rupiah(row.nominal)}) ditandai di luar budget.`, ...lines].join('\n'));
  }
  return undefined;
}
