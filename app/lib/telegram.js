'use strict';
/* Отправка уведомлений в Telegram.
   Токен берётся ТОЛЬКО из окружения и никогда не попадает в браузер. */

const API = process.env.TG_API_BASE || 'https://api.telegram.org';
const TOKEN = () => (process.env.TG_TOKEN || '').trim();
const CHAT = () => (process.env.TG_CHAT || '').trim();

const enabled = () => Boolean(TOKEN() && CHAT());

/* Экранируем то, что пишет гость: иначе символы < > & сломают разметку */
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function send(text, { retries = 2 } = {}) {
  if (!enabled()) return { ok: false, error: 'telegram_not_configured' };

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`${API}/bot${TOKEN()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT(),
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) return { ok: true };

      // 4xx — сообщение не примут и со второй попытки, повторять бессмысленно
      const fatal = res.status >= 400 && res.status < 500 && res.status !== 429;
      const err = data.description || ('HTTP ' + res.status);
      if (fatal || attempt === retries) return { ok: false, error: err };
    } catch (e) {
      if (attempt === retries) return { ok: false, error: e.name === 'AbortError' ? 'timeout' : e.message };
    }
    await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
  }
  return { ok: false, error: 'unknown' };
}

/* ------------------------------------------------------------ сообщения */
const MODE = { pickup: '🥡 Самовивіз', table: '🍴 Подати до столу',
               delivery: '🚗 Доставка додому' };

function orderText(o, items) {
  const lines = items.map(i => `• ${esc(i.name)} × ${i.qty} — ${i.price * i.qty} грн`).join('\n');
  return [
    `🍽 <b>Нове замовлення №${o.id}</b>`,
    '',
    `👤 <b>${esc(o.name)}</b>`,
    `📞 <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>`,
    MODE[o.mode] || MODE.pickup,
    o.mode === 'delivery' && o.address ? `📍 <b>${esc(o.address)}</b>` : null,
    o.wanted ? `🕒 На ${esc(o.wanted)}` : null,
    '',
    '📋 <b>Замовлення:</b>',
    lines,
    '',
    `💰 <b>Разом: ${o.total} грн</b>`,
    o.comment ? `\n💬 <i>${esc(o.comment)}</i>` : null,
    '',
    `🕘 ${esc(o.created || new Date().toLocaleString('uk-UA'))}`
  ].filter(v => v !== null).join('\n');
}

function applicationText(a) {
  return [
    '🙋 <b>Нова заявка в команду</b>',
    '',
    `👤 <b>${esc(a.name)}</b>`,
    `📞 <a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>`,
    a.position ? `💼 Вакансія: ${esc(a.position)}` : null,
    a.experience ? `⭐️ Досвід: ${esc(a.experience)}` : null,
    a.start ? `📅 Готовий почати: ${esc(a.start)}` : null,
    a.about ? `\n💬 <i>${esc(a.about)}</i>` : null,
    '',
    `🕘 ${esc(a.created || new Date().toLocaleString('uk-UA'))}`
  ].filter(v => v !== null).join('\n');
}

const testText = () =>
  '✅ <b>Східний Куточок</b>\n\nЗвʼязок із сайтом налаштовано.\n' +
  'Сюди приходитимуть замовлення та заявки в команду.';

module.exports = { send, enabled, orderText, applicationText, testText };
