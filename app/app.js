'use strict';
/* Витрина «Східний Куточок» — данные из /api/content */

const $ = s => document.querySelector(s);
const $$ = s => [].slice.call(document.querySelectorAll(s));
const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const S = { lang: 'uk', data: null, cat: null, term: '', cart: [], mine: {} };
const L = (o, f) => o[f + (S.lang === 'en' ? '_en' : '_ua')] || o[f + '_ua'] || '';
const T = (ua, en) => (S.lang === 'en' ? en : ua);
const cur = () => (S.lang === 'en' ? S.data.settings.currency_en : S.data.settings.currency_ua);

/* ==================== поиск: украинский, русский, английский ==================== */
/* Сводим украинские и русские буквы к общему виду: «мясо» находит «м'ясо» */
function fold(s) {
  return String(s || '').toLowerCase()
    .replace(/['\u2019\u02bc`\u044a\u044c]/g, '')
    .replace(/[\u0456\u0457\u044b]/g, '\u0438')
    .replace(/[\u0454\u044d\u0451]/g, '\u0435')
    .replace(/\u0491/g, '\u0433');
}
/* Корни, где языки расходятся сильнее, чем на одну букву */
const RU2UA = {
  'курица': 'курк', 'куриц': 'курк', 'куриный': 'куряч', 'курин': 'куряч',
  'картофель': 'картопл', 'картошка': 'картопл', 'картофельн': 'картопл',
  'говядина': 'яловичин', 'говяж': 'яловичин',
  'огурец': 'огирок', 'огурц': 'огирк', 'лук': 'цибул', 'чеснок': 'часник',
  'чесночн': 'часников', 'блины': 'млинц', 'блинчик': 'млинц', 'блин': 'млинц',
  'драники': 'дерун', 'драник': 'дерун', 'мороженое': 'морозив', 'морожен': 'морозив',
  'колбаса': 'ковбас', 'колбаск': 'ковбаск', 'шампиньон': 'печериц',
  'грибы': 'гриб', 'грибной': 'грибн', 'сливочный': 'вершков', 'сливочн': 'вершков',
  'хлеб': 'хлиб', 'выпечка': 'борошн', 'печень': 'печинк', 'печенка': 'печинк',
  'семга': 'сомга', 'сельдь': 'оселедец', 'селедка': 'оселедец', 'селедк': 'оселедец',
  'орех': 'горих', 'орехов': 'горихов', 'острый': 'гостр', 'сладкий': 'солодк',
  'жареный': 'смажен', 'жарен': 'смажен', 'лапша': 'локшин', 'морковь': 'моркв',
  'морков': 'моркв', 'напитки': 'напо', 'напиток': 'напо', 'крылья': 'крильц',
  'крылышки': 'крильц', 'овощи': 'овоч', 'овощн': 'овочев', 'яйцо': 'яйц', 'яйца': 'яйц',
  'запеченный': 'запечен', 'копченый': 'копчен', 'соленый': 'солон',
  'маринованный': 'маринован', 'свежий': 'свиж', 'твердый': 'тверд',
  'сыр': 'сир', 'сырный': 'сирн', 'рыба': 'риб', 'рыбный': 'рибн', 'рыбн': 'рибн',
  'зелень': 'зелен', 'вода': 'вод'
};
function ruToUa(q) {
  let out = q;
  for (const ru in RU2UA) {
    const f = fold(ru);
    if (out.indexOf(f) > -1) out = out.split(f).join(RU2UA[ru]);
  }
  return out;
}
const matches = (index, q) => index.indexOf(q) > -1 || index.indexOf(ruToUa(q)) > -1;

/* ============================ статичные надписи ============================ */
const UA = {};
function captureStatic() {
  $$('[data-en]').forEach((el, i) => { el.dataset.k = i; UA[i] = el.textContent; });
  const q = $('#q'); if (q) q.dataset.uaPh = q.placeholder;
  const cq = $('#cq'); if (cq) cq.dataset.uaPh = cq.placeholder;
  const ta = $('#j_about'); if (ta) ta.dataset.uaPh = ta.placeholder;
}
function applyStatic() {
  $$('[data-en]').forEach(el => {
    el.textContent = S.lang === 'en' ? el.dataset.en : UA[el.dataset.k];
  });
  const q = $('#q'); if (q) q.placeholder = S.lang === 'en' ? q.dataset.enPh : q.dataset.uaPh;
  const cq = $('#cq'); if (cq) cq.placeholder = S.lang === 'en' ? cq.dataset.enPh : cq.dataset.uaPh;
  const ta = $('#j_about');
  if (ta) ta.placeholder = S.lang === 'en' ? ta.dataset.phEn : ta.dataset.uaPh;
  document.documentElement.lang = S.lang === 'en' ? 'en' : 'uk';
  $('#bUA').classList.toggle('on', S.lang !== 'en');
  $('#bEN').classList.toggle('on', S.lang === 'en');
}

/* ============================ настройки ============================ */
function applySettings() {
  const s = S.data.settings;
  const v = {
    hours: L(s, 'hours'), hours_note: L(s, 'hours_note'), music: L(s, 'music'),
    address: L(s, 'address'), phone_text: s.phone_text,
    hookah_days: L(s, 'hookah_days'), hookah_from: L(s, 'hookah_from'),
    hookah_price: L(s, 'hookah_price'), rating: s.rating, rating_count: s.rating_count,
    hero_addr: S.lang === 'en' ? 'Kropyvnytskyi \u00b7 ' + s.address_en
      : '\u041a\u0440\u043e\u043f\u0438\u0432\u043d\u0438\u0446\u044c\u043a\u0438\u0439 \u00b7 ' +
        s.address_ua.replace(/,\s*\u041a\u0440\u043e\u043f\u0438\u0432\u043d\u0438\u0446\u044c\u043a\u0438\u0439$/, '')
  };
  $$('[data-s]').forEach(el => { el.textContent = (v[el.dataset.s] === undefined || v[el.dataset.s] === null) ? '' : v[el.dataset.s]; });
  $$('[data-tel]').forEach(a => { a.href = 'tel:' + s.phone_tel; });
  $$('a[href*="instagram.com"]').forEach(a => { a.href = s.instagram; });
  $$('a[href*="facebook.com"]').forEach(a => { a.href = s.facebook; });
  const r = $$('.rev__acts a');
  if (r[0]) r[0].href = 'https://search.google.com/local/reviews?placeid=' + s.google_place_id;
  if (r[1]) r[1].href = 'https://search.google.com/local/writereview?placeid=' + s.google_place_id;
  const map = $('.map iframe');
  if (map) map.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(s.address_ua) +
    '&z=16&output=embed';
  const ml = $('.iv a[href*="maps.google"]');
  if (ml) ml.href = 'https://maps.google.com/?q=' + encodeURIComponent(s.address_ua);

  const jobs = (S.lang === 'en' ? s.jobs_en : s.jobs_ua).split('|').filter(Boolean);
  $('#j_pos').innerHTML = jobs.map(j => '<option>' + esc(j.trim()) + '</option>').join('') +
    '<option>' + T('\u0406\u043d\u0448\u0430 \u043f\u043e\u0441\u0430\u0434\u0430', 'Another position') + '</option>';
}

/* ============================ звёзды ============================ */
function starSvg(fill) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6' +
    ' 1.1 6.4L12 17.4 6.2 20.4l1.1-6.4L2.6 9.4l6.5-.9z" fill="' + fill +
    '" stroke="#B4863A" stroke-width="1"/></svg>';
}
function rateBadge(d) {
  if (!d.rating) return '';
  const full = Math.round(d.rating);
  return '<div class="dish__rate"><span class="rate"><b>' +
    String(d.rating).replace('.', ',') + '</b>' +
    [1, 2, 3, 4, 5].map(i => starSvg(i <= full ? '#D8B06A' : '#EDE7DA')).join('') +
    '<span>\u00b7 ' + d.votes + '</span></span></div>';
}

/* ============================ меню ============================ */
function dishCard(d) {
  const ing = L(d, 'ing'), w = L(d, 'weight');
  const ph = d.image
    ? '<div class="dish__ph"><img src="/img/' + esc(d.image) + '" alt="' + esc(L(d, 'name')) +
      '" loading="lazy" decoding="async"></div>'
    : '<div class="dish__ph dish__ph--none" aria-hidden="true"></div>';
  const idx = fold([d.name_ua, d.name_en, d.ing_ua, d.ing_en].join(' '));
  return '<article class="dish" data-id="' + d.id + '" data-name="' + esc(idx) +
    '" tabindex="0" role="button">' + ph +
    '<div class="dish__txt"><h3 class="dish__name">' + esc(L(d, 'name')) + '</h3>' +
    (ing ? '<p class="dish__ing">' + esc(ing) + '</p>' : '') + rateBadge(d) + '</div>' +
    '<div class="dish__meta"><span class="dish__wt">' + esc(w) + '</span>' +
    '<span class="dish__price">' + d.price + '<i>' + esc(cur()) + '</i></span></div></article>';
}

function renderMenu() {
  const cats = S.data.categories.filter(c => c.items.length);
  if (!S.cat || !cats.some(c => c.slug === S.cat)) S.cat = cats.length ? cats[0].slug : null;

  $('#tabs').innerHTML = cats.map(c =>
    '<button class="tab' + (c.slug === S.cat ? ' is-on' : '') + '" data-cat="' + esc(c.slug) +
    '" role="tab" aria-selected="' + (c.slug === S.cat) + '">' + esc(L(c, 'name')) + '</button>').join('');

  $('#panels').innerHTML = cats.map(c => {
    const sub = L(c, 'sub');
    return '<div class="panel' + (c.slug === S.cat ? ' is-on' : '') + '" id="p-' + esc(c.slug) +
      '" role="tabpanel">' + (sub ? '<p class="panel__sub">' + esc(sub) + '</p>' : '') +
      '<div class="dishes">' + c.items.map(dishCard).join('') + '</div></div>';
  }).join('');

  $$('.tab').forEach(t => t.addEventListener('click', () => {
    S.cat = t.dataset.cat; S.term = ''; $('#q').value = '';
    renderMenu();
    t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }));
  $$('.dish').forEach(el => {
    const open = () => openDish(Number(el.dataset.id));
    el.addEventListener('click', open);
    el.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
    });
  });
  if (S.term) filter(S.term);
}

