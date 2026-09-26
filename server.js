/* =============================================================
   Live Fruit Juice — Server
   Single source of truth: data/db.json  (one JSON file)
   ============================================================= */

"use strict";

const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");

/* Secret for signing session tokens. Set a strong random value in production. */
const SECRET =
  process.env.APP_SECRET || "livefruitjuice-dev-secret-change-me";

const PASSWORD_SALT = "livefruitjuice_salt_";

/* ---------------- DEFAULT DATABASE ---------------- */
function defaultDB() {
  return {
    meta: { version: 1, created: new Date().toISOString() },
    settings: {
      shop_name: "Live Fruit Juice",
      shop_address: "",
      shop_phone: "",
      auto_print: true,
      show_thankyou: true,
    },
    employees: [
      {
        id: newId(),
        username: "owner",
        // SHA256("livefruitjuice_salt_owner123")
        password_hash: hashPassword("owner123"),
        role: "owner",
        active: true,
        created_at: new Date().toISOString(),
      },
    ],
    products: [
      { id: newId(), name: "আপেল জুস", price_s: 50, price_m: 80, price_l: 120 },
      { id: newId(), name: "কলা জুস", price_s: 60, price_m: 90, price_l: 130 },
      { id: newId(), name: "আরবুজ মিশ্র জুস", price_s: 70, price_m: 100, price_l: 150 },
      { id: newId(), name: "পেয়ারা জুস", price_s: 65, price_m: 95, price_l: 140 },
      { id: newId(), name: "অ্যানারস জুস", price_s: 80, price_m: 120, price_l: 170 },
      { id: newId(), name: "পান্তা লেমন জুস", price_s: 40, price_m: 60, price_l: 90 },
    ],
    invoices: [],
    invoice_items: [],
  };
}

/* ---------------- HELPERS ---------------- */
const newId = () => crypto.randomUUID();
const hashPassword = (pw) =>
  crypto.createHash("sha256").update(PASSWORD_SALT + pw).digest("hex");

function todayStr(d = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function nowTime(d = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------------- DB LOAD / SAVE (serialised) ---------------- */
let db = null;
let writeChain = Promise.resolve();

function loadDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      const base = defaultDB();
      db = { ...base, ...parsed, meta: { ...base.meta, ...(parsed.meta || {}) } };
      console.log(`[db] loaded ${DB_FILE}`);
    } catch (e) {
      console.error("[db] corrupted, backing up and recreating:", e.message);
      fs.copyFileSync(DB_FILE, DB_FILE + ".broken-" + Date.now());
      db = defaultDB();
    }
  } else {
    db = defaultDB();
    console.log("[db] created fresh database");
  }
  // ensure required arrays exist
  for (const k of ["employees", "products", "invoices", "invoice_items"]) {
    if (!Array.isArray(db[k])) db[k] = [];
  }
  if (!db.settings) db.settings = defaultDB().settings;
  return db;
}

/** Atomic write: temp file then rename. Calls are queued so writes never race. */
function saveDB() {
  writeChain = writeChain.then(async () => {
    const tmp = DB_FILE + ".tmp";
    const json = JSON.stringify(db, null, 2);
    await fsp.writeFile(tmp, json, "utf8");
    await fsp.rename(tmp, DB_FILE);
  }).catch((e) => {
    console.error("[db] write failed:", e);
  });
  return writeChain;
}

/* ---------------- SSE (live updates) ---------------- */
const sseClients = new Set();

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data || {})}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch (e) {
      sseClients.delete(res);
    }
  }
}

/* ---------------- TOKENS ---------------- */
function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expect = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  // timing-safe compare
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function readToken(req) {
  const h = req.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/** attaches req.user if a valid token is present */
function authOptional(req, _res, next) {
  const u = verifyToken(readToken(req));
  if (u) req.user = { username: u.username, role: u.role };
  next();
}

/** blocks request unless a valid token exists */
function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "লগইন প্রয়োজন" });
  next();
}

/** blocks request unless owner */
function ownerOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "লগইন প্রয়োজন" });
  if (req.user.role !== "owner")
    return res.status(403).json({ error: "শুধুমাত্র মালিক এই কাজটি করতে পারবেন" });
  next();
}

/* ---------------- MIDDLEWARE ---------------- */
app.use(express.json({ limit: "1mb" }));
app.use(authOptional);

