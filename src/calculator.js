// Fungsi murni (tanpa I/O): uang, tanggal, hitungan budget, parsing. Semua matematika ada di sini, bukan di AI.

export const MILESTONES = [75, 90, 100];
export const CONFIRM_TTL_MS = 30 * 60 * 1000;

const num = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export function rupiah(n) {
  const v = Math.round(num(n));
  return (v < 0 ? '-' : '') + 'Rp ' + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ---------- tanggal & zona waktu ----------
export function datePartsIn(tz, date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    weekday: p.weekday,
    iso: `${p.year}-${p.month}-${p.day}`,
    ym: `${p.year}-${p.month}`,
  };
}

export function tzOffsetLabel(tz, date = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((x) => x.type === 'timeZoneName');
  return part ? part.value.replace('GMT', 'UTC') : tz;
}

export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function prevMonthKey(ym) {
  let [y, m] = ym.split('-').map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const namaBulan = (ym) => `${BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// ---------- parsing nominal: "5jt", "4,5jt", "4.500.000", "Rp 750rb", "20k" ----------
const MULT = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6 };

export function parseNominal(input) {
  const s = String(input ?? '').toLowerCase().replace(/rp\.?/g, '').replace(/\s+/g, '');
  const m = s.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(rb|ribu|k|jt|juta)?$/);
  if (!m) return null;
  const [, n, suf] = m;
  let value;
  if (suf) {
    if ((n.match(/[.,]/g) ?? []).length > 1) return null; // "4.500.000jt" = ngawur
    value = parseFloat(n.replace(',', '.')) * MULT[suf]; // dengan akhiran, pemisah = desimal
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(n)) {
    value = Number(n.replace(/[.,]/g, '')); // tanpa akhiran, titik/koma = ribuan
  } else {
    value = Number(n.replace(',', '.'));
  }
  value = Math.round(value);
  return value > 0 ? value : null;
}

export function parseCommand(text) {
  const m = /^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(String(text ?? '').trim());
  return m ? { cmd: m[1].toLowerCase(), args: (m[2] ?? '').trim() } : null;
}

// ---------- total transaksi / struk (anti-halusinasi: AI hanya menyalin angka) ----------
export function computeTotals(raw) {
  const lines = (Array.isArray(raw?.items) ? raw.items : [])
    .map((i) => {
      const qty = num(i.qty, 1) > 0 ? num(i.qty, 1) : 1;
      const harga = Math.max(0, num(i.harga_satuan));
      const diskon = Math.max(0, num(i.diskon));
      return { nama: String(i.nama ?? '').trim() || 'Item', qty, harga, line: Math.max(0, Math.round(harga * qty - diskon)) };
    })
    .filter((l) => l.line > 0);

  const hasTotal = raw?.total_akhir !== null && raw?.total_akhir !== undefined && Number.isFinite(Number(raw.total_akhir));
  const total = hasTotal ? Math.round(Number(raw.total_akhir)) : null;
  const pajak = Math.round(num(raw?.pajak));

  if (lines.length === 0) return { lines, subtotal: 0, adjust: 0, nominal: total && total > 0 ? total : 0, warning: '' };

  const subtotal = lines.reduce((s, l) => s + l.line, 0);
  const adjust = total !== null ? total - subtotal : pajak; // total di struk = acuan; selisihnya = pajak/service/diskon
  let warning = '';
  if (total !== null && pajak && Math.abs(adjust - pajak) > Math.max(500, subtotal * 0.02)) {
    warning = 'Total struk tidak cocok dengan jumlah item + pajak. Cek manual.';
  }
  return { lines, subtotal, adjust, nominal: subtotal + adjust, warning };
}

export function allocateSelection({ lines, subtotal, adjust }, idxs) {
  const chosen = [...new Set(idxs)].sort((a, b) => a - b).map((i) => lines[i]).filter(Boolean);
  const sel = chosen.reduce((s, l) => s + l.line, 0);
  const share = subtotal > 0 ? Math.round((sel * adjust) / subtotal) : 0; // pajak/diskon dibagi proporsional
  return { chosen, subtotalSel: sel, share, nominal: sel + share };
}

export const bulletLines = (lines) => lines.map((l) => `• ${l.nama}${l.qty !== 1 ? ` x${l.qty}` : ''}`);

export function matchKategori(name, categories) {
  const n = String(name ?? '').trim().toLowerCase();
  return categories.find((c) => c.toLowerCase() === n) ?? categories.find((c) => c.toLowerCase() === 'lainnya') ?? categories[0] ?? 'Lainnya';
}

export function normalizeTx(raw, { categories, today }) {
  const t = computeTotals(raw);
  if (!(t.nominal > 0) || t.nominal > 1e9) return { error: `Nominal untuk "${String(raw?.title ?? 'transaksi').slice(0, 40)}" tidak terbaca / tidak masuk akal.` };
  const catatan = (Array.isArray(raw.catatan) ? raw.catatan : []).map((c) => String(c).trim()).filter(Boolean).map((c) => `• ${c}`);
  return {
    tx: {
      title: String(raw.title ?? '').trim().slice(0, 60) || t.lines[0]?.nama || 'Pengeluaran',
      kategori: matchKategori(raw.kategori, categories),
      tanggal: isValidISODate(raw.tanggal) ? raw.tanggal : today,
      nominal: t.nominal,
      deskripsi: [...bulletLines(t.lines), ...catatan].join('\n'),
      metode: String(raw.metode_bayar ?? '').trim().slice(0, 30),
      hitung: !raw.is_incidental,
      warning: t.warning,
    },
  };
}

// ---------- pilihan item struk: "1, 3" atau "ayam dan nasi" ----------
export function parseSelection(text, lines) {
  const t = String(text ?? '').trim().toLowerCase().replace(/\bdan\b/g, ',');
  if (!t) return null;
  if (/^[\d\s,&+\-]+$/.test(t)) {
    const idx = [];
    for (const tok of t.split(/[,&+\s]+/).filter(Boolean)) {
      const r = /^(\d+)-(\d+)$/.exec(tok);
      const nums = r ? Array.from({ length: Math.max(0, Number(r[2]) - Number(r[1]) + 1) }, (_, k) => Number(r[1]) + k) : /^\d+$/.test(tok) ? [Number(tok)] : null;
      if (!nums || nums.length === 0) return null;
      for (const n of nums) {
        if (n < 1 || n > lines.length) return { invalid: true };
        idx.push(n - 1);
      }
    }
    return idx.length ? { idx: [...new Set(idx)] } : null;
  }
  if (/\d/.test(t)) return null; // ada angka + huruf = bukan pilihan nama (kemungkinan transaksi baru, mis. "kopi 20rb")
  const idx = [];
  for (const part of t.split(/\s*[,&+]\s*/).map((p) => p.trim()).filter(Boolean)) {
    if (part.length < 3) return null;
    const hits = lines.map((l, i) => (l.nama.toLowerCase().includes(part) ? i : -1)).filter((i) => i >= 0);
    if (hits.length === 0) return null;
    idx.push(...hits);
  }
  return idx.length ? { idx: [...new Set(idx)] } : null;
}

// ---------- budget ----------
export const isActive = (r) => r.status === 'ACTIVE';

export function budgetStats({ rows, scopeIds, ym, target, day, dim }) {
  const ids = new Set(scopeIds.map(String));
  let spent = 0;
  for (const r of rows) {
    if (isActive(r) && r.hitung === true && r.tanggal.startsWith(ym) && ids.has(String(r.userId))) spent += r.nominal;
  }
  const pct = target > 0 ? (spent / target) * 100 : 0;
  const dayPct = (day / dim) * 100;
  const remaining = target - spent;
  const daysLeft = dim - day + 1; // termasuk hari ini
  return { spent, pct, dayPct, remaining, daysLeft, safeDaily: remaining > 0 ? Math.floor(remaining / daysLeft) : 0 };
}

export const milestoneToAlert = (pct, last) => [...MILESTONES].reverse().find((m) => pct >= m && m > last) ?? null;
export const burnTooFast = (pct, dayPct, day) => pct < 100 && (pct - dayPct > 15 || (day <= 7 && pct > 40));

export function sumBy(rows, field, { ids, ym, maxDay = 31 }) {
  const set = new Set(ids.map(String));
  const groups = {};
  let total = 0;
  for (const r of rows) {
    if (!isActive(r) || !set.has(String(r.userId)) || !r.tanggal.startsWith(ym)) continue;
    if (Number(r.tanggal.slice(8, 10)) > maxDay) continue;
    groups[r[field]] = (groups[r[field]] ?? 0) + r.nominal;
    total += r.nominal;
  }
  return { groups, total };
}

export function crossedLimit({ rows, ids, ym, kategori, limit, newSum }) {
  if (!(limit > 0)) return false;
  const after = sumBy(rows, 'kategori', { ids, ym }).groups[kategori] ?? 0;
  return after - newSum < limit && after >= limit;
}

export function isDuplicate(rows, userId, tx, nowMs, windowMs = 10 * 60 * 1000) {
  return rows.some(
    (r) =>
      isActive(r) &&
      String(r.userId) === String(userId) &&
      r.tanggal === tx.tanggal &&
      r.title.toLowerCase() === tx.title.toLowerCase() &&
      r.nominal === tx.nominal &&
      nowMs - Date.parse(r.ts) < windowMs,
  );
}

export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // cegah rumus nyasar saat dibuka di Excel/Sheets
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const stale = (updatedAt, ttl = CONFIRM_TTL_MS) => !(Date.now() - Date.parse(updatedAt) <= ttl);
