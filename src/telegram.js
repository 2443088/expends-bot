// Pembungkus tipis Telegram Bot API (fetch bawaan Node).
const url = (p) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${p}`;

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function tg(method, body) {
  const res = await fetch(url(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) {
    if (/message is not modified/i.test(j.description ?? '')) return null;
    throw new Error(`Telegram ${method}: ${j.description ?? res.status}`);
  }
  return j.result;
}

export const send = (chat_id, text, extra = {}) =>
  tg('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

export const editText = (chat_id, message_id, text, extra = {}) =>
  tg('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

export const editMarkup = (chat_id, message_id, reply_markup = { inline_keyboard: [] }) =>
  tg('editMessageReplyMarkup', { chat_id, message_id, reply_markup });

export const answerCb = (id, text) => tg('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });

export async function downloadFile(file_id, maxBytes) {
  const info = await tg('getFile', { file_id });
  if (info.file_size && info.file_size > maxBytes) throw new Error('File terlalu besar.');
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${info.file_path}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Unduh file gagal (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export async function sendFile(method, field, chat_id, buffer, filename, mime, caption) {
  const form = new FormData();
  form.set('chat_id', String(chat_id));
  if (caption) {
    form.set('caption', caption);
    form.set('parse_mode', 'HTML');
  }
  form.set(field, new Blob([buffer], { type: mime }), filename);
  const res = await fetch(url(method), { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
  const j = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description ?? res.status}`);
  return j.result;
}
