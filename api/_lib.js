/* ==========================================================
   Live Fruit Juice — shared API helpers
   ------------------------------------------------------------
   Key layout in Vercel KV (Upstash Redis):

     lfj:settings            -> settings object
     lfj:products            -> array of products
     lfj:staff               -> array of staff (owner + staff)
     lfj:inv:<invoice_no>    -> one invoice, items embedded
     lfj:idx:<YYYY-MM-DD>    -> sorted set of that day's invoice numbers
     lfj:seq:<YYYYMMDD>      -> daily invoice counter (atomic INCR)
     lfj:sess:<sha256(token)> -> session, 30 day TTL
     lfj:try:<user>:<ip>     -> login attempt counter

   Splitting invoices per key means a sale only writes its own
   rows, so two staff selling at the same moment cannot overwrite
   each other the way a single JSON blob would allow.
   ========================================================== */

const kv = require("./_kv");
const crypto = require("crypto");

/** short random id, no dependency needed */
const uid = () => crypto.randomBytes(8).toString("hex");

const KEYS = {
  settings: "lfj:settings",
  products: "lfj:products",
  staff: "lfj:staff",
  inv: (no) => `lfj:inv:${no}`,
  idx: (date) => `lfj:idx:${date}`,
  seq: (ymd) => `lfj:seq:${ymd}`,
  // every date that has invoices, so a full restore can find and clear them all
  allDates: "lfj:alldates",
};

const DEFAULT_SETTINGS = {
  shop_name: "Live Fruit Juice",
  shop_address: "",
  shop_phone: "",
  auto_print: true,
  show_thankyou: true,
};

const SEED_PRODUCTS = [
  { name: "আপেল জুস", price_s: 50, price_m: 80, price_l: 120 },
  { name: "কলা জুস", price_s: 60, price_m: 90, price_l: 130 },
  { name: "আরবুজ মিশ্র জুস", price_s: 70, price_m: 100, price_l: 150 },
  { name: "পেয়ারা জুস", price_s: 65, price_m: 95, price_l: 140 },
  { name: "অ্যানারস জুস", price_s: 80, price_m: 120, price_l: 170 },
  { name: "পান্তা লেমন জুস", price_s: 40, price_m: 60, price_l: 90 },
];

/* ---------- dates (Bangladesh shop, but the device clock decides) ---------- */

const pad = (n) => String(n).padStart(2, "0");

function dateDisp(d) {
  const day = d || new Date();
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function ymd(d) {
  return dateDisp(d).replace(/-/g, "");
}

function timeDisp(d) {
  const day = d || new Date();
  return `${pad(day.getHours())}:${pad(day.getMinutes())}`;
}

/* ---------- validation helpers ---------- */

const str = (v, max) => String(v === undefined || v === null ? "" : v).trim().slice(0, max || 200);

function nonNeg(v) {
  const n = Number(v);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function cleanProduct(body) {
  const name = str(body && body.name, 120);
  if (!name) throw httpError(400, "পণ্যের নাম লিখুন");
  return {
    name,
    price_s: nonNeg(body.price_s),
    price_m: nonNeg(body.price_m),
    price_l: nonNeg(body.price_l),
  };
}

function cleanSettings(body) {
  const out = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof DEFAULT_SETTINGS[k] === "boolean") out[k] = Boolean(body && body[k]);
    else out[k] = str(body && body[k], 200);
  }
  return out;
}

const publicStaff = (e) => ({
  id: e.id,
  username: e.username,
  role: e.role === "owner" ? "owner" : "staff",
  active: e.active !== false,
  created_at: e.created_at || null,
});

/* ---------- http ---------- */

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function readBody(req) {
  if (!req || req.method === "GET" || req.method === "HEAD") return {};
  let b = req.body;
  if (b === undefined || b === null || b === "") b = "";
  if (typeof b === "string") {
    if (!b.trim()) return {};
    try { b = JSON.parse(b); } catch (e) { throw httpError(400, "অনুরোধের ডেটা পড়া যায়নি"); }
  }
  if (Buffer.isBuffer(b)) b = b.toString("utf8");
  if (typeof b !== "object") throw httpError(400, "অনুরোধের ডেটা ঠিক নয়");
  return b;
}

/** wrap a handler so thrown errors become clean JSON responses */
function handler(fn) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await fn(req, res);
    } catch (e) {
      const status = e && e.status ? e.status : 500;
      if (status >= 500) console.error("[api]", e);
      if (!res.headersSent) {
        // setup errors (missing env vars) carry text the owner must act on
        const generic = "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন";
        res.status(status).json({ error: e && e.expose ? e.message : status >= 500 ? generic : e.message });
      }
    }
  };
}

/** create the default owner + seed data on a brand new database */
async function ensureSeeded(auth) {
  const staff = await kv.get(KEYS.staff);
  if (Array.isArray(staff) && staff.length) return false;
  const authModule = require("./_auth");
  await kv.set(KEYS.staff, [
    {
      id: "owner-default",
      username: "owner",
      password_hash: authModule.hashPassword("owner123"),
      role: "owner",
      active: true,
      created_at: new Date().toISOString(),
    },
  ]);
  const products = SEED_PRODUCTS.map((p, i) => ({
    id: `seed-${i + 1}`,
    name: p.name,
    price_s: p.price_s,
    price_m: p.price_m,
    price_l: p.price_l,
    updated_at: new Date().toISOString(),
  }));
  await kv.set(KEYS.products, products);
  await kv.set(KEYS.settings, { ...DEFAULT_SETTINGS });
  return true;
}

module.exports = {
  kv, uid, KEYS, DEFAULT_SETTINGS, SEED_PRODUCTS,
  dateDisp, ymd, timeDisp, pad,
  str, nonNeg, cleanProduct, cleanSettings, publicStaff,
  httpError, readBody, handler, ensureSeeded,
};