// request log (concise)
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    res.on("finish", () =>
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode}`)
    );
  }
  next();
});

/* =============================================================
   AUTH
   ============================================================= */

// POST /api/auth/login  { username, password_hash }
app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "").trim();
  const hash = String(req.body?.password_hash || "").trim().toLowerCase();
  if (!username || !hash) return res.status(400).json({ error: "তথ্য অসম্পূর্ণ" });

  const emp = db.employees.find(
    (e) => e.username.toLowerCase() === username.toLowerCase() && e.active !== false
  );

  if (!emp || emp.password_hash.toLowerCase() !== hash) {
    return res.status(401).json({ error: "ইউজারনেম বা পাসওয়ার্ড ভুল" });
  }

  const token = signToken({
    username: emp.username,
    role: emp.role === "owner" ? "owner" : "staff",
    exp: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30 days
  });

  res.json({ token, username: emp.username, role: emp.role });
});

/** GET /api/auth/me — validate the stored session */
app.get("/api/auth/me", authRequired, (req, res) => {
  const emp = db.employees.find((e) => e.username === req.user.username);
  if (!emp || emp.active === false)
    return res.status(401).json({ error: "অ্যাকাউন্ট নেই বা নিষ্ক্রিয়" });
  res.json({ username: emp.username, role: emp.role });
});

/* =============================================================
   SETTINGS  (owner writes, everyone reads)
   ============================================================= */

app.get("/api/settings", (_req, res) => res.json(db.settings));

app.put("/api/settings", ownerOnly, async (req, res) => {
  const s = req.body || {};
  db.settings = {
    shop_name: String(s.shop_name || "Live Fruit Juice").slice(0, 120),
    shop_address: String(s.shop_address || "").slice(0, 300),
    shop_phone: String(s.shop_phone || "").slice(0, 40),
    auto_print: s.auto_print !== false,
    show_thankyou: s.show_thankyou !== false,
  };
  await saveDB();
  broadcast("settings", db.settings);
  res.json(db.settings);
});

/* =============================================================
   PRODUCTS
   ============================================================= */

app.get("/api/products", (_req, res) => {
  res.json(db.products.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "bn")));
});

function sanitiseProduct(body) {
  const num = (v) => {
    const n = Number(v);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  };
  const name = String(body?.name || "").trim().slice(0, 120);
  if (!name) return { error: "পণ্যের নাম লিখুন" };
  return {
    value: {
      name,
      price_s: num(body.price_s),
      price_m: num(body.price_m),
      price_l: num(body.price_l),
    },
  };
}

app.post("/api/products", ownerOnly, async (req, res) => {
  const { value, error } = sanitiseProduct(req.body);
  if (error) return res.status(400).json({ error });
  const p = { id: newId(), ...value, updated_at: new Date().toISOString() };
  db.products.push(p);
  await saveDB();
  broadcast("products", { action: "insert", row: p });
  res.status(201).json(p);
});

app.put("/api/products/:id", ownerOnly, async (req, res) => {
  const i = db.products.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "পণ্য পাওয়া যায়নি" });
  const { value, error } = sanitiseProduct(req.body);
  if (error) return res.status(400).json({ error });
  db.products[i] = { ...db.products[i], ...value, updated_at: new Date().toISOString() };
  await saveDB();
  broadcast("products", { action: "update", row: db.products[i] });
  res.json(db.products[i]);
});

app.delete("/api/products/:id", ownerOnly, async (req, res) => {
  const i = db.products.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "পণ্য পাওয়া যায়নি" });
  const [row] = db.products.splice(i, 1);
  await saveDB();
  broadcast("products", { action: "delete", row });
  res.json({ ok: true });
});

/* =============================================================
   EMPLOYEES (owner only for writes)
   ============================================================= */

const publicEmployee = (e) => ({
  id: e.id,
  username: e.username,
  role: e.role,
  active: e.active !== false,
  created_at: e.created_at,
});

app.get("/api/employees", authRequired, (req, res) => {
  // staff only needs the name list for the owner filter; owner needs full detail
  if (req.user.role === "owner") res.json(db.employees.map(publicEmployee));
  else res.json(db.employees.filter((e) => e.active !== false).map(publicEmployee));
});

app.post("/api/employees", ownerOnly, async (req, res) => {
  const username = String(req.body?.username || "").trim().slice(0, 40);
  const password = String(req.body?.password || "");
  const role = req.body?.role === "owner" ? "owner" : "staff";

  if (!username) return res.status(400).json({ error: "ইউজারনেম লিখুন" });
  if (password.length < 4)
    return res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে" });
  if (db.employees.some((e) => e.username.toLowerCase() === username.toLowerCase()))
    return res.status(409).json({ error: "এই ইউজারনেম আগে থেকেই আছে" });

  const emp = {
    id: newId(),
    username,
    password_hash: hashPassword(password),
    role,
    active: true,
    created_at: new Date().toISOString(),
  };
  db.employees.push(emp);
  await saveDB();
  broadcast("employees", { action: "insert", row: publicEmployee(emp) });
  res.status(201).json(publicEmployee(emp));
});

app.put("/api/employees/:id", ownerOnly, async (req, res) => {
  const i = db.employees.findIndex((e) => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "স্টাফ পাওয়া যায়নি" });
  const emp = db.employees[i];

  if (req.body?.role === "owner" || req.body?.role === "staff") emp.role = req.body.role;
  if (req.body?.active === true || req.body?.active === false) emp.active = req.body.active;
  if (req.body?.password) {
    if (String(req.body.password).length < 4)
      return res.status(400).json({ error: "পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে" });
    emp.password_hash = hashPassword(String(req.body.password));
  }
  // never allow the last active owner to be removed
  if (emp.role === "owner" && emp.active === false) {
    const owners = db.employees.filter((e) => e.role === "owner" && e.active !== false);
    if (owners.length <= 1)
      return res.status(400).json({ error: "শেষ মালিককে নিষ্ক্রিয় করা যাবে না" });
  }

  await saveDB();
  broadcast("employees", { action: "update", row: publicEmployee(emp) });
  res.json(publicEmployee(emp));
});

app.delete("/api/employees/:id", ownerOnly, async (req, res) => {
  const i = db.employees.findIndex((e) => e.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: "স্টাফ পাওয়া যায়নি" });
  const emp = db.employees[i];

  if (emp.username === req.user.username)
    return res.status(400).json({ error: "নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না" });
  if (emp.role === "owner") {
    const owners = db.employees.filter((e) => e.role === "owner" && e.active !== false);
    if (owners.length <= 1)
      return res.status(400).json({ error: "শেষ মালিককে মুছে ফেলা যাবে না" });
  }

  db.employees.splice(i, 1);
  await saveDB();
  broadcast("employees", { action: "delete", row: publicEmployee(emp) });
  res.json({ ok: true });
});

/* =============================================================
   INVOICES
   ============================================================= */

// GET /api/invoices?date=YYYY-MM-DD&seller=username
app.get("/api/invoices", authRequired, (req, res) => {
  const { date, seller } = req.query;

  // staff may only ever read their own invoices
  const effectiveSeller = req.user.role === "owner" ? seller : req.user.username;

  let rows = db.invoices;
  if (date) rows = rows.filter((r) => r.date_disp === date);
  if (effectiveSeller) rows = rows.filter((r) => r.seller === effectiveSeller);

  rows = rows
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 500);

  res.json(rows);
});

// GET /api/invoices/:no  (invoice + items)
app.get("/api/invoices/:no", authRequired, (req, res) => {
  const inv = db.invoices.find((r) => r.invoice_no === req.params.no);
  if (!inv) return res.status(404).json({ error: "বিল পাওয়া যায়নি" });
  if (req.user.role !== "owner" && inv.seller !== req.user.username)
    return res.status(403).json({ error: "এই বিলটি আপনার নয়" });

  const items = db.invoice_items
    .filter((i) => i.invoice_no === inv.invoice_no)
    .sort((a, b) => a.seq - b.seq);

  res.json({ invoice: inv, items });
});

// POST /api/invoices  { customer, paid, lines:[{item,size,qty,price}] }
app.post("/api/invoices", authRequired, async (req, res) => {
  const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
  if (!lines.length) return res.status(400).json({ error: "কার্ট খালি" });

  // validate + compute server-side (never trust client totals)
  const clean = lines
    .map((l) => ({
      item: String(l.item || "").trim().slice(0, 120),
      size: String(l.size || "").trim().slice(0, 10),
      qty: Math.max(1, Math.round(Number(l.qty) || 1)),
      price: Math.max(0, Math.round((Number(l.price) || 0) * 100) / 100),
    }))
    .filter((l) => l.item);

  if (!clean.length) return res.status(400).json({ error: "কার্ট খালি" });

  const total = Math.round(clean.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
  const paid = Math.max(0, Math.round((Number(req.body?.paid) || 0) * 100) / 100);
  const change = Math.round((paid - total) * 100) / 100;

  const now = new Date();
  const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}-`;

  // next counter for today
  let max = 0;
  for (const r of db.invoices) {
    if (String(r.invoice_no).startsWith(prefix)) {
      const n = parseInt(String(r.invoice_no).slice(prefix.length), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  const invoice_no = prefix + String(max + 1).padStart(3, "0");

  const inv = {
    invoice_no,
    date_disp: todayStr(now),
    time_disp: nowTime(now),
    customer: String(req.body?.customer || "Walk-in Customer").trim().slice(0, 120) || "Walk-in Customer",
    seller: req.user.username, // always the logged-in user, never the client
    total,
    paid,
    change,
    created_at: now.toISOString(),
  };

  const items = clean.map((l, i) => ({ id: newId(), invoice_no, seq: i, ...l }));

  db.invoices.push(inv);
  db.invoice_items.push(...items);
  await saveDB();

  res.status(201).json({ invoice: inv, items });
});

// GET /api/stats/today  (owner: shop-wide totals; staff: own)
app.get("/api/stats/today", authRequired, (req, res) => {
  const t = todayStr();
  const rows = db.invoices.filter(
    (r) => r.date_disp === t && (req.user.role === "owner" || r.seller === req.user.username)
  );
  res.json({
    date: t,
    count: rows.length,
    total: Math.round(rows.reduce((s, r) => s + Number(r.total || 0), 0) * 100) / 100,
    bySeller: Object.entries(
      rows.reduce((acc, r) => {
        acc[r.seller] = (acc[r.seller] || 0) + Number(r.total || 0);
        return acc;
      }, {})
    ).map(([seller, total]) => ({ seller, total: Math.round(total * 100) / 100 })),
  });
});

/* =============================================================
   LIVE UPDATES (SSE)
   ============================================================= */

app.get("/api/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();
  res.write(`retry: 3000\n\n`);
  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);
  sseClients.add(res);

  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (e) {
      clearInterval(ping);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    sseClients.delete(res);
  });
});

