'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [].slice.call(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let DATA = null;

function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.add('on');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600);
}

async function api(url, method = 'GET', body) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('Помилка ' + r.status));
  return data;
}

/* --------------------------------------------------------------- вход */
async function login() {
  $('#loginErr').textContent = '';
  try {
    await api('/api/login', 'POST', { password: $('#pw').value });
    $('#pw').value = '';
    await start();
  } catch (e) { $('#loginErr').textContent = e.message; }
}
$('#doLogin').addEventListener('click', login);
$('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#doLogout').addEventListener('click', async () => {
  await api('/api/logout', 'POST');
  $('#app').classList.add('hide'); $('#login').classList.remove('hide');
});

/* --------------------------------------------------------------- вкладки */
$$('.tabs button').forEach(b => b.addEventListener('click', () => {
  $$('.tabs button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  ['dishes', 'cats', 'inbox', 'gallery', 'settings', 'pass']
    .forEach(t => $('#t-' + t).classList.toggle('hide', t !== b.dataset.t));
}));

async function reload() { DATA = await api('/api/admin/all'); renderAll(); }
function renderAll() {
  renderDishes(); renderCats(); renderInbox(); renderGallery(); renderSettings(); renderPass();
}

/* --------------------------------------------------------------- страви */
let openDish = null;
function renderDishes() {
  const cats = DATA.categories;
  const byCat = {};
  DATA.dishes.forEach(d => { (byCat[d.category_id] = byCat[d.category_id] || []).push(d); });

  $('#t-dishes').innerHTML = `
    <div class="head"><h2>Страви</h2>
      <span class="pill">${DATA.dishes.length} позицій</span>
      <span style="margin-left:auto"></span>
      <button class="pri" id="addDish">+ Додати страву</button></div>` +
    cats.map(c => `
      <div class="card">
        <div class="head"><h3>${esc(c.name_ua)}</h3>
          <span class="pill">${(byCat[c.id] || []).length}</span></div>
        ${(byCat[c.id] || []).map(d => dishRow(d)).join('') ||
          '<p class="muted">Поки порожньо</p>'}
      </div>`).join('');

  $('#addDish').addEventListener('click', () => editDish({
    id: null, category_id: cats[0] ? cats[0].id : 1, name_ua: '', name_en: '',
    ing_ua: '', ing_en: '', weight_ua: '', weight_en: '', price: 0, image: '',
    sort: 999, visible: 1
  }));
  $$('[data-edit]').forEach(b => b.addEventListener('click', () =>
    editDish(DATA.dishes.find(d => d.id === Number(b.dataset.edit)))));
  $$('[data-del]').forEach(b => b.addEventListener('click', async () => {
    const d = DATA.dishes.find(x => x.id === Number(b.dataset.del));
    if (!confirm('Видалити «' + d.name_ua + '»?')) return;
    await api('/api/admin/dishes/' + d.id, 'DELETE');
    toast('Видалено'); await reload();
  }));
  $$('[data-vis]').forEach(b => b.addEventListener('click', async () => {
    const d = DATA.dishes.find(x => x.id === Number(b.dataset.vis));
    await api('/api/admin/dishes/' + d.id, 'PUT', { ...d, visible: d.visible ? 0 : 1 });
    await reload();
  }));
  if (openDish !== null) {
    const d = DATA.dishes.find(x => x.id === openDish);
    if (d) editDish(d);
    else openDish = null;
  }
}

function dishRow(d) {
  return `<div class="dishrow">
    <img class="thumb" src="${d.image ? '/img/' + esc(d.image) : '/img/marble2.webp'}" alt="">
    <div><span class="dname">${esc(d.name_ua)}</span>
      <span class="dmeta">${esc(d.weight_ua)}${d.weight_ua ? ' · ' : ''}<b class="dprice">${d.price}</b> грн
      ${d.visible ? '' : '<span class="pill off">приховано</span>'}</span></div>
    <div class="acts">
      <button class="mini" data-vis="${d.id}">${d.visible ? 'Сховати' : 'Показати'}</button>
      <button class="mini pri" data-edit="${d.id}">Змінити</button>
      <button class="mini danger" data-del="${d.id}">✕</button>
    </div></div>`;
}

function editDish(d) {
  openDish = d.id;
  const box = document.createElement('div');
  box.className = 'modal on';
  box.innerHTML = `<div class="modal__box">
    <div class="head"><h2>${d.id ? 'Змінити страву' : 'Нова страва'}</h2>
      <span style="margin-left:auto"></span><button id="xClose" class="mini">Закрити</button></div>
    <div class="grid g2">
      <div><label>Назва (укр)</label><input id="f_name_ua" value="${esc(d.name_ua)}"></div>
      <div><label>Name (eng)</label><input id="f_name_en" value="${esc(d.name_en)}"></div>
      <div><label>Склад (укр)</label><textarea id="f_ing_ua">${esc(d.ing_ua)}</textarea></div>
      <div><label>Ingredients (eng)</label><textarea id="f_ing_en">${esc(d.ing_en)}</textarea></div>
      <div><label>Вага (укр)</label><input id="f_weight_ua" value="${esc(d.weight_ua)}" placeholder="200 г"></div>
      <div><label>Weight (eng)</label><input id="f_weight_en" value="${esc(d.weight_en)}" placeholder="200 g"></div>
      <div><label>Ціна, грн</label><input id="f_price" type="number" min="0" value="${d.price}"></div>
      <div><label>Категорія</label><select id="f_cat">${DATA.categories.map(c =>
        `<option value="${c.id}"${c.id === d.category_id ? ' selected' : ''}>${esc(c.name_ua)}</option>`).join('')}</select></div>
    </div>
    <div style="margin-top:12px">
      <label>Фото</label>
      <div class="row" style="margin-bottom:8px">
        <img class="thumb" id="f_prev" src="${d.image ? '/img/' + esc(d.image) : ''}" alt="">
        <input type="file" id="f_file" accept="image/*" style="max-width:280px">
        <button id="f_clear">Без фото</button>
      </div>
      <div class="picker" id="f_pick">${DATA.images.map(f =>
        `<img src="/img/${esc(f)}" data-f="${esc(f)}" class="${f === d.image ? 'sel' : ''}" loading="lazy">`).join('')}</div>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="pri" id="fSave">Зберегти</button>
      <label class="row" style="text-transform:none;letter-spacing:0;color:var(--ink);font-size:14px">
        <input type="checkbox" id="f_vis" ${d.visible ? 'checked' : ''} style="width:auto;min-height:0">
        показувати на сайті</label>
    </div></div>`;
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  box.addEventListener('click', ev => { if (ev.target === box) close(); });
  let image = d.image;

  const close = () => { openDish = null; box.remove(); document.body.style.overflow = ''; };
  box.querySelector('#xClose').addEventListener('click', close);
  box.querySelector('#f_clear').addEventListener('click', () => {
    image = ''; box.querySelector('#f_prev').src = '';
    box.querySelectorAll('#f_pick img').forEach(i => i.classList.remove('sel'));
  });
  box.querySelectorAll('#f_pick img').forEach(i => i.addEventListener('click', () => {
    image = i.dataset.f; box.querySelector('#f_prev').src = i.src;
    box.querySelectorAll('#f_pick img').forEach(x => x.classList.remove('sel'));
    i.classList.add('sel');
  }));
  box.querySelector('#f_file').addEventListener('change', async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      const r = await api('/api/admin/upload', 'POST', { upload: await toDataUrl(file) });
      image = r.file; box.querySelector('#f_prev').src = '/img/' + r.file;
      toast('Фото завантажено');
    } catch (e) { toast(e.message, true); }
  });
  box.querySelector('#fSave').addEventListener('click', async () => {
    const body = {
      category_id: Number(box.querySelector('#f_cat').value),
      name_ua: box.querySelector('#f_name_ua').value,
      name_en: box.querySelector('#f_name_en').value,
      ing_ua: box.querySelector('#f_ing_ua').value,
      ing_en: box.querySelector('#f_ing_en').value,
      weight_ua: box.querySelector('#f_weight_ua').value,
      weight_en: box.querySelector('#f_weight_en').value,
      price: Number(box.querySelector('#f_price').value),
      image, sort: d.sort, visible: box.querySelector('#f_vis').checked ? 1 : 0
    };
    try {
      if (d.id) await api('/api/admin/dishes/' + d.id, 'PUT', body);
      else await api('/api/admin/dishes', 'POST', body);
      toast('Збережено'); close(); await reload();
    } catch (e) { toast(e.message, true); }
  });
}

