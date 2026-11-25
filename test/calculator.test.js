import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateSelection, budgetStats, burnTooFast, computeTotals, crossedLimit, csvCell, isDuplicate, milestoneToAlert,
  normalizeTx, parseCommand, parseNominal, parseSelection, rupiah, sumBy,
} from '../src/calculator.js';

test('parseNominal: singkatan & format ribuan', () => {
  const cases = { '5jt': 5e6, '4,5jt': 4.5e6, '4.500.000': 4.5e6, 'Rp 3.000.000': 3e6, '750rb': 750000, '20k': 20000, '1.2jt': 1.2e6, '2,5rb': 2500, '25.000': 25000, 3000000: 3e6 };
  for (const [input, want] of Object.entries(cases)) assert.equal(parseNominal(input), want, input);
  for (const bad of ['', 'abc', '0', '4.500.000jt', 'kopi 20rb']) assert.equal(parseNominal(bad), null, bad);
});

test('rupiah & parseCommand', () => {
  assert.equal(rupiah(1250000), 'Rp 1.250.000');
  assert.equal(rupiah(-500), '-Rp 500');
  assert.deepEqual(parseCommand('/setbudget@Expendsbot 5jt'), { cmd: 'setbudget', args: '5jt' });
  assert.equal(parseCommand('halo'), null);
});

test('computeTotals: total struk jadi acuan, selisih = pajak/diskon', () => {
  const t = computeTotals({ items: [{ nama: 'A', harga_satuan: 25000, qty: 1 }, { nama: 'B', harga_satuan: 8000, qty: 2, diskon: 1000 }], pajak: 4000, total_akhir: 44000 });
  assert.equal(t.subtotal, 40000);
  assert.equal(t.adjust, 4000);
  assert.equal(t.nominal, 44000);
  assert.equal(t.warning, '');
  assert.match(computeTotals({ items: [{ nama: 'A', harga_satuan: 10000, qty: 1 }], pajak: 1000, total_akhir: 20000 }).warning, /tidak cocok/);
  assert.equal(computeTotals({ items: [], total_akhir: 5000 }).nominal, 5000);
  assert.equal(computeTotals({ items: [{ nama: 'A', harga_satuan: 10000, qty: 2 }], pajak: 2200 }).nominal, 22200);
});

test('allocateSelection: pajak dibagi proporsional', () => {
  const t = computeTotals({ items: [{ nama: 'Ayam', harga_satuan: 25000, qty: 1 }, { nama: 'Es teh', harga_satuan: 8000, qty: 1 }, { nama: 'Nasi', harga_satuan: 7000, qty: 1 }], total_akhir: 44000 });
  assert.equal(allocateSelection(t, [0, 2]).nominal, 35200); // 32.000 x 1,1
  assert.equal(allocateSelection(t, [0, 1, 2]).nominal, 44000);
});

test('parseSelection: angka, rentang, nama, dan bukan-pilihan', () => {
  const lines = [{ nama: 'Ayam geprek' }, { nama: 'Es teh' }, { nama: 'Nasi putih' }];
  assert.deepEqual(parseSelection('1, 3', lines), { idx: [0, 2] });
  assert.deepEqual(parseSelection('1-2', lines), { idx: [0, 1] });
  assert.deepEqual(parseSelection('ayam dan nasi', lines), { idx: [0, 2] });
  assert.deepEqual(parseSelection('9', lines), { invalid: true });
  assert.equal(parseSelection('kopi 20rb', lines), null);
  assert.equal(parseSelection('sate', lines), null);
});

test('normalizeTx: validasi nominal, kategori, tanggal', () => {
  const cats = ['Makanan', 'Lainnya'];
  const ok = normalizeTx({ title: 'Parkir', items: [], total_akhir: 5000, kategori: 'transport?', tanggal: '2026-02-30', is_incidental: true }, { categories: cats, today: '2026-11-24' });
  assert.equal(ok.tx.kategori, 'Lainnya');
  assert.equal(ok.tx.tanggal, '2026-11-24'); // tanggal ngawur -> hari ini
  assert.equal(ok.tx.hitung, false);
  assert.equal(ok.tx.deskripsi, '');
  assert.ok(normalizeTx({ title: 'X', items: [] }, { categories: cats, today: '2026-11-24' }).error);
});

test('budget: hanya ACTIVE & Hitung_Budget, sesuai scope & bulan', () => {
  const r = (o) => ({ status: 'ACTIVE', hitung: true, userId: '1', tanggal: '2026-11-05', nominal: 1000, kategori: 'A', ...o });
  const rows = [r({}), r({ status: 'DELETED' }), r({ hitung: false }), r({ userId: '2' }), r({ tanggal: '2026-10-30' }), r({ userId: '2', nominal: 500 })];
  const st = budgetStats({ rows, scopeIds: ['1', '2'], ym: '2026-11', target: 10000, day: 10, dim: 30 });
  assert.equal(st.spent, 2500);
  assert.equal(Math.round(st.pct), 25);
  assert.equal(st.daysLeft, 21);
  assert.equal(st.safeDaily, Math.floor(7500 / 21));
  assert.equal(sumBy(rows, 'kategori', { ids: ['1'], ym: '2026-11' }).total, 2000);
});

test('milestone, burn rate, limit kategori, duplikat, csv', () => {
  assert.equal(milestoneToAlert(80, 0), 75);
  assert.equal(milestoneToAlert(95, 75), 90);
  assert.equal(milestoneToAlert(120, 0), 100);
  assert.equal(milestoneToAlert(80, 75), null);
  assert.equal(burnTooFast(60, 40, 12), true);
  assert.equal(burnTooFast(45, 20, 5), true); // >40% di minggu pertama
  assert.equal(burnTooFast(30, 30, 12), false);
  assert.equal(burnTooFast(100, 10, 3), false); // sudah ditangani alert 100%
  const rows = [{ status: 'ACTIVE', userId: '1', tanggal: '2026-11-05', nominal: 90000, kategori: 'Hiburan' }];
  assert.equal(crossedLimit({ rows, ids: ['1'], ym: '2026-11', kategori: 'Hiburan', limit: 100000, newSum: 90000 }), false);
  rows.push({ status: 'ACTIVE', userId: '1', tanggal: '2026-11-06', nominal: 20000, kategori: 'Hiburan' });
  assert.equal(crossedLimit({ rows, ids: ['1'], ym: '2026-11', kategori: 'Hiburan', limit: 100000, newSum: 20000 }), true);
  const tx = { tanggal: '2026-11-24', title: 'Kopi', nominal: 20000 };
  const now = Date.now();
  const row = { status: 'ACTIVE', userId: '1', tanggal: '2026-11-24', title: 'kopi', nominal: 20000, ts: new Date(now - 60000).toISOString() };
  assert.equal(isDuplicate([row], '1', tx, now), true);
  assert.equal(isDuplicate([{ ...row, ts: new Date(now - 3600000).toISOString() }], '1', tx, now), false);
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('a,b'), '"a,b"');
});