function filter(term) {
  S.term = term;
  const q = fold(term).trim();
  const panels = $$('.panel');
  if (!q) {
    $$('.dish').forEach(d => { d.style.display = ''; });
    panels.forEach(p => p.classList.toggle('is-on', p.id === 'p-' + S.cat));
    $('#nores').classList.remove('is-on');
    return;
  }
  let found = 0;
  panels.forEach(p => {
    let hits = 0;
    p.querySelectorAll('.dish').forEach(d => {
      const ok = matches(d.dataset.name, q);
      d.style.display = ok ? '' : 'none';
      if (ok) hits++;
    });
    p.classList.toggle('is-on', hits > 0);
    found += hits;
  });
  $('#nores').classList.toggle('is-on', found === 0);
}

function findDish(id) {
  for (const c of S.data.categories) {
    const d = c.items.find(x => x.id === id);
    if (d) return d;
  }
  return null;
}

/* ============================ карточка блюда ============================ */
function sheetOpen(el, html) {
  el.innerHTML = '<div class="sheet__box"><div class="sheet__grip"></div>' +
    '<button class="sheet__x" aria-label="' + T('\u0417\u0430\u043a\u0440\u0438\u0442\u0438', 'Close') +
    '">\u2715</button>' + html + '</div>';
  el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  el.querySelector('.sheet__x').addEventListener('click', () => sheetClose(el));
  el.onclick = ev => { if (ev.target === el) sheetClose(el); };
  el.querySelector('.sheet__x').focus();
}
function sheetClose(el) {
  el.classList.remove('on'); el.setAttribute('aria-hidden', 'true');
  if (!$$('.sheet.on').length) document.body.style.overflow = '';
}

