// Google Sheets lewat REST + service account (JWT ditandatangani node:crypto, tanpa library tambahan).
import { createSign } from 'node:crypto';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = { value: null, exp: 0 };

export function privateKey() {
  // Vercel menyimpan "\n" sebagai teks biasa; ubah kembali jadi baris baru, buang tanda kutip pembungkus.
  return String(process.env.GOOGLE_PRIVATE_KEY ?? '').trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (token.value && token.exp - 60 > now) return token.value;
  const b64u = (x) => Buffer.from(x).toString('base64url');
  const header = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64u(
    JSON.stringify({
      iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const sig = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(privateKey()).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Login Google gagal (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  token = { value: j.access_token, exp: now + Number(j.expires_in ?? 3600) };
  return token.value;
}

async function api(method, path, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE}/${process.env.GOOGLE_SHEET_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await sleep(1500);
      continue;
    }
    if (res.status === 429) throw new Error('Kuota Google Sheets habis sementara (429). Coba lagi 1 menit lagi.');
    if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 250)}`);
    return res.json();
  }
}

const R = (tab, a1) => encodeURIComponent(`'${tab}'!${a1}`);
const asBool = (v) => v === true || String(v).toUpperCase() === 'TRUE';
const parseJSON = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// ---------- baca konfigurasi + state + kategori dalam SATU panggilan (hemat kuota) ----------
export async function loadCore() {
  const ranges = ['Config_Users!A2:G', '_State!A2:E', 'Kategori!A2:B'].map((r) => {
    const [tab, a1] = r.split('!');
    return `ranges=${R(tab, a1)}`;
  });
  const j = await api('GET', `/values:batchGet?valueRenderOption=UNFORMATTED_VALUE&${ranges.join('&')}`);
  const [u, s, k] = j.valueRanges.map((v) => v.values ?? []);
  return {
    users: u
      .map((r, i) => ({
        row: i + 2, id: String(r[0] ?? '').trim(), nama: String(r[1] ?? ''), role: String(r[2] ?? 'Member'),
        mode: String(r[3] ?? 'Pribadi'), target: Number(r[4]) || 0, lastMilestone: Number(r[5]) || 0, alertMonth: String(r[6] ?? ''),
      }))
      .filter((x) => x.id),
    state: s
      .map((r, i) => ({
        row: i + 2, id: String(r[0] ?? '').trim(), state: String(r[1] || 'IDLE'), payload: parseJSON(r[2]),
        updatedAt: String(r[3] ?? ''), lastUpdateId: Number(r[4]) || 0,
      }))
      .filter((x) => x.id),
    kategori: k.map((r) => ({ nama: String(r[0] ?? '').trim(), limit: Number(r[1]) || 0 })).filter((x) => x.nama),
  };
}

export async function readTransaksi() {
  const j = await api('GET', `/values/${R('Transaksi', 'A2:M')}?valueRenderOption=UNFORMATTED_VALUE`);
  return (j.values ?? [])
    .map((r, i) => ({
      row: i + 2, id: String(r[0] ?? ''), updateId: r[1], ts: String(r[2] ?? ''), tanggal: String(r[3] ?? ''),
      userId: String(r[4] ?? ''), nama: String(r[5] ?? ''), kategori: String(r[6] ?? ''), title: String(r[7] ?? ''),
      deskripsi: String(r[8] ?? ''), nominal: Number(r[9]) || 0, metode: String(r[10] ?? ''), hitung: asBool(r[11]),
      status: String(r[12] ?? ''),
    }))
    .filter((r) => r.id);
}

export async function appendRows(tab, rows) {
  const j = await api('POST', `/values/${R(tab, 'A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { values: rows });
  const m = /!([A-Z]+)(\d+)/.exec(j.updates?.updatedRange ?? '');
  return m ? Number(m[2]) : null;
}

export const updateRange = (tab, a1, values) =>
  api('PUT', `/values/${R(tab, a1)}?valueInputOption=RAW`, { range: `'${tab}'!${a1}`, majorDimension: 'ROWS', values });

// ---------- _State: tulis Last_Update_ID PALING AWAL (sebelum Gemini) ----------
export async function touchLastUpdate(userId, rec, updateId) {
  if (rec) {
    await updateRange('_State', `E${rec.row}`, [[updateId]]);
    rec.lastUpdateId = updateId;
    return rec;
  }
  const row = await appendRows('_State', [[Number(userId), 'IDLE', '', new Date().toISOString(), updateId]]);
  return { row, id: String(userId), state: 'IDLE', payload: null, updatedAt: '', lastUpdateId: updateId };
}

export async function setState(rec, state, payload = null) {
  const updatedAt = new Date().toISOString();
  await updateRange('_State', `B${rec.row}:D${rec.row}`, [[state, payload ? JSON.stringify(payload) : '', updatedAt]]);
  rec.state = state;
  rec.payload = payload;
  rec.updatedAt = updatedAt;
}