const toDataUrl = file => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
});

/* ------------------------------------------------------------ категорії */
function renderCats() {
  $('#t-cats').innerHTML = `<div class="head"><h2>Категорії</h2>
      <span class="pill">${DATA.categories.length}</span>
      <span style="margin-left:auto"></span><button class="pri" id="addCat">+ Додати</button></div>` +
    DATA.categories.map(c => `<div class="card"><div class="grid g2">
      <div><label>Назва (укр)</label><input data-c="${c.id}" data-f="name_ua" value="${esc(c.name_ua)}"></div>
      <div><label>Name (eng)</label><input data-c="${c.id}" data-f="name_en" value="${esc(c.name_en)}"></div>
      <div><label>Підпис (укр)</label><input data-c="${c.id}" data-f="sub_ua" value="${esc(c.sub_ua)}"></div>
      <div><label>Subtitle (eng)</label><input data-c="${c.id}" data-f="sub_en" value="${esc(c.sub_en)}"></div>
      <div><label>Порядок</label><input data-c="${c.id}" data-f="sort" type="number" value="${c.sort}"></div>
      </div><div class="row" style="margin-top:10px">
      <button class="pri" data-savec="${c.id}">Зберегти</button>
      <button class="danger" data-delc="${c.id}">Видалити разом зі стравами</button></div></div>`).join('');

  $('#addCat').addEventListener('click', async () => {
    const name = prompt('Назва нової категорії:'); if (!name) return;
    await api('/api/admin/categories', 'POST',
      { slug: 'c' + Date.now().toString(36), name_ua: name, sort: DATA.categories.length, visible: 1 });
    toast('Додано'); await reload();
  });
  $$('[data-savec]').forEach(b => b.addEventListener('click', async () => {
    const id = Number(b.dataset.savec);
    const c = DATA.categories.find(x => x.id === id);
    const body = { ...c };
    $$(`[data-c="${id}"]`).forEach(i => { body[i.dataset.f] = i.value; });
    try { await api('/api/admin/categories/' + id, 'PUT', body); toast('Збережено'); await reload(); }
    catch (e) { toast(e.message, true); }
  }));
  $$('[data-delc]').forEach(b => b.addEventListener('click', async () => {
    const c = DATA.categories.find(x => x.id === Number(b.dataset.delc));
    const n = DATA.dishes.filter(d => d.category_id === c.id).length;
    if (!confirm(`Видалити «${c.name_ua}» і ${n} страв у ній?`)) return;
    await api('/api/admin/categories/' + c.id, 'DELETE'); toast('Видалено'); await reload();
  }));
}