function openDish(id) {
  const d = findDish(id); if (!d) return;
  const mine = S.mine[id] || 0;
  const orders = S.data.settings.orders_enabled === '1';
  const rateOn = S.data.settings.show_ratings === '1';
  const inCart = S.cart.some(i => i.id === id);

  const ORN = '<svg class="sheet__orn" viewBox="0 0 72 10" fill="none" aria-hidden="true">' +
    '<path d="M1 6c14-6 24 4 35 0s21-6 35 1" stroke="#B4863A" stroke-width="1.1"/></svg>';
  let html = (d.image ? '<img class="sheet__pic" src="/img/' + esc(d.image) + '" alt="' +
      esc(L(d, 'name')) + '">' : '') +
    '<h3>' + esc(L(d, 'name')) + '</h3>' + ORN +
    (L(d, 'ing') ? '<p class="sheet__ing">' + esc(L(d, 'ing')) + '</p>' : '') +
    '<div class="sheet__row"><span class="dish__wt">' + esc(L(d, 'weight')) + '</span>' +
    '<span class="sheet__price">' + d.price + '<i>' + esc(cur()) + '</i></span></div>';

  if (rateOn) {
    html += '<div class="sheet__row" style="flex-direction:column;align-items:stretch;gap:8px">' +
      '<span class="dish__wt">' + T('\u041e\u0446\u0456\u043d\u0456\u0442\u044c \u0441\u0442\u0440\u0430\u0432\u0443', 'Rate this dish') + '</span>' +
      '<div class="stars-in" id="rateBox">' + [1, 2, 3, 4, 5].map(i =>
        '<button data-v="' + i + '" class="' + (i <= mine ? 'on' : '') + '" aria-label="' + i +
        '">' + starSvg(i <= mine ? '#D8B06A' : '#EDE7DA') + '</button>').join('') + '</div>' +
      '<p class="rate-done" id="rateMsg">' + (d.rating
        ? T('\u0421\u0435\u0440\u0435\u0434\u043d\u044f \u043e\u0446\u0456\u043d\u043a\u0430 ' +
            String(d.rating).replace('.', ',') + ' \u00b7 ' + d.votes,
            'Average ' + d.rating + ' from ' + d.votes + ' votes')
        : T('\u041e\u0446\u0456\u043d\u043e\u043a \u043f\u043e\u043a\u0438 \u043c\u0430\u043b\u043e',
            'Not enough votes yet')) + '</p></div>';
  }
  if (orders) {
    html += '<button class="btn btn--fill" id="addCart" style="width:100%;margin-top:12px">' +
      (inCart ? T('\u0414\u043e\u0434\u0430\u0442\u0438 \u0449\u0435', 'Add one more')
              : T('\u0414\u043e\u0434\u0430\u0442\u0438 \u0434\u043e \u0437\u0430\u043c\u043e\u0432\u043b\u0435\u043d\u043d\u044f', 'Add to order')) + '</button>';
  }
  sheetOpen($('#dishSheet'), html);

  if (rateOn) $$('#rateBox button').forEach(b => b.addEventListener('click', async () => {
    const v = Number(b.dataset.v);
    $$('#rateBox button').forEach((x, i) => {
      x.classList.toggle('on', i < v);
      x.innerHTML = starSvg(i < v ? '#D8B06A' : '#EDE7DA');
    });
    try {
      const r = await post('/api/rate', { dish_id: id, stars: v });
      S.mine[id] = v;
      $('#rateMsg').textContent = r.votes >= 3
        ? T('\u0414\u044f\u043a\u0443\u0454\u043c\u043e! \u0421\u0435\u0440\u0435\u0434\u043d\u044f ' +
            String(r.rating).replace('.', ',') + ' \u00b7 ' + r.votes,
            'Thank you! Average ' + r.rating + ' from ' + r.votes)
        : T('\u0414\u044f\u043a\u0443\u0454\u043c\u043e! \u041e\u0446\u0456\u043d\u043a\u0430 \u0432\u0440\u0430\u0445\u043e\u0432\u0430\u043d\u0430', 'Thank you! Saved');
      const fresh = await fetch('/api/content');
      if (fresh.ok) { S.data = await fresh.json(); renderMenu(); }
    } catch (e) { $('#rateMsg').textContent = e.message; }
  }));

  if (orders) $('#addCart').addEventListener('click', () => {
    addToCart(id); sheetClose($('#dishSheet'));
  });
}


