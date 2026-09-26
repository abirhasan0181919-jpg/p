/* ==========================================================
   Live Fruit Juice — Store
   The whole database is ONE JSON object kept in the browser.
   No server. No external service.
   ========================================================== */

(function (global) {
  "use strict";

  const KEY = "lfj_db_v1";
  const SALT = "livefruitjuice_salt_";
  const SESSION_KEY = "lfj_session_v1";

  /* ---------- SHA-256 (sync, works on file:// too) ---------- */
  function utf8(str) {
    return unescape(encodeURIComponent(String(str)));
  }

  function sha256(str) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const maxWord = Math.pow(2, 32);
    const L = "length";
    let i, j, result = "";
    const words = [];
    const ascii = utf8(str);
    const bitLen = ascii[L] * 8;

    const hash = [], k = [];
    let prime = 0;
    const composite = {};
    for (let c = 2; prime < 64; c++) {
      if (!composite[c]) {
        for (i = 0; i < 313; i += c) composite[i] = c;
        hash[prime] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[prime++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }

    const bytes = ascii + "\x80";
    let padded = bytes;
    while (padded[L] % 64 - 56) padded += "\x00";

    for (i = 0; i < padded[L]; i++) {
      const code = padded.charCodeAt(i);
      if (code >> 8) throw new Error("sha256: invalid input");
      words[i >> 2] |= code << ((3 - i) % 4) * 8;
    }
    words[words[L]] = (bitLen / maxWord) | 0;
    words[words[L]] = bitLen;

    for (j = 0; j < words[L];) {
      const w = words.slice(j, (j += 16));
      const oldHash = hash.slice(0);
      hash.length = 8;

      for (i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2];
        const a = hash[0], e = hash[4];
        const t1 =
          hash[7] +
          (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) +
          ((e & hash[5]) ^ (~e & hash[6])) +
          k[i] +
          (w[i] =
            i < 16
              ? w[i]
              : (w[i - 16] +
                  (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) +
                  w[i - 7] +
                  (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash.unshift((t1 + t2) | 0);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }

    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        const b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }

  const hashPassword = (pw) => sha256(SALT + pw).toLowerCase();

  /* ---------- helpers ---------- */
  const uid = () =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

  const p2 = (n) => String(n).padStart(2, "0");
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const nowTime = (d = new Date()) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

  const DEFAULT_SETTINGS = {
    shop_name: "Live Fruit Juice",
    shop_address: "",
    shop_phone: "",
    auto_print: true,
    show_thankyou: true,
  };

  function freshDB() {
    return {
      version: 1,
      created_at: new Date().toISOString(),
      settings: { ...DEFAULT_SETTINGS },
      employees: [
        {
          id: uid(),
          username: "owner",
          password_hash: hashPassword("owner123"),
          role: "owner",
          active: true,
          created_at: new Date().toISOString(),
        },
      ],
      products: [
        { id: uid(), name: "আপেল জুস", price_s: 50, price_m: 80, price_l: 120 },
        { id: uid(), name: "কলা জুস", price_s: 60, price_m: 90, price_l: 130 },
        { id: uid(), name: "আরবুজ মিশ্র জুস", price_s: 70, price_m: 100, price_l: 150 },
        { id: uid(), name: "পেয়ারা জুস", price_s: 65, price_m: 95, price_l: 140 },
        { id: uid(), name: "অ্যানারস জুস", price_s: 80, price_m: 120, price_l: 170 },
        { id: uid(), name: "পান্তা লেমন জুস", price_s: 40, price_m: 60, price_l: 90 },
      ],
      invoices: [],
      invoice_items: [],
    };
  }

  /* ---------- validation for imported files ---------- */
  function normalise(obj, strict) {
    if (!obj || typeof obj !== "object") throw new Error("ফাইলটি বৈধ নয়");

    // when importing a backup we refuse anything that is not really a backup,
    // otherwise a wrong file would silently wipe the shop's data
    if (strict) {
      if (!Array.isArray(obj.employees)) throw new Error("ফাইলে স্টাফের তালিকা নেই — সম্ভবত সঠিক ব্যাকআপ নয়");
      if (!obj.employees.length) throw new Error("ফাইলে কোনো স্টাফ নেই");
      const bad = obj.employees.find((e) => !e || !e.username || !e.password_hash);
      if (bad) throw new Error("ফাইলের স্টাফ তথ্য অসম্পূর্ণ");
    }

    const out = freshDB();
    out.version = 1;
    // a restore should be a true restore, so keep the original creation time
    if (obj.created_at) out.created_at = String(obj.created_at);
    if (obj.settings && typeof obj.settings === "object")
      out.settings = { ...DEFAULT_SETTINGS, ...pickStrings(obj.settings) };
    if (Array.isArray(obj.employees) && obj.employees.length)
      out.employees = obj.employees
        .filter((e) => e && e.username && e.password_hash)
        .map((e) => ({
          id: e.id || uid(),
          username: String(e.username).slice(0, 40),
          password_hash: String(e.password_hash).toLowerCase(),
          role: e.role === "owner" ? "owner" : "staff",
          active: e.active !== false,
          created_at: e.created_at || new Date().toISOString(),
        }));
    if (Array.isArray(obj.products))
      out.products = obj.products
        .filter((p) => p && p.name)
        .map((p) => ({
          id: p.id || uid(),
          name: String(p.name).slice(0, 120),
          price_s: nonNeg(p.price_s),
          price_m: nonNeg(p.price_m),
          price_l: nonNeg(p.price_l),
          updated_at: p.updated_at || new Date().toISOString(),
        }));
    if (Array.isArray(obj.invoices))
      out.invoices = obj.invoices
        .filter((r) => r && r.invoice_no)
        .map((r) => ({
          invoice_no: String(r.invoice_no),
          date_disp: String(r.date_disp || ""),
          time_disp: String(r.time_disp || ""),
          customer: String(r.customer || "Walk-in Customer").slice(0, 120),
          seller: String(r.seller || ""),
          total: nonNeg(r.total),
          paid: nonNeg(r.paid),
          change: num(r.change),
          created_at: r.created_at || new Date().toISOString(),
        }));
    if (Array.isArray(obj.invoice_items))
      out.invoice_items = obj.invoice_items
        .filter((i) => i && i.invoice_no)
        .map((i, idx) => ({
          id: i.id || uid(),
          invoice_no: String(i.invoice_no),
          seq: typeof i.seq === "number" ? i.seq : idx,
          item: String(i.item || "").slice(0, 120),
          size: String(i.size || "").slice(0, 10),
          qty: nonNeg(i.qty) || 1,
          price: nonNeg(i.price),
        }));

    if (!out.employees.length) throw new Error("ফাইলে কোনো স্টাফ নেই");
    return out;
  }

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  /** prices and quantities can never be negative */
  function nonNeg(v) {
    return Math.max(0, num(v));
  }
  function pickStrings(o) {
    const r = {};
    ["shop_name", "shop_address", "shop_phone"].forEach((k) => {
      if (typeof o[k] === "string") r[k] = o[k];
    });
    if (typeof o.auto_print === "boolean") r.auto_print = o.auto_print;
    if (typeof o.show_thankyou === "boolean") r.show_thankyou = o.show_thankyou;
    return r;
  }

  /* ---------- the store ---------- */
  let db = null;
  const listeners = new Set();

  function notify(reason) {
    listeners.forEach((fn) => {
      try { fn(reason); } catch (e) { console.error(e); }
    });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try {
        db = normalise(JSON.parse(raw));
      } catch (e) {
        console.error("ডেটা পড়া যায়নি, নতুন করে শুরু:", e);
        db = freshDB();
      }
    } else {
      db = freshDB();
      persist();
    }
    return db;
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      console.error("সেভ করা যায়নি", e);
      const quota = e && /quota|exceed/i.test(e.name + e.message);
      throw new Error(
        quota
          ? "স্টোরেজ পূর্ণ — পুরনো বিল ডিউলেট করুন বা ব্যাকআপ ফাইল নিন"
          : "সেভ করা যায়নি (ব্রাউজারের স্টোরেজ বন্ধ থাকতে পারে)"
      );
    }
  }

  /** read-only accessor */
  const get = () => db || load();

  function commit(reason) {
    persist();
    notify(reason || "change");
    // keep other tabs of the same device in sync
    try {
      if (global.BroadcastChannel) {
        if (!global.__lfjBC) global.__lfjBC = new BroadcastChannel("lfj-db");
        global.__lfjBC.postMessage({ reason });
      }
    } catch (e) {}
  }

  /* ---------- auth ---------- */
  function login(username, password) {
    const u = String(username || "").trim();
    if (!u || !password) return null;
    const emp = get().employees.find(
      (e) => e.username.toLowerCase() === u.toLowerCase() && e.active !== false
    );
    if (!emp) return null;
    if (emp.password_hash.toLowerCase() !== hashPassword(password)) return null;
    return { username: emp.username, role: emp.role === "owner" ? "owner" : "staff" };
  }

  function saveSession(user) {
    try {
      if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }
  function readSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (s && s.username) {
        const emp = get().employees.find((e) => e.username === s.username && e.active !== false);
        // if the account was deleted/disabled, the session is dead
        if (!emp) { saveSession(null); return null; }
        return { username: emp.username, role: emp.role === "owner" ? "owner" : "staff" };
      }
    } catch (e) {}
    return null;
  }

  /* ---------- products ---------- */
  function products() {
    return get().products.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "bn"));
  }
  const priceFor = (p, s) => Number(p["price_" + String(s).toLowerCase()] || 0) || 0;

  function sanitiseProduct(body, id) {
    const name = String(body.name || "").trim().slice(0, 120);
    if (!name) throw new Error("পণ্যের নাম লিখুন");
    return {
      id: id || uid(),
      name,
      price_s: nonNeg(body.price_s),
      price_m: nonNeg(body.price_m),
      price_l: nonNeg(body.price_l),
      updated_at: new Date().toISOString(),
    };
  }

  function addProduct(body) {
    const p = sanitiseProduct(body);
    get().products.push(p);
    commit("products");
    return p;
  }
  function updateProduct(id, body) {
    const i = get().products.findIndex((p) => p.id === id);
    if (i < 0) throw new Error("পণ্য পাওয়া যায়নি");
    get().products[i] = { ...get().products[i], ...sanitiseProduct(body, id) };
    commit("products");
    return get().products[i];
  }
  function deleteProduct(id) {
    const d = get();
    const i = d.products.findIndex((p) => p.id === id);
    if (i < 0) throw new Error("পণ্য পাওয়া যায়নি");
    d.products.splice(i, 1);
    commit("products");
  }

  /* ---------- employees ---------- */
  const publicEmployee = (e) => ({
    id: e.id, username: e.username, role: e.role, active: e.active !== false, created_at: e.created_at,
  });

  function employees() {
    return get().employees.map(publicEmployee);
  }

  function addEmployee(body) {
    const username = String(body.username || "").trim().slice(0, 40);
    const password = String(body.password || "");
    if (!username) throw new Error("ইউজারনেম লিখুন");
    if (password.length < 4) throw new Error("পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে");
    if (get().employees.some((e) => e.username.toLowerCase() === username.toLowerCase()))
      throw new Error("এই ইউজারনেম আগে থেকেই আছে");
    const e = {
      id: uid(), username, password_hash: hashPassword(password),
      role: body.role === "owner" ? "owner" : "staff", active: true,
      created_at: new Date().toISOString(),
    };
    get().employees.push(e);
    commit("employees");
    return publicEmployee(e);
  }

  function updateEmployee(id, body) {
    const d = get();
    const i = d.employees.findIndex((e) => e.id === id);
    if (i < 0) throw new Error("স্টাফ পাওয়া যায়নি");
    const e = d.employees[i];
    if (body.role === "owner" || body.role === "staff") e.role = body.role;
    if (typeof body.active === "boolean") e.active = body.active;
    if (body.password) {
      if (String(body.password).length < 4) throw new Error("পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে");
      e.password_hash = hashPassword(String(body.password));
    }
    if (e.role === "owner" && e.active === false) {
      const owners = d.employees.filter((x) => x.role === "owner" && x.active !== false);
      if (owners.length <= 1) throw new Error("শেষ মালিককে নিষ্ক্রিয় করা যাবে না");
    }
    commit("employees");
    return publicEmployee(e);
  }

  function deleteEmployee(id, currentUsername) {
    const d = get();
    const i = d.employees.findIndex((e) => e.id === id);
    if (i < 0) throw new Error("স্টাফ পাওয়া যায়নি");
    const e = d.employees[i];
    if (e.username === currentUsername) throw new Error("নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না");
    if (e.role === "owner") {
      const owners = d.employees.filter((x) => x.role === "owner" && x.active !== false);
      if (owners.length <= 1) throw new Error("শেষ মালিককে মুছে ফেলা যাবে না");
    }
    d.employees.splice(i, 1);
    commit("employees");
  }

  /* ---------- invoices ---------- */
  function nextInvoiceNo() {
    const now = new Date();
    const prefix = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-`;
    let max = 0;
    for (const r of get().invoices) {
      if (String(r.invoice_no).startsWith(prefix)) {
        const n = parseInt(String(r.invoice_no).slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    return prefix + String(max + 1).padStart(3, "0");
  }

  function createInvoice(body, sellerUsername) {
    const lines = (Array.isArray(body.lines) ? body.lines : [])
      .map((l) => ({
        item: String(l.item || "").trim().slice(0, 120),
        size: String(l.size || "").trim().slice(0, 10),
        qty: Math.max(1, Math.round(num(l.qty) || 1)),
        price: Math.max(0, num(l.price)),
      }))
      .filter((l) => l.item);
    if (!lines.length) throw new Error("কার্ট খালি");

    const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
    const paid = Math.max(0, num(body.paid));
    const change = Math.round((paid - total) * 100) / 100;

    const now = new Date();
    const invoice_no = nextInvoiceNo();
    const invoice = {
      invoice_no,
      date_disp: todayStr(now),
      time_disp: nowTime(now),
      customer: String(body.customer || "Walk-in Customer").trim().slice(0, 120) || "Walk-in Customer",
      seller: sellerUsername, // always the logged-in user
      total, paid, change,
      created_at: now.toISOString(),
    };
    const items = lines.map((l, i) => ({ id: uid(), invoice_no, seq: i, ...l }));

    const d = get();
    d.invoices.push(invoice);
    d.invoice_items.push(...items);
    commit("invoices");
    return { invoice, items };
  }

  /** staff -> own bills only; owner -> everything (optional seller filter) */
  function invoices({ date, seller, username, role } = {}) {
    let rows = get().invoices;
    const effSeller = role === "owner" ? seller : username;
    if (date) rows = rows.filter((r) => r.date_disp === date);
    if (effSeller) rows = rows.filter((r) => r.seller === effSeller);
    return rows.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 500);
  }

  function invoiceWithItems(invoiceNo, username, role) {
    const inv = get().invoices.find((r) => r.invoice_no === invoiceNo);
    if (!inv) throw new Error("বিল পাওয়া যায়নি");
    if (role !== "owner" && inv.seller !== username) throw new Error("এই বিলটি আপনার নয়");
    const items = get().invoice_items.filter((i) => i.invoice_no === invoiceNo).sort((a, b) => a.seq - b.seq);
    return { invoice: inv, items };
  }

  function deleteInvoice(invoiceNo) {
    const d = get();
    const i = d.invoices.findIndex((r) => r.invoice_no === invoiceNo);
    if (i < 0) throw new Error("বিল পাওয়া যায়নি");
    d.invoices.splice(i, 1);
    for (let k = d.invoice_items.length - 1; k >= 0; k--)
      if (d.invoice_items[k].invoice_no === invoiceNo) d.invoice_items.splice(k, 1);
    commit("invoices");
  }

  function statsToday({ username, role } = {}) {
    const t = todayStr();
    const rows = get().invoices.filter((r) => r.date_disp === t && (role === "owner" || r.seller === username));
    return {
      date: t,
      count: rows.length,
      total: Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100,
    };
  }

  /* ---------- settings ---------- */
  const settings = () => ({ ...DEFAULT_SETTINGS, ...get().settings });

  function saveSettings(body) {
    get().settings = { ...DEFAULT_SETTINGS, ...pickStrings(body) };
    commit("settings");
    return settings();
  }

  /* ---------- backup / restore / reset ---------- */
  function exportJSON() {
    return JSON.stringify(get(), null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    const next = normalise(parsed, true);
    if (!confirm(
      `ফাইলে ${next.employees.length} জন স্টাফ, ${next.products.length}টি পণ্য, ${next.invoices.length}টি বিল আছে।\n` +
      "বর্তমান সব ডেটা মুছে যাবে। চালিয়ে যাবেন?"
    )) return false;
    db = next;
    commit("restore");
    return true;
  }

  function resetAll() {
    if (!confirm("সব ডেটা মুছে যাবে — পণ্য, স্টাফ, বিল সবকিছু। নিশ্চিত?")) return false;
    db = freshDB();
    saveSession(null);
    commit("reset");
    return true;
  }

  function usageBytes() {
    try { return new Blob([localStorage.getItem(KEY) || ""]).size; } catch (e) { return 0; }
  }

  global.Store = {
    KEY, SESSION_KEY, uid, todayStr, nowTime, num,
    sha256, hashPassword,
    load, get, onChange, usageBytes,
    login, saveSession, readSession,
    products, priceFor, addProduct, updateProduct, deleteProduct,
    employees, addEmployee, updateEmployee, deleteEmployee,
    createInvoice, invoices, invoiceWithItems, deleteInvoice, statsToday, nextInvoiceNo,
    settings, saveSettings,
    exportJSON, importJSON, resetAll,
    DEFAULT_SETTINGS,
  };
})(typeof window !== "undefined" ? window : this);