/* ------------------------------------------------- заявки, заказы, оценки */
const STATUS = { new: 'нова', done: 'опрацьовано', archived: 'в архіві' };

function tgBadge(row) {
  if (row.tg_sent) return '<span class="pill good">✓ у Telegram</span>';
  return '<span class="pill off" title="' + esc(row.tg_error || '') + '">не доставлено</span>';
}

async function renderInbox() {
  let box;
  try { box = await api('/api/admin/inbox'); }
  catch (e) { $('#t-inbox').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; return; }

  const orders = box.orders.map(o => `<div class="card">
    <div class="head"><h2 style="font-size:15px">Замовлення №${o.id}</h2>
      <span class="pill${o.status === 'new' ? '' : ' off'}">${esc(STATUS[o.status] || o.status)}</span>
      ${tgBadge(o)}<span class="muted">${esc(o.created)}</span></div>
    <p style="margin:0 0 6px"><b>${esc(o.name)}</b> · <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a>
      · ${({table:'до столу',delivery:'ДОСТАВКА',pickup:'самовивіз'})[o.mode] || o.mode}${o.wanted ? ' · на ' + esc(o.wanted) : ' · якнайшвидше'}</p>
    ${o.address ? `<p style="margin:0 0 6px"><b>📍 ${esc(o.address)}</b></p>` : ''}
    ${o.comment ? `<p class="muted" style="margin:0 0 6px">${esc(o.comment)}</p>` : ''}
    <ul style="margin:0 0 8px;padding-left:18px">${o.items.map(i =>
      `<li>${esc(i.name)} × ${i.qty} — ${i.price * i.qty} грн</li>`).join('')}</ul>
    <p style="margin:0 0 10px"><b>Разом: ${o.total} грн</b></p>
    <div class="row"><button data-ost="${o.id}">Позначити опрацьованим</button>
      ${o.tg_sent ? '' : `<button data-ores="${o.id}">Надіслати в Telegram</button>`}
      <button class="danger" data-odel="${o.id}">Видалити</button></div></div>`).join('')
    || '<p class="muted">Замовлень поки немає</p>';

  const apps = box.applications.map(a2 => `<div class="card">
    <div class="head"><h2 style="font-size:15px">${esc(a2.name)}</h2>
      <span class="pill${a2.status === 'new' ? '' : ' off'}">${esc(STATUS[a2.status] || a2.status)}</span>
      ${tgBadge(a2)}<span class="muted">${esc(a2.created)}</span></div>
    <p style="margin:0 0 6px"><a href="tel:${esc(a2.phone)}">${esc(a2.phone)}</a>
      · ${esc(a2.position)} · досвід: ${esc(a2.experience)} · старт: ${esc(a2.start)}</p>
    ${a2.about ? `<p class="muted" style="margin:0 0 10px">${esc(a2.about)}</p>` : ''}
    <div class="row"><button data-ast="${a2.id}">Позначити опрацьованою</button>
      ${a2.tg_sent ? '' : `<button data-ares="${a2.id}">Надіслати в Telegram</button>`}
      <button class="danger" data-adel="${a2.id}">Видалити</button></div></div>`).join('')
    || '<p class="muted">Заявок поки немає</p>';

  const rates = box.ratings.length ? `<div class="card">
    <div class="head"><h2 style="font-size:16px">Оцінки гостей</h2>
      <span class="muted">знизу — те, на що варто подивитися</span></div>
    ${box.ratings.map(r => `<div class="dishrow" style="grid-template-columns:1fr auto">
      <div><b>${esc(r.name_ua)}</b><span class="muted">${r.n} голосів</span></div>
      <div style="font-size:19px;color:${r.avg < 4 ? 'var(--bad)' : 'var(--teal)'}">${r.avg}</div>
    </div>`).join('')}</div>` : '';

  const tgHead = box.telegram && box.telegram.configured
    ? '<p class="muted" style="margin:0 0 14px">Telegram підключено. Нові замовлення й заявки приходять у чат.</p>'
    : '<div class="card" style="border-color:#E7C9C4"><b>Telegram не налаштовано.</b>' +
      '<p class="muted" style="margin:6px 0 0">Додайте TG_TOKEN і TG_CHAT у файл .env (або в налаштування хостингу) і перезапустіть сервер.</p></div>';

  $('#t-inbox').innerHTML = tgHead + `<div class="head"><h2>Замовлення</h2>
      <span class="muted">${box.orders.length}</span></div>${orders}
    <div class="head" style="margin-top:22px"><h2>Заявки в команду</h2>
      <span class="muted">${box.applications.length}</span></div>${apps}
    <div class="head" style="margin-top:22px"><h2>Оцінки страв</h2></div>${rates}`;

  $$('[data-ost]').forEach(b => b.addEventListener('click', async () => {
    await api('/api/admin/orders/' + b.dataset.ost, 'PATCH', { status: 'done' });
    toast('Позначено'); renderInbox();
  }));
  $$('[data-ores]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api('/api/admin/orders/' + b.dataset.ores + '/resend', 'POST'); toast('Надіслано'); }
    catch (e) { toast(e.message, true); }
    renderInbox();
  }));
  $$('[data-ares]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await api('/api/admin/applications/' + b.dataset.ares + '/resend', 'POST'); toast('Надіслано'); }
    catch (e) { toast(e.message, true); }
    renderInbox();
  }));
  $$('[data-odel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Видалити замовлення?')) return;
    await api('/api/admin/orders/' + b.dataset.odel, 'DELETE'); toast('Видалено'); renderInbox();
  }));
  $$('[data-ast]').forEach(b => b.addEventListener('click', async () => {
    await api('/api/admin/applications/' + b.dataset.ast, 'PATCH', { status: 'done' });
    toast('Позначено'); renderInbox();
  }));
  $$('[data-adel]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Видалити заявку?')) return;
    await api('/api/admin/applications/' + b.dataset.adel, 'DELETE'); toast('Видалено'); renderInbox();
  }));
}