/* ============================ каталог замовлення ============================ */
let catFilter = 'all';

function catOpen() {
  const el = $('#catalog');
  el.classList.add('on'); el.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  renderChips(); renderCat();
  $('#catX').focus();
}
function catClose() {
  const el = $('#catalog');
  el.classList.remove('on'); el.setAttribute('aria-hidden', 'true');
  if (!$$('.sheet.on').length) document.body.style.overflow = '';
}

function renderChips() {
  const cats = S.data.categories.filter(c => c.items.length);
  $('#catChips').innerHTML =
    '<button class="chip' + (catFilter === 'all' ? ' on' : '') + '" data-c="all">' +
    T('\u0412\u0441\u0456', 'All') + '</button>' +
    cats.map(c => '<button class="chip' + (catFilter === c.slug ? ' on' : '') +
      '" data-c="' + esc(c.slug) + '">' + esc(L(c, 'name')) + '</button>').join('');
  $$('#catChips .chip').forEach(b => b.addEventListener('click', () => {
    catFilter = b.dataset.c; renderChips(); renderCat();
    $('#catalog .catalog__body').scrollTop = 0;
  }));
}

function catRow(d) {
  const line = S.cart.find(i => i.id === d.id);
  const qty = line ? line.qty : 0;
  const img = d.image
    ? '<img src="/img/' + esc(d.image) + '" alt="" loading="lazy">'
    : '<img src="/img/marble2.webp" alt="" loading="lazy">';
  const ctrl = qty
    ? '<div class="qty"><button data-cm="' + d.id + '" aria-label="\u2212">\u2212</button><b>' +
      qty + '</b><button data-cp="' + d.id + '" aria-label="+">+</button></div>'
    : '<button class="crow__add" data-ca="' + d.id + '">+ ' +
      T('\u0414\u043e\u0434\u0430\u0442\u0438', 'Add') + '</button>';
  return '<div class="crow' + (qty ? ' has' : '') + '">' + img +
    '<div><span class="crow__n">' + esc(L(d, 'name')) + '</span>' +
    '<span class="crow__p">' + d.price + ' ' + esc(cur()) +
    (L(d, 'weight') ? ' \u00b7 ' + esc(L(d, 'weight')) : '') + '</span></div>' + ctrl + '</div>';
}

function renderCat() {
  const q = fold($('#cq').value).trim();
  let html = '', found = 0;
  for (const c of S.data.categories) {
    if (!c.items.length) continue;
    if (catFilter !== 'all' && c.slug !== catFilter) continue;
    const items = c.items.filter(d => {
      if (!q) return true;
      return matches(fold([d.name_ua, d.name_en, d.ing_ua, d.ing_en].join(' ')), q);
    });
    if (!items.length) continue;
    found += items.length;
    html += '<div class="cgroup">' + esc(L(c, 'name')) + '</div>' + items.map(catRow).join('');
  }
  $('#catList').innerHTML = found ? html :
    '<p class="cart__empty">' + T('\u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0448\u043b\u0438', 'Nothing found') + '</p>';

  $$('[data-ca]').forEach(b => b.addEventListener('click', () => { addToCart(Number(b.dataset.ca)); renderCat(); }));
  $$('[data-cp]').forEach(b => b.addEventListener('click', () => {
    const l = S.cart.find(i => i.id === Number(b.dataset.cp)); if (l) setQty(l.id, l.qty + 1); renderCat();
  }));
  $$('[data-cm]').forEach(b => b.addEventListener('click', () => {
    const l = S.cart.find(i => i.id === Number(b.dataset.cm)); if (l) setQty(l.id, l.qty - 1); renderCat();
  }));
  catFoot();
}

function catFoot() {
  $('#catSum').textContent = cartTotal() + ' ' + cur();
  $('#catNext').disabled = !S.cart.length;
}

