'use strict';
require('./lib/env');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const D = require('./lib/db');
const TG = require('./lib/telegram');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = __dirname;
const IMG_DIR = path.join(PUBLIC, 'img');
// UPLOAD_DIR — каталог для новых фото. На хостинге указывайте на постоянный диск,
// иначе загруженные снимки исчезнут при следующем деплое.
const UPLOAD_DIR = process.env.UPLOAD_DIR || IMG_DIR;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_BODY = 12 * 1024 * 1024;          // 12 МБ — хватает на фото
const SESSION_HOURS = 24 * 7;

D.seedIfEmpty();
D.migrateExtras();
D.ensureSecrets();

/* ------------------------------------------------------------ утилиты */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(code, { 'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin', ...headers });
  res.end(buf);
}
const json = (res, code, obj, headers = {}) =>
  send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8',
                                         'Cache-Control': 'no-store', ...headers });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}

const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max = 800) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, dflt = 0) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};
const bool = v => (v ? 1 : 0);

/* ------------------------------------------------------------ сессии */
function sign(data) {
  return crypto.createHmac('sha256', D.get('session_secret')).update(data).digest('base64url');
}
function makeSession() {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + SESSION_HOURS * 3600e3, n: crypto.randomBytes(8).toString('hex')
  })).toString('base64url');
  return payload + '.' + sign(payload);
}
function validSession(cookie) {
  if (!cookie) return false;
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(cookie);
  if (!m) return false;
  const [payload, mac] = m[1].split('.');
  if (!payload || !mac) return false;
  const want = sign(payload);
  if (mac.length !== want.length ||
      !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now(); }
  catch { return false; }
}
const isAuthed = req => validSession(req.headers.cookie);

function voterId(req) {
  const m = /(?:^|;\s*)vid=([A-Za-z0-9_-]{10,64})/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}
const newVoter = () => crypto.randomBytes(16).toString('base64url');

const attempts = new Map();                 // защита от перебора пароля
function tooManyTries(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.first > 15 * 60e3) { attempts.delete(ip); return false; }
  return a.n >= 8;
}
function noteTry(ip, ok) {
  if (ok) return attempts.delete(ip);
  const a = attempts.get(ip) || { n: 0, first: Date.now() };
  a.n++; attempts.set(ip, a);
}