/* --------------------------------------------------------------- галерея */
function renderGallery() {
  $('#t-gallery').innerHTML = `<div class="head"><h2>Галерея</h2>
      <span class="pill">${DATA.gallery.length} фото</span>
      <span style="margin-left:auto"></span>
      <label class="pri" style="text-transform:none;letter-spacing:0;padding:10px 14px;
        border-radius:4px;cursor:pointer;margin:0;color:#fff">+ Завантажити фото
        <input type="file" id="galFile" accept="image/*" class="hide"></label></div>
    <div class="gal">${DATA.gallery.map(g => `<div class="card">
      <img src="/img/${esc(g.file)}" alt="" loading="lazy">
      <div style="margin-top:8px"><label>Підпис (укр)</label>
        <input data-g="${g.id}" data-f="alt_ua" value="${esc(g.alt_ua)}"></div>
      <div style="margin-top:6px"><label>Caption (eng)</label>
        <input data-g="${g.id}" data-f="alt_en" value="${esc(g.alt_en)}"></div>
      <div style="margin-top:6px"><label>Порядок</label>
        <input data-g="${g.id}" data-f="sort" type="number" value="${g.sort}"></div>
      <div class="row" style="margin-top:8px">
        <button class="pri" data-saveg="${g.id}">Зберегти</button>
        <button class="danger" data-delg="${g.id}">✕</button></div></div>`).join('')}</div>`;

  $('#galFile').addEventListener('change', async ev => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      await api('/api/admin/gallery', 'POST',
        { upload: await toDataUrl(file), alt_ua: '', alt_en: '', sort: DATA.gallery.length, visible: 1 });
      toast('Фото додано'); await reload();
    } catch (e) { toast(e.message, true); }
  });
  $$('[data-saveg]').forEach(b => b.addEventListener('click', async () => {
    const id = Number(b.dataset.saveg);
    const body = { ...DATA.gallery.find(g => g.id === id) };
    $$(`[data-g="${id}"]`).forEach(i => { body[i.dataset.f] = i.value; });
    try { await api('/api/admin/gallery/' + id, 'PUT', body); toast('Збережено'); await reload(); }
    catch (e) { toast(e.message, true); }
  }));
  $$('[data-delg]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('Видалити фото з галереї?')) return;
    await api('/api/admin/gallery/' + b.dataset.delg, 'DELETE'); toast('Видалено'); await reload();
  }));
}