/* ============================ корзина ============================ */
function addToCart(id) {
  const line = S.cart.find(i => i.id === id);
  if (line) line.qty = Math.min(50, line.qty + 1);
  else S.cart.push({ id: id, qty: 1 });
  paintCart();
}
function setQty(id, qty) {
  const i = S.cart.findIndex(x => x.id === id);
  if (i < 0) return;
  if (qty <= 0) S.cart.splice(i, 1); else S.cart[i].qty = Math.min(50, qty);
  paintCart();
}
const cartCount = () => S.cart.reduce((s, i) => s + i.qty, 0);
const cartTotal = () => S.cart.reduce((s, i) => {
  const d = findDish(i.id); return s + (d ? d.price * i.qty : 0);
}, 0);

function paintCart() {
  const btn = $('#cartBtn');
  btn.hidden = !S.cart.length || S.data.settings.orders_enabled !== '1';
  $('#cartN').textContent = cartCount();
  if ($('#catalog').classList.contains('on')) catFoot();
  if ($('#cartSheet').classList.contains('on')) openCart();
}

function openCart() {
  const lines = S.cart.map(i => {
    const d = findDish(i.id); if (!d) return '';
    return '<div class="cartline"><div><b>' + esc(L(d, 'name')) + '</b><span>' +
      d.price + ' ' + esc(cur()) + ' \u00d7 ' + i.qty + ' = ' + (d.price * i.qty) + ' ' +
      esc(cur()) + '</span></div><div class="qty">' +
      '<button data-m="' + d.id + '" aria-label="\u2212">\u2212</button><b>' + i.qty +
      '</b><button data-p="' + d.id + '" aria-label="+">+</button></div>' +
      '<button class="sheet__x" style="position:static;width:34px;height:34px" data-x="' +
      d.id + '" aria-label="' + T('\u041f\u0440\u0438\u0431\u0440\u0430\u0442\u0438', 'Remove') + '">\u2715</button></div>';
  }).join('');

  let html = '<h3>' + T('\u0412\u0430\u0448\u0435 \u0437\u0430\u043c\u043e\u0432\u043b\u0435\u043d\u043d\u044f', 'Your order') + '</h3>';
  if (!S.cart.length) {
    html += '<p class="cart__empty">' + T('\u041a\u043e\u0448\u0438\u043a \u043f\u043e\u0440\u043e\u0436\u043d\u0456\u0439', 'The cart is empty') + '</p>';
  } else {
    html += lines +
      '<div class="cart__sum"><span>' + T('\u0420\u0430\u0437\u043e\u043c', 'Total') + '</span><b>' +
      cartTotal() + ' ' + esc(cur()) + '</b></div>' +
      '<form id="ordForm" novalidate style="margin-top:8px"><div class="f2">' +
      '<div class="fld"><label for="o_name">' + T('\u0406\u043c\u02bc\u044f', 'Name') + '</label>' +
      '<input id="o_name" autocomplete="name" maxlength="80"></div>' +
      '<div class="fld"><label for="o_phone">' + T('\u0422\u0435\u043b\u0435\u0444\u043e\u043d', 'Phone') + '</label>' +
      '<input id="o_phone" type="tel" autocomplete="tel" placeholder="+380 __ ___ __ __" maxlength="40"></div></div>' +
      modesHtml() + timeHtml() +
      '<div class="fld"><label for="o_cmt">' + T('\u041f\u043e\u0431\u0430\u0436\u0430\u043d\u043d\u044f', 'Notes') + '</label>' +
      '<textarea id="o_cmt" rows="2" maxlength="500"></textarea></div>' +
      '<p class="fmsg" id="ordMsg" role="status"></p>' +
      '<button class="btn btn--fill" type="submit" style="width:100%">' +
      T('\u041d\u0430\u0434\u0456\u0441\u043b\u0430\u0442\u0438 \u0437\u0430\u043c\u043e\u0432\u043b\u0435\u043d\u043d\u044f', 'Send the order') + '</button>' +
      '<p class="fnote">' + esc(L(S.data.settings, 'order_note')) + '</p></form>';
  }
  sheetOpen($('#cartSheet'), html);

  $$('[data-p]').forEach(b => b.addEventListener('click', () => {
    const line = S.cart.find(i => i.id === Number(b.dataset.p));
    if (line) setQty(line.id, line.qty + 1);
  }));
  $$('[data-m]').forEach(b => b.addEventListener('click', () => {
    const line = S.cart.find(i => i.id === Number(b.dataset.m));
    if (line) setQty(line.id, line.qty - 1);
  }));
  $$('[data-x]').forEach(b => b.addEventListener('click', () => setQty(Number(b.dataset.x), 0)));

  const f = $('#ordForm');
  if (!f) return;
  wireOrderForm();
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = $('#ordMsg'); msg.className = 'fmsg';
    const name = $('#o_name'), phone = $('#o_phone');
    if (name.value.trim().length < 2)
      return bad(name, msg, T('\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u0456\u043c\u02bc\u044f', 'Enter your name'));
    if (phone.value.replace(/\D/g, '').length < 9)
      return bad(phone, msg, T('\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u0442\u0435\u043b\u0435\u0444\u043e\u043d', 'Enter your phone'));
    try {
      const mode = orderMode();
      const addr = $('#o_addr');
      if (mode === 'delivery' && addr.value.trim().length < 5)
        return bad(addr, msg, T('\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u0430\u0434\u0440\u0435\u0441\u0443 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'Enter the delivery address'));
      const r = await post('/api/order', {
        name: name.value, phone: phone.value, mode: mode, address: addr ? addr.value : '',
        wanted: orderTime(), comment: $('#o_cmt').value,
        items: S.cart.map(i => ({ id: i.id, qty: i.qty }))
      });
      S.cart = []; paintCart();
      sheetOpen($('#cartSheet'),
        '<h3>' + T('\u0417\u0430\u043c\u043e\u0432\u043b\u0435\u043d\u043d\u044f \u043f\u0440\u0438\u0439\u043d\u044f\u0442\u043e', 'Order received') + '</h3>' +
        '<p class="sheet__ing">' + T('\u041d\u043e\u043c\u0435\u0440', 'Number') + ' <b>\u2116' + r.number +
        '</b> \u00b7 ' + r.total + ' ' + esc(cur()) + '</p>' +
        '<p class="sheet__ing">' + esc(L(S.data.settings, 'order_note')) + '</p>' +
        '<a class="btn btn--line" style="width:100%" href="tel:' + esc(S.data.settings.phone_tel) +
        '">' + esc(S.data.settings.phone_text) + '</a>');
    } catch (e) { msg.className = 'fmsg err'; msg.textContent = e.message; }
  });
}