/* ------------------------------------------------------------ загрузка фото */
const SIGS = [
  { ext: '.webp', test: b => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
  { ext: '.png',  test: b => b.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { ext: '.jpg',  test: b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF }
];
function saveImage(dataUrl) {
  const m = /^data:image\/(webp|png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('bad_image');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) throw new Error('image_too_large');
  const sig = SIGS.find(s => s.test(buf));
  if (!sig) throw new Error('not_an_image');
  const name = 'up-' + Date.now().toString(36) + '-' + crypto.randomBytes(4).toString('hex') + sig.ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return name;
}
function removeImage(file) {
  const safe = path.basename(String(file || ''));
  if (!safe.startsWith('up-')) return;                    // трогаем только загруженные
  for (const dir of new Set([UPLOAD_DIR, IMG_DIR])) {
    const p = path.join(dir, safe);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

/* ------------------------------------------------------------ статика */
function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  let full;
  if (rel.startsWith('/img/') && UPLOAD_DIR !== IMG_DIR) {
    const name = path.basename(rel);
    const up = path.join(UPLOAD_DIR, name);
    full = fs.existsSync(up) ? up : path.join(IMG_DIR, name);
  } else {
    full = path.normalize(path.join(PUBLIC, rel));
    if (!full.startsWith(PUBLIC)) return send(res, 403, 'Forbidden');
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(full).toLowerCase();
    const etag = '"' + st.size.toString(36) + '-' + st.mtimeMs.toString(36) + '"';
    if (req.headers['if-none-match'] === etag) return send(res, 304, '');
    const isImg = full.startsWith(IMG_DIR) || full.startsWith(UPLOAD_DIR);
    // Картинки не меняются — их кэшируем надолго. А разметку, скрипты и стили
    // браузер обязан проверять на каждом заходе, иначе после обновления сайта
    // у гостя останется старая версия и новые кнопки работать не будут.
    const cache = isImg ? 'public, max-age=2592000' : 'no-cache';
    send(res, 200, fs.readFileSync(full),
         { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, ETag: etag });
  });
}

/* ------------------------------------------------------------ API админки */
const T = { dishes: 'dishes', categories: 'categories', extras: 'extras', gallery: 'gallery' };

function adminAll() {
  return {
    settings: D.allSettings(),
    categories: D.db.prepare('SELECT * FROM categories ORDER BY sort,id').all(),
    dishes: D.db.prepare('SELECT * FROM dishes ORDER BY sort,id').all(),
    extras: D.db.prepare('SELECT * FROM extras ORDER BY sort,id').all(),
    gallery: D.db.prepare('SELECT * FROM gallery ORDER BY sort,id').all(),
    passFromEnv: Boolean(String(process.env.ADMIN_PASSWORD || '').trim()),
    images: fs.readdirSync(IMG_DIR).filter(f => /\.(webp|png|jpe?g)$/i.test(f)).sort()
  };
}

function upsertDish(b, id) {
  const vals = [int(b.category_id, 1, 1e9), str(b.name_ua, 120), str(b.name_en, 120),
    str(b.ing_ua, 400), str(b.ing_en, 400), str(b.weight_ua, 40), str(b.weight_en, 40),
    int(b.price, 0, 1000000), str(b.image, 200), int(b.sort, 0, 100000), bool(b.visible)];
  if (!vals[1]) throw new Error('name_required');
  if (id) {
    D.db.prepare(`UPDATE dishes SET category_id=?,name_ua=?,name_en=?,ing_ua=?,ing_en=?,
      weight_ua=?,weight_en=?,price=?,image=?,sort=?,visible=? WHERE id=?`).run(...vals, id);
    return id;
  }
  D.db.prepare(`INSERT INTO dishes(category_id,name_ua,name_en,ing_ua,ing_en,weight_ua,
    weight_en,price,image,sort,visible) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(...vals);
  return D.db.prepare('SELECT last_insert_rowid() id').get().id;
}

function upsertCategory(b, id) {
  const slug = str(b.slug, 40).toLowerCase().replace(/[^a-z0-9-]/g, '-') ||
               'cat-' + crypto.randomBytes(3).toString('hex');
  const vals = [slug, str(b.name_ua, 80), str(b.name_en, 80), str(b.sub_ua, 200),
                str(b.sub_en, 200), int(b.sort, 0, 100000), bool(b.visible)];
  if (!vals[1]) throw new Error('name_required');
  if (id) {
    D.db.prepare(`UPDATE categories SET slug=?,name_ua=?,name_en=?,sub_ua=?,sub_en=?,
      sort=?,visible=? WHERE id=?`).run(...vals, id);
    return id;
  }
  D.db.prepare(`INSERT INTO categories(slug,name_ua,name_en,sub_ua,sub_en,sort,visible)
    VALUES(?,?,?,?,?,?,?)`).run(...vals);
  return D.db.prepare('SELECT last_insert_rowid() id').get().id;
}

function upsertExtra(b, id) {
  const vals = [str(b.grp_ua, 80), str(b.grp_en, 80), str(b.name_ua, 120), str(b.name_en, 120),
    str(b.weight_ua, 40), str(b.weight_en, 40), int(b.price, 0, 1000000),
    int(b.sort, 0, 100000), bool(b.visible)];
  if (!vals[2]) throw new Error('name_required');
  if (id) {
    D.db.prepare(`UPDATE extras SET grp_ua=?,grp_en=?,name_ua=?,name_en=?,weight_ua=?,
      weight_en=?,price=?,sort=?,visible=? WHERE id=?`).run(...vals, id);
    return id;
  }
  D.db.prepare(`INSERT INTO extras(grp_ua,grp_en,name_ua,name_en,weight_ua,weight_en,
    price,sort,visible) VALUES(?,?,?,?,?,?,?,?,?)`).run(...vals);
  return D.db.prepare('SELECT last_insert_rowid() id').get().id;
}

function upsertGallery(b, id) {
  let file = str(b.file, 200);
  if (b.upload) file = saveImage(b.upload);
  const vals = [path.basename(file), text(b.alt_ua, 200), text(b.alt_en, 200),
                int(b.sort, 0, 100000), bool(b.visible)];
  if (!vals[0]) throw new Error('file_required');
  if (id) {
    D.db.prepare('UPDATE gallery SET file=?,alt_ua=?,alt_en=?,sort=?,visible=? WHERE id=?')
      .run(...vals, id);
    return id;
  }
  D.db.prepare('INSERT INTO gallery(file,alt_ua,alt_en,sort,visible) VALUES(?,?,?,?,?)').run(...vals);
  return D.db.prepare('SELECT last_insert_rowid() id').get().id;
}

/* ------------------------------------------------------------ маршруты */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const https = (req.headers['x-forwarded-proto'] || '').includes('https');

  try {
    /* ---- публичное ---- */
    if (p === '/api/content' && req.method === 'GET')
      return json(res, 200, D.publicContent());

    if (p === '/api/rate' && req.method === 'POST') {
      const b = await readBody(req);
      const dishId = int(b.dish_id, 1, 1e9);
      const stars = int(b.stars, 1, 5, 0);
      if (!dishId || !stars) return json(res, 400, { error: 'Оберіть оцінку від 1 до 5' });
      if (!D.db.prepare('SELECT id FROM dishes WHERE id=?').get(dishId))
        return json(res, 404, { error: 'Страву не знайдено' });
      let vid = voterId(req), setCookie = null;
      if (!vid) {
        vid = newVoter();
        setCookie = `vid=${vid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${365 * 24 * 3600}` +
                    (https ? '; Secure' : '');
      }
      D.db.prepare(`INSERT INTO ratings(dish_id,stars,voter) VALUES(?,?,?)
        ON CONFLICT(dish_id,voter) DO UPDATE SET stars=excluded.stars`).run(dishId, stars, vid);
      const r = D.db.prepare('SELECT COUNT(*) n, AVG(stars) avg FROM ratings WHERE dish_id=?')
        .get(dishId);
      return json(res, 200,
        { ok: true, votes: r.n, rating: Math.round(r.avg * 10) / 10, mine: stars },
        setCookie ? { 'Set-Cookie': setCookie } : {});
    }

    if (p === '/api/my-ratings' && req.method === 'GET') {
      const vid = voterId(req);
      if (!vid) return json(res, 200, {});
      const rows = D.db.prepare('SELECT dish_id, stars FROM ratings WHERE voter=?').all(vid);
      return json(res, 200, Object.fromEntries(rows.map(r => [r.dish_id, r.stars])));
    }

    if (p === '/api/apply' && req.method === 'POST') {
      if (tooManyTries('apply:' + ip))
        return json(res, 429, { error: 'Забагато заявок. Спробуйте пізніше.' });
      const b = await readBody(req);
      const name = str(b.name, 80), phone = str(b.phone, 40);
      if (name.length < 2) return json(res, 400, { error: "Вкажіть ім'я" });
      if (phone.replace(/\D/g, '').length < 9)
        return json(res, 400, { error: 'Вкажіть телефон' });
      D.db.prepare(`INSERT INTO applications(name,phone,position,experience,start,about)
        VALUES(?,?,?,?,?,?)`).run(name, phone, str(b.position, 80),
          str(b.experience, 60), str(b.start, 60), text(b.about, 800));
      const appId = D.db.prepare('SELECT last_insert_rowid() id').get().id;
      noteTry('apply:' + ip, false);

      if (D.get('tg_applications', '1') === '1') {
        const a = D.db.prepare('SELECT * FROM applications WHERE id=?').get(appId);
        TG.send(TG.applicationText(a)).then(r => {
          D.db.prepare('UPDATE applications SET tg_sent=?, tg_error=? WHERE id=?')
            .run(r.ok ? 1 : 0, r.ok ? '' : String(r.error || '').slice(0, 200), appId);
        });
      }
      return json(res, 200, { ok: true });
    }

    if (p === '/api/order' && req.method === 'POST') {
      if (D.get('orders_enabled', '1') !== '1')
        return json(res, 403, { error: 'Онлайн-замовлення тимчасово вимкнено' });
      if (tooManyTries('order:' + ip))
        return json(res, 429, { error: 'Забагато замовлень. Зателефонуйте нам.' });
      const b = await readBody(req);
      const name = str(b.name, 80), phone = str(b.phone, 40);
      if (name.length < 2) return json(res, 400, { error: "Вкажіть ім'я" });
      if (phone.replace(/\D/g, '').length < 9)
        return json(res, 400, { error: 'Вкажіть телефон' });
      const raw = Array.isArray(b.items) ? b.items.slice(0, 60) : [];
      if (!raw.length) return json(res, 400, { error: 'Кошик порожній' });

      // цены берём из базы, а не из браузера — их могли подменить
      const items = [], find = D.db.prepare('SELECT id,name_ua,price FROM dishes WHERE id=? AND visible=1');
      let total = 0;
      for (const it of raw) {
        const d = find.get(int(it.id, 1, 1e9));
        if (!d) continue;
        const qty = int(it.qty, 1, 50, 1);
        items.push({ id: d.id, name: d.name_ua, price: d.price, qty });
        total += d.price * qty;
      }
      if (!items.length) return json(res, 400, { error: 'Страви не знайдено' });
      const mode = ['pickup', 'table', 'delivery'].includes(b.mode) ? b.mode : 'pickup';
      const address = str(b.address, 200);
      if (mode === 'delivery') {
        if (D.get('delivery_enabled', '1') !== '1')
          return json(res, 403, { error: 'Доставка тимчасово недоступна' });
        if (address.length < 5)
          return json(res, 400, { error: 'Вкажіть адресу доставки' });
      }
      D.db.prepare(`INSERT INTO orders(name,phone,mode,wanted,comment,items,total,address)
        VALUES(?,?,?,?,?,?,?,?)`).run(name, phone, mode,
          str(b.wanted, 60), text(b.comment, 500), JSON.stringify(items), total,
          mode === 'delivery' ? address : '');
      const id = D.db.prepare('SELECT last_insert_rowid() id').get().id;
      noteTry('order:' + ip, false);

      // Заказ уже в базе. Телеграм — доставка уведомления, а не условие приёма:
      // если он недоступен, гость всё равно получает подтверждение,
      // а в админке заказ будет помечен как недоставленный.
      const row = D.db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      TG.send(TG.orderText(row, items)).then(r => {
        D.db.prepare('UPDATE orders SET tg_sent=?, tg_error=? WHERE id=?')
          .run(r.ok ? 1 : 0, r.ok ? '' : String(r.error || '').slice(0, 200), id);
        if (!r.ok) console.error('Telegram: замовлення №' + id + ' не доставлено —', r.error);
      });

      return json(res, 200, { ok: true, number: id, total });
    }

    if (p === '/api/login' && req.method === 'POST') {
      if (tooManyTries(ip))
        return json(res, 429, { error: 'Забагато спроб. Спробуйте за 15 хвилин.' });
      const b = await readBody(req);
      const ok = D.verifyPassword(String(b.password || ''), D.get('admin_hash'));
      noteTry(ip, ok);
      if (!ok) return json(res, 401, { error: 'Невірний пароль' });
      return json(res, 200, { ok: true }, {
        'Set-Cookie': `sid=${makeSession()}; HttpOnly; SameSite=Strict; Path=/; ` +
                      `Max-Age=${SESSION_HOURS * 3600}${https ? '; Secure' : ''}`
      });
    }

    if (p === '/api/logout' && req.method === 'POST')
      return json(res, 200, { ok: true },
        { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });

    if (p === '/api/me') return json(res, 200, { authed: isAuthed(req) });

    /* ---- админка ---- */
    if (p.startsWith('/api/admin')) {
      if (!isAuthed(req)) return json(res, 401, { error: 'Потрібен вхід' });

      if (p === '/api/admin/all' && req.method === 'GET') return json(res, 200, adminAll());

      if (p === '/api/admin/settings' && req.method === 'PUT') {
        const b = await readBody(req);
        for (const [k, v] of Object.entries(b)) {
          if (k === 'admin_hash' || k === 'session_secret') continue;
          if (!/^[a-z0-9_]{2,40}$/.test(k)) continue;
          D.set(k, str(v, 500));
        }
        return json(res, 200, { ok: true });
      }

      if (p === '/api/admin/password' && req.method === 'PUT') {
        const b = await readBody(req);
        if (!D.verifyPassword(String(b.current || ''), D.get('admin_hash')))
          return json(res, 401, { error: 'Поточний пароль невірний' });
        if (String(b.next || '').length < 8)
          return json(res, 400, { error: 'Новий пароль — від 8 символів' });
        D.set('admin_hash', D.hashPassword(String(b.next)));
        return json(res, 200, { ok: true });
      }

      if (p === '/api/admin/upload' && req.method === 'POST') {
        const b = await readBody(req);
        return json(res, 200, { file: saveImage(b.upload) });
      }

      if (p === '/api/admin/tg-test' && req.method === 'POST') {
        if (!TG.enabled())
          return json(res, 400, { error: 'Не задано TG_TOKEN або TG_CHAT у файлі .env' });
        const r = await TG.send(TG.testText());
        return r.ok ? json(res, 200, { ok: true })
                    : json(res, 502, { error: 'Telegram: ' + r.error });
      }

      const resend = /^\/api\/admin\/(orders|applications)\/(\d+)\/resend$/.exec(p);
      if (resend && req.method === 'POST') {
        const table = resend[1], id = Number(resend[2]);
        const row = D.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
        if (!row) return json(res, 404, { error: 'Не знайдено' });
        const msg = table === 'orders'
          ? TG.orderText(row, JSON.parse(row.items))
          : TG.applicationText(row);
        const r = await TG.send(msg);
        D.db.prepare(`UPDATE ${table} SET tg_sent=?, tg_error=? WHERE id=?`)
          .run(r.ok ? 1 : 0, r.ok ? '' : String(r.error || '').slice(0, 200), id);
        return r.ok ? json(res, 200, { ok: true })
                    : json(res, 502, { error: 'Telegram: ' + r.error });
      }

      if (p === '/api/admin/inbox' && req.method === 'GET') {
        return json(res, 200, {
          telegram: { configured: TG.enabled() },
          applications: D.db.prepare('SELECT * FROM applications ORDER BY id DESC LIMIT 200').all(),
          orders: D.db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all()
            .map(o => ({ ...o, items: JSON.parse(o.items) })),
          ratings: D.db.prepare(`SELECT d.id, d.name_ua, COUNT(r.id) n,
              ROUND(AVG(r.stars),2) avg FROM dishes d JOIN ratings r ON r.dish_id=d.id
              GROUP BY d.id ORDER BY avg ASC, n DESC`).all()
        });
      }

      const inbox = /^\/api\/admin\/(applications|orders)\/(\d+)$/.exec(p);
      if (inbox) {
        const table = inbox[1], id = Number(inbox[2]);
        if (req.method === 'DELETE') {
          D.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'PATCH') {
          const b = await readBody(req);
          const st = ['new', 'done', 'archived'].includes(b.status) ? b.status : 'new';
          D.db.prepare(`UPDATE ${table} SET status=? WHERE id=?`).run(st, id);
          return json(res, 200, { ok: true });
        }
      }

      const m = /^\/api\/admin\/(dishes|categories|extras|gallery)(?:\/(\d+))?$/.exec(p);
      if (m) {
        const table = T[m[1]];
        const id = m[2] ? Number(m[2]) : null;
        const fn = { dishes: upsertDish, categories: upsertCategory,
                     extras: upsertExtra, gallery: upsertGallery }[m[1]];

        if (req.method === 'POST' && !id) return json(res, 200, { id: fn(await readBody(req), null) });
        if (req.method === 'PUT' && id)   return json(res, 200, { id: fn(await readBody(req), id) });
        if (req.method === 'DELETE' && id) {
          if (table === 'gallery') {
            const row = D.db.prepare('SELECT file FROM gallery WHERE id=?').get(id);
            if (row) removeImage(row.file);
          }
          D.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'PATCH' && !id) {          // перестановка порядка
          const b = await readBody(req);
          const upd = D.db.prepare(`UPDATE ${table} SET sort = ? WHERE id = ?`);
          D.db.exec('BEGIN');
          try {
            (Array.isArray(b.order) ? b.order : []).forEach((rowId, i) =>
              upd.run(i, int(rowId, 1, 1e9)));
            D.db.exec('COMMIT');
          } catch (err) { D.db.exec('ROLLBACK'); throw err; }
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: 'Немає такого методу' });
    }

    if (p.startsWith('/api/')) return json(res, 404, { error: 'Немає такого методу' });
    if (p === '/admin') return serveStatic(req, res, '/admin.html');
    return serveStatic(req, res, p);

  } catch (err) {
    const known = { too_large: [413, 'Файл завеликий'], bad_json: [400, 'Пошкоджені дані'],
      bad_image: [400, 'Це не зображення'], not_an_image: [400, 'Це не зображення'],
      image_too_large: [413, 'Зображення більше 8 МБ'],
      name_required: [400, 'Потрібна назва'], file_required: [400, 'Потрібен файл'] };
    const [code, msg] = known[err.message] || [500, 'Помилка сервера'];
    if (code === 500) console.error(err);
    return json(res, code, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`Східний Куточок → http://localhost:${PORT}`);
  console.log(`Адмінка          → http://localhost:${PORT}/admin`);
});