/* -------------------------------------------------------------- настройки */
const FIELDS = [
  ['phone_text', 'Телефон (як показувати)'], ['phone_tel', 'Телефон для дзвінка (+380…)'],
  ['address_ua', 'Адреса (укр)'], ['address_en', 'Address (eng)'],
  ['hours_ua', 'Графік (укр)'], ['hours_en', 'Hours (eng)'],
  ['hours_note_ua', 'Примітка до графіка (укр)'], ['hours_note_en', 'Hours note (eng)'],
  ['music_ua', 'Жива музика (укр)'], ['music_en', 'Live music (eng)'],
  ['hookah_days_ua', 'Кальян: дні (укр)'], ['hookah_days_en', 'Hookah: days (eng)'],
  ['hookah_from_ua', 'Кальян: з якої години (укр)'], ['hookah_from_en', 'Hookah: from (eng)'],
  ['hookah_price_ua', 'Кальян: ціна (укр)'], ['hookah_price_en', 'Hookah: price (eng)'],
  ['rating', 'Оцінка Google'], ['rating_count', 'Кількість відгуків'],
  ['google_place_id', 'Google Place ID'],
  ['instagram', 'Посилання Instagram'], ['facebook', 'Посилання Facebook'],
  ['show_ratings', 'Показувати оцінки страв на сайті (1 або 0)'],
  ['orders_enabled', 'Онлайн-замовлення увімкнено (1 або 0)'],
  ['order_note_ua', 'Примітка під замовленням (укр)'],
  ['order_note_en', 'Order note (eng)'],
  ['jobs_ua', 'Вакансії через | (укр)'], ['jobs_en', 'Vacancies split by | (eng)'],
  ['tg_applications', 'Слати заявки в команду в Telegram (1 або 0)'],
  ['delivery_enabled', 'Доставка додому увімкнена (1 або 0)'],
  ['delivery_note_ua', 'Примітка про доставку (укр)'],
  ['delivery_note_en', 'Delivery note (eng)'],
  ['order_hour_from', 'Замовлення: з якої години (наприклад 11)'],
  ['order_hour_to', 'Замовлення: до якої години (наприклад 22)']
];
function renderSettings() {
  $('#t-settings').innerHTML = `<div class="head"><h2>Контакти й тексти</h2>
      <span class="pill">${FIELDS.length} полів</span></div>
    <div class="card card--gold"><div class="grid g2">${FIELDS.map(([k, label]) =>
      `<div><label>${esc(label)}</label><input data-set="${k}" value="${esc(DATA.settings[k] || '')}"></div>`).join('')}
    </div><div class="row" style="margin-top:14px">
      <button class="pri" id="saveSet">Зберегти</button>
      <button id="tgTest">Перевірити звʼязок з Telegram</button></div>
    <p class="muted" style="margin:10px 0 0">Токен бота зберігається у файлі .env на сервері
      і ніколи не потрапляє в браузер.</p></div>`;
  $('#tgTest').addEventListener('click', async ev => {
    ev.target.disabled = true;
    try { await api('/api/admin/tg-test', 'POST'); toast('Повідомлення надіслано — перевірте чат'); }
    catch (e) { toast(e.message, true); }
    ev.target.disabled = false;
  });
  $('#saveSet').addEventListener('click', async () => {
    const body = {};
    $$('[data-set]').forEach(i => { body[i.dataset.set] = i.value; });
    try { await api('/api/admin/settings', 'PUT', body); toast('Збережено'); await reload(); }
    catch (e) { toast(e.message, true); }
  });
}