function modesHtml() {
  const s = S.data.settings;
  const deliv = s.delivery_enabled === '1';
  const opt = (v, title, sub, on) =>
    '<label class="mode' + (on ? ' on' : '') + '" data-mode="' + v + '">' +
    '<input type="radio" name="omode" value="' + v + '"' + (on ? ' checked' : '') + '>' +
    '<span><b>' + title + '</b><span>' + sub + '</span></span></label>';
  return '<div class="fld"><label>' + T('\u0421\u043f\u043e\u0441\u0456\u0431 \u043e\u0442\u0440\u0438\u043c\u0430\u043d\u043d\u044f', 'How to receive') + '</label>' +
    '<div class="modes">' +
      opt('pickup', T('\u0417\u0430\u0431\u0435\u0440\u0443 \u0441\u0430\u043c', 'Pickup'),
          T('\u041f\u0440\u043e\u0441\u043f\u0435\u043a\u0442 \u0412\u0438\u043d\u043d\u0438\u0447\u0435\u043d\u043a\u0430, 17', 'Vynnychenka Ave 17'), true) +
      opt('table', T('\u0414\u043e \u0441\u0442\u043e\u043b\u0443', 'To my table'),
          T('\u042f \u0432 \u0437\u0430\u043b\u0456', 'I am in the room'), false) +
      (deliv ? opt('delivery', T('\u0414\u043e\u0434\u043e\u043c\u0443', 'Delivery'),
          T('\u041f\u043e \u043c\u0456\u0441\u0442\u0443', 'Around the city'), false) : '') +
    '</div>' +
    '<div id="delivBox"><p class="hintline">' + esc(L(S.data.settings, 'delivery_note')) + '</p>' +
    '<div class="fld"><label for="o_addr">' + T('\u0410\u0434\u0440\u0435\u0441\u0430 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438', 'Delivery address') + '</label>' +
    '<input id="o_addr" maxlength="200" autocomplete="street-address" placeholder="' +
    T('\u0412\u0443\u043b\u0438\u0446\u044f, \u0431\u0443\u0434\u0438\u043d\u043e\u043a, \u043a\u0432\u0430\u0440\u0442\u0438\u0440\u0430', 'Street, building, flat') + '"></div></div></div>';
}

function timeHtml() {
  const s = S.data.settings;
  const from = Math.max(0, Math.min(23, Number(s.order_hour_from) || 11));
  const to = Math.max(from, Math.min(23, Number(s.order_hour_to) || 22));
  const now = new Date();
  let h = Math.min(to, Math.max(from, now.getHours() + 1));
  return '<div class="fld"><label>' + T('\u041d\u0430 \u044f\u043a\u0438\u0439 \u0447\u0430\u0441', 'For what time') + '</label>' +
    '<div class="timebox off" id="timeBox">' +
      '<div class="timebox__top"><div class="timebox__val" id="timeVal">' +
        T('\u042f\u043a\u043d\u0430\u0439\u0448\u0432\u0438\u0434\u0448\u0435', 'As soon as possible') + '</div>' +
      '<label class="asap"><input type="checkbox" id="asap" checked>' +
        T('\u044f\u043a\u043d\u0430\u0439\u0448\u0432\u0438\u0434\u0448\u0435', 'asap') + '</label></div>' +
      '<div class="slider"><label for="th">' + T('\u0433\u043e\u0434', 'hr') + '</label>' +
        '<input type="range" id="th" min="' + from + '" max="' + to + '" step="1" value="' + h + '"></div>' +
      '<div class="slider"><label for="tm">' + T('\u0445\u0432', 'min') + '</label>' +
        '<input type="range" id="tm" min="0" max="55" step="5" value="0"></div>' +
    '</div></div>';
}

