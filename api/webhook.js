// Pintu masuk Telegram. Urutan: cek secret -> baca config -> tolak orang asing -> tulis Last_Update_ID (anti dobel) -> proses.
import { timingSafeEqual } from 'node:crypto';
import { appendRows, loadCore, setState, touchLastUpdate } from '../src/sheets.js';
import { answerCb, esc, send } from '../src/telegram.js';
import { datePartsIn } from '../src/calculator.js';
import { handleCallback, handleCommand, onboard, tryBudgetAnswer } from '../src/commands.js';
import { editTransaction, handleText, handleVoice } from '../src/transaksi.js';
import { handlePhoto, handleSelectionText } from '../src/receipt.js';

const quiet = (p) => Promise.resolve(p).catch(() => {});

function secretOk(req) {
  const want = process.env.TELEGRAM_WEBHOOK_SECRET;
  const got = req.headers['x-telegram-bot-api-secret-token'];
  if (!want || typeof got !== 'string') return false; // tanpa secret terpasang = tolak semua (fail closed)
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handleContent(ctx, msg) {
  if (msg.voice) return handleVoice(ctx, msg);
  if (msg.photo?.length) return handlePhoto(ctx, msg);
  if (typeof msg.text !== 'string') return send(ctx.chatId, 'Kirim teks, voice note, atau foto struk ya. Ketik /start untuk bantuan.');

  // Reply-to-Edit: ID dari tombol "del:<id>" di pesan yang di-reply; tanpa ID -> transaksi ACTIVE terakhir user.
  const replied = msg.reply_to_message;
  if (replied?.from?.is_bot) {
    const btn = replied.reply_markup?.inline_keyboard?.flat().find((b) => b.callback_data?.startsWith('del:'));
    if (btn || /^(✅ Tercatat|✏️ Diperbarui)/.test(replied.text ?? '')) {
      return editTransaction(ctx, msg, btn ? btn.callback_data.slice(4) : null);
    }
  }
  if (await tryBudgetAnswer(ctx, msg.text)) return undefined;
  if (await handleSelectionText(ctx, msg.text)) return undefined;
  return handleText(ctx, msg.text);
}

export async function handleUpdate(update) {
  const msg = update.message;
  const cbq = update.callback_query;
  const from = msg?.from ?? cbq?.from;
  const chat = msg?.chat ?? cbq?.message?.chat;
  if (!from || from.is_bot || chat?.type !== 'private' || update.update_id == null) return;

  const core = await loadCore(); // 1 panggilan: Config_Users + _State + Kategori
  const uid = String(from.id);
  let user = core.users.find((u) => u.id === uid);
  const canBootstrap = !user && !core.users.some((u) => u.role === 'Admin') && uid === String(process.env.ADMIN_TELEGRAM_ID ?? '').trim();

  if (!user && !canBootstrap) {
    if (cbq) await quiet(answerCb(cbq.id));
    await send(chat.id, `Maaf, kamu belum terdaftar di bot ini. 🙏\nTelegram ID kamu: <code>${esc(uid)}</code>\nKirim ID itu ke Admin supaya ditambahkan lewat <code>/invite ${esc(uid)} NamaKamu</code>.`);
    return;
  }

  // PALING AWAL (sebelum Gemini/Sheets lain): tandai update ini sudah diproses.
  let state = core.state.find((s) => s.id === uid);
  if (state && state.lastUpdateId >= update.update_id) return; // retry Telegram / duplikat
  state = await touchLastUpdate(uid, state, update.update_id);

  const ctx = {
    from, chatId: chat.id, updateId: update.update_id, user, users: core.users, state, kategori: core.kategori,
    tz: process.env.BOT_TZ || 'Asia/Makassar', today: datePartsIn(process.env.BOT_TZ || 'Asia/Makassar'),
  };

  try {
    if (cbq) await quiet(answerCb(cbq.id));
    if (canBootstrap) {
      const nama = [from.first_name, from.last_name].filter(Boolean).join(' ') || 'Admin';
      const row = await appendRows('Config_Users', [[Number(uid), nama, 'Admin', 'Pribadi', 0, 0, '']]);
      user = { row, id: uid, nama, role: 'Admin', mode: 'Pribadi', target: 0, lastMilestone: 0, alertMonth: '' };
      core.users.push(user);
      ctx.user = user;
      await onboard(ctx);
      if (msg?.text && /^\/start\b/.test(msg.text)) return;
    }
    if (cbq) return await handleCallback(ctx, cbq);
    if (typeof msg?.text === 'string' && msg.text.startsWith('/')) {
      if (/^\/start\b/.test(msg.text) && canBootstrap) return;
      return await handleCommand(ctx, msg);
    }
    return await handleContent(ctx, msg);
  } catch (err) {
    console.error('handleUpdate gagal', err);
    if (ctx.state.state !== 'IDLE' && ctx.state.state !== 'AWAITING_BUDGET') await quiet(setState(ctx.state, 'IDLE'));
    await quiet(send(ctx.chatId, `⚠️ Gagal memproses: ${esc(String(err.message ?? err).slice(0, 200))}\nKirim ulang pesanmu sebentar lagi.`));
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Gunakan POST');
  if (!secretOk(req)) return res.status(401).send('Secret salah');
  try {
    await handleUpdate(req.body ?? {});
  } catch (err) {
    console.error('webhook error', err); // tetap balas 200 supaya Telegram tidak mengulang kiriman
  }
  return res.status(200).send('ok');
}