function renderPass() {
  const envNote = DATA.passFromEnv ? `<div class="card" style="border-color:var(--line);
      background:var(--mist);max-width:560px">
      <b>Пароль задано у файлі .env</b>
      <p class="muted" style="margin:6px 0 0">Саме значення ADMIN_PASSWORD є головним.
      Зміна пароля тут діятиме лише до перезапуску сервера — щоб змінити назавжди,
      відредагуйте .env (на хостингу — розділ Environment) і перезапустіть.</p>
      <p class="muted" style="margin:6px 0 0">Забули пароль? Впишіть новий у .env
      і перезапустіть — доступ повернеться.</p></div>` : '';
  $('#t-pass').innerHTML = envNote + `<div class="head"><h2>Пароль входу</h2></div>
    <div class="card card--gold" style="max-width:440px">
      <div><label>Поточний пароль</label><input id="p_cur" type="password"></div>
      <div style="margin-top:10px"><label>Новий пароль (від 8 символів)</label>
        <input id="p_new" type="password"></div>
      <button class="pri" id="savePass" style="margin-top:12px">Змінити</button></div>`;
  $('#savePass').addEventListener('click', async () => {
    try {
      await api('/api/admin/password', 'PUT',
        { current: $('#p_cur').value, next: $('#p_new').value });
      toast('Пароль змінено'); $('#p_cur').value = ''; $('#p_new').value = '';
    } catch (e) { toast(e.message, true); }
  });
}

/* ------------------------------------------------------------------ старт */
async function start() {
  const me = await api('/api/me');
  if (!me.authed) { $('#login').classList.remove('hide'); $('#app').classList.add('hide'); return; }
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  await reload();
}
start();