function wireOrderForm() {
  const box = $('#timeBox'), asap = $('#asap'), th = $('#th'), tm = $('#tm'), val = $('#timeVal');
  const paint = r => {
    const p = (r.value - r.min) / (r.max - r.min) * 100;
    r.style.setProperty('--pct', p + '%');
  };
  const show = () => {
    paint(th); paint(tm);
    box.classList.toggle('off', asap.checked);
    val.textContent = asap.checked
      ? T('\u042f\u043a\u043d\u0430\u0439\u0448\u0432\u0438\u0434\u0448\u0435', 'As soon as possible')
      : String(th.value).padStart(2, '0') + ':' + String(tm.value).padStart(2, '0');
  };
  [th, tm].forEach(r => r.addEventListener('input', () => {
    if (asap.checked) { asap.checked = false; }
    show();
  }));
  asap.addEventListener('change', show);
  show();

  $$('.mode').forEach(m => m.addEventListener('click', () => {
    $$('.mode').forEach(x => x.classList.toggle('on', x === m));
    m.querySelector('input').checked = true;
    $('#delivBox').classList.toggle('on', m.dataset.mode === 'delivery');
  }));
}
const orderMode = () => {
  const r = document.querySelector('input[name="omode"]:checked');
  return r ? r.value : 'pickup';
};
const orderTime = () => {
  const asap = $('#asap');
  if (!asap || asap.checked) return '';
  return String($('#th').value).padStart(2, '0') + ':' + String($('#tm').value).padStart(2, '0');
};

function bad(el, msg, textMsg) {
  el.classList.add('bad'); el.focus();
  msg.className = 'fmsg err'; msg.textContent = textMsg;
  el.addEventListener('input', () => el.classList.remove('bad'), { once: true });
}

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ||
    T('\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f. \u0421\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0449\u0435 \u0440\u0430\u0437.', 'Failed. Try again.'));
  return d;
}

/* ============================ галерея ============================ */
var galShown = 3;
function renderGallery() {
  $('#gal').innerHTML = S.data.gallery.map(function (g, i) {
    return '<button class="gal__i' + (i < galShown ? '' : ' hide') + '" type="button" data-i="' +
      i + '"><img src="/img/' + esc(g.file) + '" alt="' + esc(L(g, 'alt')) +
      '" loading="lazy" decoding="async"></button>';
  }).join('');
  $$('.gal__i').forEach(function (b, i) { b.addEventListener('click', function () { openLb(i); }); });
  paintGalMore();
}
function paintGalMore() {
  var total = S.data.gallery.length, btn = $('#galMore');
  if (!btn) return;
  if (total <= 3) { btn.parentNode.style.display = 'none'; return; }
  btn.parentNode.style.display = '';
  btn.textContent = galShown >= total
    ? T('\u0417\u0433\u043e\u0440\u043d\u0443\u0442\u0438', 'Show less')
    : T('\u0414\u0438\u0432\u0438\u0442\u0438\u0441\u044c \u0434\u0430\u043b\u0456 \u00b7 \u0449\u0435 ' + (total - galShown),
        'Show more \u00b7 ' + (total - galShown) + ' left');
}
function galToggle() {
  var total = S.data.gallery.length;
  galShown = galShown >= total ? 3 : Math.min(total, galShown + 3);
  var items = $$('.gal__i');
  items.forEach(function (b, i) { b.classList.toggle('hide', i >= galShown); });
  paintGalMore();
  if (galShown === 3) $('#gallery').scrollIntoView({ block: 'start' });
}


let curLb = 0, back = null;
const lb = () => $('#lb');
function show(i) {
  const g = S.data.gallery;
  curLb = (i + g.length) % g.length;
  $('#lbImg').src = '/img/' + g[curLb].file;
  $('#lbImg').alt = L(g[curLb], 'alt');
  $('#lbCap').textContent = L(g[curLb], 'alt');
}
function openLb(i) {
  back = document.activeElement; show(i);
  lb().classList.add('is-on'); document.body.style.overflow = 'hidden'; $('#lbX').focus();
}
function closeLb() {
  lb().classList.remove('is-on');
  if (!$$('.sheet.on').length) document.body.style.overflow = '';
  if (back) back.focus();
}

/* ============================ анкета в команду ============================ */
function wireJobs() {
  $('#jobForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = $('#jobMsg'); msg.className = 'fmsg';
    const name = $('#j_name'), phone = $('#j_phone');
    if (name.value.trim().length < 2)
      return bad(name, msg, T('\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u0456\u043c\u02bc\u044f', 'Enter your name'));
    if (phone.value.replace(/\D/g, '').length < 9)
      return bad(phone, msg, T('\u0412\u043a\u0430\u0436\u0456\u0442\u044c \u0442\u0435\u043b\u0435\u0444\u043e\u043d', 'Enter your phone'));
    const btn = $('#jobSend'); btn.disabled = true;
    try {
      await post('/api/apply', {
        name: name.value, phone: phone.value, position: $('#j_pos').value,
        experience: $('#j_exp').value, start: $('#j_start').value, about: $('#j_about').value
      });
      $('#jobForm').reset();
      msg.className = 'fmsg ok';
      msg.textContent = T('\u0410\u043d\u043a\u0435\u0442\u0443 \u043d\u0430\u0434\u0456\u0441\u043b\u0430\u043d\u043e. \u041c\u0438 \u0437\u0430\u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0443\u0454\u043c\u043e.',
                          'Application sent. We will call you soon.');
    } catch (e) { msg.className = 'fmsg err'; msg.textContent = e.message; }
    finally { btn.disabled = false; }
  });
}

