'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'kutochok.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_FILE);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  slug    TEXT NOT NULL UNIQUE,
  name_ua TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  sub_ua  TEXT NOT NULL DEFAULT '',
  sub_en  TEXT NOT NULL DEFAULT '',
  sort    INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS dishes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name_ua     TEXT NOT NULL,
  name_en     TEXT NOT NULL DEFAULT '',
  ing_ua      TEXT NOT NULL DEFAULT '',
  ing_en      TEXT NOT NULL DEFAULT '',
  weight_ua   TEXT NOT NULL DEFAULT '',
  weight_en   TEXT NOT NULL DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  image       TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  visible     INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_dishes_cat ON dishes(category_id, sort);

CREATE TABLE IF NOT EXISTS extras (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  grp_ua    TEXT NOT NULL,
  grp_en    TEXT NOT NULL DEFAULT '',
  name_ua   TEXT NOT NULL,
  name_en   TEXT NOT NULL DEFAULT '',
  weight_ua TEXT NOT NULL DEFAULT '',
  weight_en TEXT NOT NULL DEFAULT '',
  price     INTEGER NOT NULL DEFAULT 0,
  sort      INTEGER NOT NULL DEFAULT 0,
  visible   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ratings (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id INTEGER NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  stars   INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  voter   TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_once ON ratings(dish_id, voter);

CREATE TABLE IF NOT EXISTS applications (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  phone     TEXT NOT NULL,
  position  TEXT NOT NULL DEFAULT '',
  experience TEXT NOT NULL DEFAULT '',
  start     TEXT NOT NULL DEFAULT '',
  about     TEXT NOT NULL DEFAULT '',
  status    TEXT NOT NULL DEFAULT 'new',
  created   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL,
  phone   TEXT NOT NULL,
  mode    TEXT NOT NULL DEFAULT 'pickup',
  wanted  TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  items   TEXT NOT NULL,
  total   INTEGER NOT NULL DEFAULT 0,
  status  TEXT NOT NULL DEFAULT 'new',
  created TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  file    TEXT NOT NULL,
  alt_ua  TEXT NOT NULL DEFAULT '',
  alt_en  TEXT NOT NULL DEFAULT '',
  sort    INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1
);
`);

/* Колонки появились позже — добавляем, если базе они ещё не знакомы */
for (const t of ['orders', 'applications']) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  if (!cols.includes('tg_sent'))
    db.exec(`ALTER TABLE ${t} ADD COLUMN tg_sent INTEGER NOT NULL DEFAULT 0`);
  if (!cols.includes('tg_error'))
    db.exec(`ALTER TABLE ${t} ADD COLUMN tg_error TEXT NOT NULL DEFAULT ''`);
}
{
  const cols = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  if (!cols.includes('address'))
    db.exec("ALTER TABLE orders ADD COLUMN address TEXT NOT NULL DEFAULT ''");
}

/* ------------------------------------------------------------- настройки */
const DEFAULTS = {
  phone_text: '(095) 025 87 78',
  phone_tel: '+380950258778',
  address_ua: 'проспект Винниченка, 17, Кропивницький',
  address_en: '17 Vynnychenka Ave, Kropyvnytskyi',
  hours_ua: 'Щодня 11:00 — 22:00',
  hours_en: 'Daily 11:00 — 22:00',
  hours_note_ua: 'Понеділок — неділя, без вихідних',
  hours_note_en: 'Open seven days a week',
  music_ua: 'Пт — Сб, 17:30 — 21:30',
  music_en: 'Fri — Sat, 17:30 — 21:30',
  hookah_days_ua: 'Четвер — неділя', hookah_days_en: 'Thursday — Sunday',
  hookah_from_ua: 'з 15:00', hookah_from_en: 'from 15:00',
  hookah_price_ua: '300 грн', hookah_price_en: '300 UAH',
  rating: '4,2',
  rating_count: '367',
  google_place_id: 'ChIJcTO6trZD0EARF2cAaYmSHNQ',
  instagram: 'https://www.instagram.com/shidniy.kutochok/',
  facebook: 'https://www.facebook.com/people/%D0%A1%D1%85%D1%96%D0%B4%D0%BD%D0%B8%D0%B9-%D0%9A%D1%83%D1%82%D0%BE%D1%87%D0%BE%D0%BA/100026370169624/',
  currency_ua: 'грн', currency_en: 'UAH',
  show_ratings: '1',
  orders_enabled: '1',
  tg_applications: '1',
  delivery_enabled: '1',
  delivery_note_ua: 'Доставка по місту. Вартість і час підтвердимо телефоном.',
  delivery_note_en: 'City delivery. We confirm the fee and timing by phone.',
  order_hour_from: '11',
  order_hour_to: '22',
  order_note_ua: 'Ми передзвонимо, щоб підтвердити замовлення.',
  order_note_en: 'We will call you back to confirm the order.',
  jobs_ua: 'Офіціант|Кухар мангалу|Кухар гарячого цеху|Бармен|Кальянний майстер|Помічник на кухні',
  jobs_en: 'Waiter|Grill cook|Line cook|Bartender|Hookah master|Kitchen assistant'
};

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSetting = db.prepare(
  'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function get(key, fallback = '') {
  const r = getSetting.get(key);
  return r ? r.value : fallback;
}
function set(key, value) { setSetting.run(String(key), String(value)); }

function allSettings() {
  const out = { ...DEFAULTS };
  for (const row of db.prepare('SELECT key,value FROM settings').all()) out[row.key] = row.value;
  delete out.admin_hash; delete out.session_secret;
  return out;
}

/* --------------------------------------------------------------- запуск */
function seedIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
  if (n > 0) return false;

  const seedPath = path.join(DATA_DIR, 'seed.json');
  if (!fs.existsSync(seedPath)) return false;
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const insCat = db.prepare(
    'INSERT INTO categories(slug,name_ua,name_en,sub_ua,sub_en,sort) VALUES(?,?,?,?,?,?)');
  const insDish = db.prepare(`INSERT INTO dishes
    (category_id,name_ua,name_en,ing_ua,ing_en,weight_ua,weight_en,price,image,sort)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  const insExtra = db.prepare(`INSERT INTO extras
    (grp_ua,grp_en,name_ua,name_en,weight_ua,weight_en,price,sort) VALUES(?,?,?,?,?,?,?,?)`);
  const insGal = db.prepare('INSERT INTO gallery(file,alt_ua,alt_en,sort) VALUES(?,?,?,?)');

  db.exec('BEGIN');
  try {
    const ids = {};
    for (const c of seed.categories) {
      insCat.run(c.slug, c.name_ua, c.name_en, c.sub_ua, c.sub_en, c.sort);
      ids[c.slug] = db.prepare('SELECT id FROM categories WHERE slug = ?').get(c.slug).id;
    }
    for (const d of seed.dishes)
      insDish.run(ids[d.cat], d.name_ua, d.name_en, d.ing_ua, d.ing_en,
                  d.weight_ua, d.weight_en, d.price, d.image, d.sort);
    for (const x of (seed.extras || []))
      insExtra.run(x.grp_ua, x.grp_en, x.name_ua, x.name_en, x.weight_ua, x.weight_en, x.price, x.sort);
    for (const g of seed.gallery) insGal.run(g.file, g.alt_ua, g.alt_en, g.sort);
    for (const [k, v] of Object.entries(DEFAULTS)) set(k, v);
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return true;
}

function migrateExtras() {
  const has = db.prepare("SELECT id FROM categories WHERE slug='dodatky'").get();
  const rows = db.prepare('SELECT * FROM extras ORDER BY sort,id').all();
  if (has || !rows.length) return false;
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM categories').get().m;
  db.prepare(`INSERT INTO categories(slug,name_ua,name_en,sub_ua,sub_en,sort)
    VALUES('dodatky','Додатки','Extras','Соуси, напої та випічка до столу',
           'Sauces, drinks and bread for the table', ?)`).run(maxSort + 1);
  const cid = db.prepare("SELECT id FROM categories WHERE slug='dodatky'").get().id;
  const ins = db.prepare(`INSERT INTO dishes(category_id,name_ua,name_en,ing_ua,ing_en,
    weight_ua,weight_en,price,image,sort,visible) VALUES(?,?,?,?,?,?,?,?,'',?,1)`);
  db.exec('BEGIN');
  try {
    rows.forEach((r, i) => ins.run(cid, r.name_ua, r.name_en, r.grp_ua, r.grp_en,
      r.weight_ua, r.weight_en, r.price, i));
    db.exec('DELETE FROM extras');
    db.exec('COMMIT');
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  return true;
}

function ensureSecrets() {
  if (!get('session_secret')) set('session_secret', crypto.randomBytes(32).toString('hex'));

  const envPass = String(process.env.ADMIN_PASSWORD || '').trim();
  const stored = get('admin_hash');

  if (envPass) {
    // ADMIN_PASSWORD задан — он и есть пароль. Это же способ восстановить доступ,
    // если пароль забыт: поменять значение в .env и перезапустить сервер.
    if (!stored || !verifyPassword(envPass, stored)) {
      set('admin_hash', hashPassword(envPass));
      console.log(stored
        ? '  Пароль адмінки оновлено зі змінної ADMIN_PASSWORD.'
        : '  Пароль адмінки взято зі змінної ADMIN_PASSWORD.');
    }
    return;
  }

  if (!stored) {
    const pass = crypto.randomBytes(6).toString('base64url');
    set('admin_hash', hashPassword(pass));
    console.log('\n  ПАРОЛЬ АДМІНКИ (збережіть, показується один раз): ' + pass + '\n');
  }
}

function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pass), salt, 32);
  return salt.toString('hex') + ':' + key.toString('hex');
}
function verifyPassword(pass, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const key = crypto.scryptSync(String(pass), Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(keyHex, 'hex');
  return key.length === want.length && crypto.timingSafeEqual(key, want);
}

/* -------------------------------------------------------------- витрина */
function publicContent() {
  const cats = db.prepare(
    'SELECT id,slug,name_ua,name_en,sub_ua,sub_en FROM categories WHERE visible=1 ORDER BY sort,id').all();
  const dishes = db.prepare(`SELECT id,category_id,name_ua,name_en,ing_ua,ing_en,
      weight_ua,weight_en,price,image FROM dishes WHERE visible=1 ORDER BY sort,id`).all();
  const byCat = new Map(cats.map(c => [c.id, []]));
  for (const d of dishes) if (byCat.has(d.category_id)) byCat.get(d.category_id).push(d);

  const showRatings = get('show_ratings', '1') === '1';
  if (showRatings) {
    const rates = db.prepare(`SELECT dish_id, COUNT(*) n, AVG(stars) avg
      FROM ratings GROUP BY dish_id`).all();
    const map = new Map(rates.map(r => [r.dish_id, r]));
    for (const d of dishes) {
      const r = map.get(d.id);
      // показываем среднее только когда голосов достаточно, чтобы оно что-то значило
      if (r && r.n >= 3) { d.rating = Math.round(r.avg * 10) / 10; d.votes = r.n; }
    }
  }
  return {
    settings: allSettings(),
    categories: cats.map(c => ({ ...c, items: byCat.get(c.id) || [] })),
    gallery: db.prepare('SELECT id,file,alt_ua,alt_en FROM gallery WHERE visible=1 ORDER BY sort,id').all()
  };
}

module.exports = { db, get, set, allSettings, seedIfEmpty, ensureSecrets, migrateExtras,
                   hashPassword, verifyPassword, publicContent, DEFAULTS };