/* =============================================================
   BACKUP / RESTORE (owner) — handy for safety
   ============================================================= */

app.get("/api/backup", ownerOnly, (_req, res) => {
  res.setHeader("Content-Disposition", `attachment; filename="lfj-backup-${todayStr()}.json"`);
  res.json(db);
});

app.post("/api/restore", ownerOnly, async (req, res) => {
  const incoming = req.body;
  if (!incoming || !Array.isArray(incoming.products) || !Array.isArray(incoming.employees))
    return res.status(400).json({ error: "ফাইলটি বৈধ ব্যাকআপ নয়" });

  db = {
    meta: { version: 1, restored: new Date().toISOString() },
    settings: { ...defaultDB().settings, ...(incoming.settings || {}) },
    employees: incoming.employees,
    products: incoming.products,
    invoices: incoming.invoices || [],
    invoice_items: incoming.invoice_items || [],
  };
  await saveDB();
  broadcast("products", { action: "reload" });
  broadcast("employees", { action: "reload" });
  res.json({ ok: true });
});

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    products: db.products.length,
    employees: db.employees.length,
    invoices: db.invoices.length,
    time: new Date().toISOString(),
  })
);

/* =============================================================
   STATIC FILES
   ============================================================= */
app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

// catch-all (works on both Express 4 and 5)
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

/* ---------------- BOOT ---------------- */
loadDB();

const server = app.listen(PORT, () => {
  console.log(`\n  🥤  Live Fruit Juice`);
  console.log(`  ➜   http://localhost:${PORT}`);
  console.log(`  ➜   database: ${DB_FILE}`);
  console.log(`  ➜   owner login: owner / owner123\n`);
});

function shutdown() {
  console.log("\n[server] shutting down, saving...");
  saveDB().then(() => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = app;