/* ============================ прочее ============================ */
function wire() {
  $('#bUA').addEventListener('click', () => setLang('uk'));
  $('#bEN').addEventListener('click', () => setLang('en'));

  const burger = $('#burger'), nav = $('#nav');
  burger.addEventListener('click', () =>
    burger.setAttribute('aria-expanded', nav.classList.toggle('open')));
  nav.addEventListener('click', e => { if (e.target.tagName === 'A') nav.classList.remove('open'); });

  $('#q').addEventListener('input', e => filter(e.target.value));

  $('#lbX').addEventListener('click', closeLb);
  $('#lbP').addEventListener('click', () => show(curLb - 1));
  $('#lbN').addEventListener('click', () => show(curLb + 1));
  lb().addEventListener('click', e => { if (e.target === lb()) closeLb(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('#catalog').classList.contains('on') && !$$('.sheet.on').length) return catClose();
      $$('.sheet.on').forEach(sheetClose);
      if (lb().classList.contains('is-on')) closeLb();
      return;
    }
    if (!lb().classList.contains('is-on')) return;
    if (e.key === 'ArrowLeft') show(curLb - 1);
    if (e.key === 'ArrowRight') show(curLb + 1);
  });
  let sx = 0;
  lb().addEventListener('touchstart', e => { sx = e.changedTouches[0].clientX; }, { passive: true });
  lb().addEventListener('touchend', e => {
    const d = e.changedTouches[0].clientX - sx;
    if (Math.abs(d) > 45) show(curLb + (d < 0 ? 1 : -1));
  }, { passive: true });

  $('#galMore').addEventListener('click', galToggle);

  $('#cartBtn').addEventListener('click', openCart);
  ['openCat', 'openCat2'].forEach(id => {
    const b = $('#' + id);
    if (b) b.addEventListener('click', catOpen);
  });
  $('#navOrder').addEventListener('click', ev => { ev.preventDefault(); catOpen(); });
  $('#catX').addEventListener('click', catClose);
  $('#cq').addEventListener('input', renderCat);
  $('#catNext').addEventListener('click', () => { catClose(); openCart(); });

  const top = $('#toTop');
  top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', () => {
    top.classList.toggle('on', window.scrollY > 700);
  }, { passive: true });

  wireSmoothNav();
  $('#yr').textContent = new Date().getFullYear();
  wireJobs();
}

function wireSmoothNav() {
  var fade = document.createElement('div');
  fade.className = 'pagefade';
  document.body.appendChild(fade);
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  $$('a[href^="#"]').forEach(function (a2) {
    a2.addEventListener('click', function (ev) {
      var id = a2.getAttribute('href');
      if (!id || id === '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      var nav = $('#nav'); if (nav) nav.classList.remove('open');

      var go = function () {
        var top = target.getBoundingClientRect().top + window.pageYOffset -
                  (parseInt(getComputedStyle(document.documentElement)
                    .getPropertyValue('--hd'), 10) || 58) - 8;
        // старые браузеры не понимают объект в scrollTo — тогда прыгаем сразу
        try { window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' }); }
        catch (e) { window.scrollTo(0, top); }
        target.classList.remove('jumped');
        void target.offsetWidth;
        if (!reduce) target.classList.add('jumped');
      };

      if (reduce) return go();
      fade.classList.add('on');
      setTimeout(function () { go(); fade.classList.remove('on'); }, 240);
    });
  });
}

function setLang(l) {
  S.lang = l;
  applyStatic(); applySettings(); renderMenu(); renderGallery(); paintCart();
  paintGalMore();
  if ($('#catalog').classList.contains('on')) { renderChips(); renderCat(); }
  if (lb().classList.contains('is-on')) show(curLb);
  if ($('#cartSheet').classList.contains('on')) openCart();
}

function reveal() {
  if (!('IntersectionObserver' in window)) return $$('.rv').forEach(e => e.classList.add('in'));
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: .1, rootMargin: '0px 0px -40px 0px' });
  $$('.rv').forEach(e => io.observe(e));
}

(async function init() {
  captureStatic(); wire();
  try {
    const r = await fetch('/api/content');
    if (!r.ok) throw new Error('http ' + r.status);
    S.data = await r.json();
  } catch (err) {
    console.error(err);
    $('#panels').innerHTML = '<p style="text-align:center;padding:40px 0;color:var(--muted)">' +
      '\u041c\u0435\u043d\u044e \u0442\u0438\u043c\u0447\u0430\u0441\u043e\u0432\u043e \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0435.</p>';
    reveal(); return;
  }
  try {
    const mr = await fetch('/api/my-ratings');
    S.mine = mr.ok ? await mr.json() : {};
  } catch (e) { S.mine = {}; }
  if (location.search.indexOf('lang=en') > -1) S.lang = 'en';
  applyStatic(); applySettings(); renderMenu(); renderGallery(); paintCart(); reveal();
})();
