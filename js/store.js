/* ==========================================================
   Live Fruit Juice — Store (server backed)
   ------------------------------------------------------------
   The shop's real data lives on the server (Vercel KV). This file
   keeps a mirror of it in memory and a copy in localStorage so the
   screen paints instantly and stays readable if the network drops.

     server  = the truth (every bill, price and password)
     memory  = what the UI renders
     localStorage = cache + the queue of bills not yet uploaded

   Bills are the one thing that may be recorded while offline, so a
   dead connection never stops the till. Each queued bill carries a
   client_id, which makes the upload idempotent: retrying can never
   create the same sale twice.
   ========================================================== */

(function (global) {
  "use strict";

  const API = global.API;

  const KEY = "lfj_cache_v1";         // cached mirror of the server data
  const QUEUE_KEY = "lfj_queue_v1";   // bills taken while offline
  const TEMP_KEY = "lfj_temp_seq_v1"; // counter for provisional bill numbers
  const SESSION_KEY = "lfj_session_v1"; // hint only; the cookie is the truth
  const MARK_KEY = "lfj_last_export_v1";
  const LEGACY_KEY = "lfj_db_v1";     // data from the old local-only version
  const MIGRATED_KEY = "lfj_migrated_v1";

  const SNAP_KEY = "lfj_snapshots_v1";
  const MAX_SNAPSHOTS = 5;
  const SNAPSHOT_MIN_INTERVAL = 60 * 1000;
  const MAX_TOTAL_BACKUP_BYTES = 2 * 1024 * 1024;

  const MAX_QUEUE = 500; // a hard stop so a long outage cannot eat the storage

  /* ---------- small helpers ---------- */

  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  const p2 = (n) => String(n).padStart(2, "0");
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const nowTime = (d = new Date()) => `${p2(d.getHours())}:${p2(d.getMinutes())}`;

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  const nonNeg = (v) => Math.max(0, num(v));

  const DEFAULT_SETTINGS = {
    shop_name: "Live Fruit Juice",
    shop_address: "",
    shop_phone: "",
    auto_print: true,
    show_thankyou: true,
  };

  /* ---------- state ---------- */

  let db = null;
  let user = null;            // {username, role} — from the server
  let online = true;
  let syncing = false;
  let lastSyncError = null;
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

  function emptyDB() {
    return {
      version: 2,
      created_at: new Date().toISOString(),
      settings: { ...DEFAULT_SETTINGS },
      employees: [],
      products: [],
      invoices: [],
      invoice_items: [],
    };
  }

  /** turn a server payload into the flat shape the UI already uses */
  function hydrate(payload) {
    const next = emptyDB();
    next.settings = { ...DEFAULT_SETTINGS, ...(payload.settings || {}) };
    next.products = Array.isArray(payload.products) ? payload.products : [];
    next.employees = Array.isArray(payload.staff) ? payload.staff : [];
    for (const inv of payload.invoices || []) {
      next.invoices.push({
        invoice_no: inv.invoice_no,
        date_disp: inv.date_disp,
        time_disp: inv.time_disp,
        customer: inv.customer,
        seller: inv.seller,
        total: nonNeg(inv.total),
        paid: nonNeg(inv.paid),
        change: num(inv.change),
        created_at: inv.created_at,
        pending: false,
      });
      for (const it of inv.items || []) {
        next.invoice_items.push({
          id: it.id || uid(),
          invoice_no: inv.invoice_no,
          seq: it.seq || 0,
          item: it.item,
          size: it.size,
          qty: it.qty,
          price: nonNeg(it.price),
        });
      }
    }
    return next;
  }

  /**
   * The cache is written in exactly the same shape the server sends, so what is
   * read back is hydrated by the same code path — one shape, no surprises.
   * Bills still waiting to be uploaded are left out: the queue owns them, and
   * keeping them here too would list every pending bill twice.
   */
  function toCache() {
    const queued = new Set(readQueue().map((e) => e.invoice_no));
    const byNo = new Map();
    for (const it of db.invoice_items || []) {
      if (!byNo.has(it.invoice_no)) byNo.set(it.invoice_no, []);
      byNo.get(it.invoice_no).push({
        seq: it.seq, item: it.item, size: it.size, qty: it.qty, price: it.price,
      });
    }
    return {
      settings: db.settings,
      products: db.products,
      staff: db.employees,
      invoices: (db.invoices || [])
        .filter((inv) => !inv.pending && !queued.has(inv.invoice_no))
        .map((inv) => ({ ...inv, items: byNo.get(inv.invoice_no) || [] })),
    };
  }

  function persist() {
    if (!db) return true;
    try {
      localStorage.setItem(KEY, JSON.stringify(toCache()));
      return true;
    } catch (e) {
      const quota = e && /quota|exceed/i.test(e.name + e.message);
      if (quota) {
        // the cache is disposable — the server has the real data
        try { localStorage.removeItem(KEY); } catch (e2) {}
        return false;
      }
      return false;
    }
  }

  /* ---------- offline queue ---------- */

  function readQueue() {
    try {
      const arr = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeQueue(list) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));
      return true;
    } catch (e) {
      // out of room: keep the cache small so the queue survives
      try { localStorage.removeItem(KEY); } catch (e2) {}
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-50))); return true; }
      catch (e2) { return false; }
    }
  }

  const pendingCount = () => readQueue().length;
  const isOnline = () => online;
  const statusError = () => lastSyncError;

  function setOnline(v) {
    if (online === v) return;
    online = v;
    notify("connection");
  }

  /* ---------- loading ---------- */

  /** paint from the cache straight away; the server refresh follows */
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    try {
      db = raw ? hydrate(JSON.parse(raw)) : emptyDB();
    } catch (e) {
      db = emptyDB();
    }
    mergeQueue();
    return db;
  }

  const get = () => db || load();

  /** queued bills are shown alongside the server's, flagged as not yet uploaded */
  function mergeQueue() {
    if (!db) return;
    const have = new Set(db.invoices.map((i) => i.invoice_no));
    for (const entry of readQueue()) {
      if (have.has(entry.invoice_no)) continue;
      db.invoices.push(entry.invoice);
      for (const it of entry.invoice.items || []) {
        db.invoice_items.push({ id: it.id || uid(), invoice_no: entry.invoice_no, seq: it.seq, ...it });
      }
    }
  }

  /** queue entries look like {client_id, invoice:{invoice_no,...}, at} */
  function dropFromQueue(invoiceNo) {
    writeQueue(readQueue().filter((e) => e.invoice.invoice_no !== invoiceNo));
  }

  /**
   * Push every queued bill to the server, oldest first.
   * Each carries its client_id, so a bill that actually arrived before the
   * connection dropped is recognised and not stored twice.
   */
  async function flushQueue() {
    const queue = readQueue();
    if (!queue.length) return { sent: 0, failed: 0 };

    let sent = 0, failed = 0;
    const keep = [];
    for (const entry of queue) {
      try {
        const saved = await API.createInvoice({
          customer: entry.invoice.customer,
          paid: entry.invoice.paid,
          client_id: entry.client_id,
          lines: entry.invoice.items.map((it) => ({
            item: it.item, size: it.size, qty: it.qty, price: it.price,
          })),
        });
        sent++;
        // swap the provisional number for the real one
        replaceInvoice(entry.invoice.invoice_no, saved);
        dropFromQueue(entry.invoice.invoice_no);
      } catch (e) {
        if (e && e.offline) {
          failed++;
          keep.push(entry);   // still no connection, try again later
        } else {
          // the server refused it for good (bad product, no permission...)
          failed++;
          dropFromQueue(entry.invoice.invoice_no);
          console.error("[store] queued bill rejected", entry.invoice.invoice_no, e.message);
        }
      }
    }
    if (keep.length) writeQueue(keep);
    else writeQueue([]);
    if (sent) {
      setOnline(true);
      takeSnapshot("sync", true);
      notify("invoices");
    }
    return { sent, failed };
  }

  function replaceInvoice(oldNo, saved) {
    if (!db) return;
    db.invoice_items = db.invoice_items.filter((i) => i.invoice_no !== oldNo);
    db.invoices = db.invoices.filter((i) => i.invoice_no !== oldNo);
    db.invoices.push({
      invoice_no: saved.invoice_no,
      date_disp: saved.date_disp,
      time_disp: saved.time_disp,
      customer: saved.customer,
      seller: saved.seller,
      total: nonNeg(saved.total),
      paid: nonNeg(saved.paid),
      change: num(saved.change),
      created_at: saved.created_at,
      pending: false,
    });
    for (const it of saved.items || []) {
      db.invoice_items.push({
        id: it.id || uid(), invoice_no: saved.invoice_no, seq: it.seq,
        item: it.item, size: it.size, qty: it.qty, price: nonNeg(it.price),
      });
    }
    persist();
  }

  /* ---------- auth ---------- */

  /** ask the server who we are; the cookie decides, not local storage */
  async function me() {
    try {
      const res = await API.me();
      user = res && res.user ? res.user : null;
      setOnline(true);
      lastSyncError = null;
    } catch (e) {
      if (e && e.offline) {
        setOnline(false);
        // offline: keep whoever we were, the server will confirm later
        user = user || readSession();
      } else {
        user = null;
        lastSyncError = e.message;
      }
    }
    if (user) await sync();
    return user;
  }

  async function login(username, password) {
    const res = await API.login(username, password); // throws with a real message
    user = res.user;
    setOnline(true);
    lastSyncError = null;
    saveSession(user);
    await sync();
    return user;
  }

  async function logout() {
    try { await API.logout(); } catch (e) { /* the cookie dies server-side anyway */ }
    user = null;
    saveSession(null);
    db = null;
    notify("logout");
  }

  /** a local hint only — never trusted for permissions */
  function saveSession(u) {
    try {
      if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }
  function readSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return s && s.username ? { username: s.username, role: s.role } : null;
    } catch (e) { return null; }
  }

  /* ---------- sync ---------- */

  async function sync() {
    if (syncing) return db;
    syncing = true;
    try {
      await flushQueue();
      const payload = await API.bootstrap(todayStr());
      db = hydrate(payload);
      user = payload.user || user;
      mergeQueue();
      persist();
      setOnline(true);
      lastSyncError = null;
      notify("sync");
    } catch (e) {
      if (e && e.offline) {
        setOnline(false);
        lastSyncError = e.message;
      } else {
        // the server answered, but said no: the session is dead or broken
        lastSyncError = e.message;
        if (e.status === 401) { user = null; saveSession(null); }
        notify("error");
      }
    } finally {
      syncing = false;
    }
    return db;
  }

  /* ---------- products ---------- */

  function products() {
    return get().products.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), "bn"));
  }
  const priceFor = (p, s) => Number(p["price_" + String(s).toLowerCase()] || 0) || 0;

  function localProduct(body, id) {
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

  async function addProduct(body) {
    const res = await API.saveProducts("POST", localProduct(body));
    db.products.push(res.product);
    commit("products");
    return res.product;
  }
  async function updateProduct(id, body) {
    const res = await API.saveProducts("PUT", localProduct(body, id));
    const i = db.products.findIndex((p) => p.id === id);
    if (i >= 0) db.products[i] = res.product;
    commit("products");
    return res.product;
  }
  async function deleteProduct(id) {
    await API.deleteProduct(id);
    db.products = db.products.filter((p) => p.id !== id);
    commit("products");
  }

  /* ---------- staff ---------- */

  const publicEmployee = (e) => ({
    id: e.id, username: e.username, role: e.role, active: e.active !== false, created_at: e.created_at,
  });
  const employees = () => get().employees.map(publicEmployee);

  async function addEmployee(body) {
    const res = await API.saveStaff("POST", {
      username: String(body.username || "").trim().slice(0, 40),
      password: String(body.password || ""),
      role: body.role === "owner" ? "owner" : "staff",
    });
    db.employees.push(res.employee);
    commit("employees");
    return res.employee;
  }
  async function updateEmployee(id, body) {
    const payload = { id };
    if (body.username !== undefined) payload.username = String(body.username).trim().slice(0, 40);
    if (body.password) payload.password = String(body.password);
    if (body.active !== undefined) payload.active = Boolean(body.active);
    const res = await API.saveStaff("PUT", payload);
    const i = db.employees.findIndex((e) => e.id === id);
    if (i >= 0) db.employees[i] = { ...db.employees[i], ...res.employee };
    commit("employees");
    return res.employee;
  }
  async function deleteEmployee(id, currentUsername) {
    const target = db.employees.find((e) => e.id === id);
    if (target && target.username === currentUsername) {
      throw new Error("নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না");
    }
    await API.deleteStaff(id);
    db.employees = db.employees.filter((e) => e.id !== id);
    commit("employees");
  }

  /* ---------- invoices ---------- */

  function sanitiseLines(lines) {
    const out = (Array.isArray(lines) ? lines : [])
      .map((l) => ({
        item: String(l.item || "").trim().slice(0, 120),
        size: String(l.size || "").trim().slice(0, 10),
        qty: Math.max(1, Math.round(num(l.qty) || 1)),
        price: nonNeg(l.price),
      }))
      .filter((l) => l.item);
    if (!out.length) throw new Error("কার্ট খালি");
    return out;
  }

  /**
   * Record a sale. Goes to the server when possible; if the connection is
   * down the bill is queued locally and given a provisional number so the
   * customer can still be served and a receipt printed.
   */
  /**
   * A number for a bill that has not reached the server yet. It only has to be
   * unique on this device and must never be reused, because the receipt is
   * already in the customer's hand. A counter is used rather than the queue
   * length, so two sales in the same instant cannot land on the same number.
   */
  function nextTempNo() {
    let n = 0;
    try { n = Number(localStorage.getItem(TEMP_KEY)) || 0; } catch (e) {}
    n += 1;
    try { localStorage.setItem(TEMP_KEY, String(n)); } catch (e) {}
    return `TEMP-${String(n).padStart(3, "0")}`;
  }

  async function createInvoice(body) {
    const lines = sanitiseLines(body && body.lines);
    const client_id = uid();
    const customer = String((body && body.customer) || "Walk-in Customer").trim().slice(0, 120) || "Walk-in Customer";
    const paid = nonNeg(body && body.paid);
    const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
    const change = Math.round((paid - total) * 100) / 100;

    try {
      const saved = await API.createInvoice({ customer, paid, client_id, lines });
      setOnline(true);
      const invoice = {
        invoice_no: saved.invoice_no,
        date_disp: saved.date_disp,
        time_disp: saved.time_disp,
        customer: saved.customer,
        seller: saved.seller,
        total: nonNeg(saved.total),
        paid: nonNeg(saved.paid),
        change: num(saved.change),
        created_at: saved.created_at,
        pending: false,
      };
      const items = (saved.items || []).map((it, i) => ({
        id: it.id || uid(), invoice_no: saved.invoice_no, seq: i,
        item: it.item, size: it.size, qty: it.qty, price: nonNeg(it.price),
      }));
      db.invoices.push(invoice);
      db.invoice_items.push(...items);
      // bills are what people miss most, so always snapshot
      commit("invoices", true);
      return { invoice, items };
    } catch (e) {
      if (!(e && e.offline)) throw e;

      /* ---- no connection: keep the sale, flag it as not yet uploaded ---- */
      setOnline(false);
      const now = new Date();
      const provisional = nextTempNo();
      const invoice = {
        invoice_no: provisional,
        date_disp: todayStr(now),
        time_disp: nowTime(now),
        customer,
        seller: (user && user.username) || "unknown",
        total, paid, change,
        created_at: now.toISOString(),
        pending: true,
      };
      const items = lines.map((l, i) => ({
        id: uid(), invoice_no: provisional, seq: i, ...l,
      }));
      // the queue entry must carry its own lines: it may be the only copy left
      invoice.items = items;
      const queue = readQueue();
      queue.push({ client_id, invoice, at: now.toISOString() });
      if (!writeQueue(queue)) {
        throw new Error("ইন্টারনেট ও স্টোরেজ দুটোই নেই — বিলটি সেভ করা যায়নি");
      }
      db.invoices.push(invoice);
      db.invoice_items.push(...items);
      commit("invoices", true);
      return { invoice, items, queued: true };
    }
  }

  /** staff -> own bills only; owner -> everything (optional seller filter) */
  function invoices({ date, seller, username, role } = {}) {
    let rows = get().invoices;
    const effSeller = role === "owner" ? seller : username;
    if (date) rows = rows.filter((r) => r.date_disp === date);
    if (effSeller) rows = rows.filter((r) => r.seller === effSeller);
    return rows.slice()
      .sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at)) ||
        String(b.invoice_no).localeCompare(String(a.invoice_no))
      )
      .slice(0, 500);
  }

  function invoiceWithItems(invoiceNo, username, role) {
    const inv = get().invoices.find((r) => r.invoice_no === invoiceNo);
    if (!inv) throw new Error("বিল পাওয়া যায়নি");
    if (role !== "owner" && inv.seller !== username) throw new Error("এই বিলটি আপনার নয়");
    const items = get().invoice_items
      .filter((i) => i.invoice_no === invoiceNo)
      .sort((a, b) => a.seq - b.seq);
    return { invoice: inv, items };
  }

  async function deleteInvoice(invoiceNo) {
    const local = get().invoices.find((r) => r.invoice_no === invoiceNo);
    if (local && local.pending) {
      // never uploaded, so nothing to ask the server
      dropFromQueue(invoiceNo);
    } else {
      await API.deleteInvoice(invoiceNo);
    }
    const i = db.invoices.findIndex((r) => r.invoice_no === invoiceNo);
    if (i < 0) throw new Error("বিল পাওয়া যায়নি");
    db.invoices.splice(i, 1);
    db.invoice_items = db.invoice_items.filter((x) => x.invoice_no !== invoiceNo);
    commit("invoices", true);
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

  async function saveSettings(body) {
    const res = await API.saveSettings(body);
    db.settings = { ...DEFAULT_SETTINGS, ...res.settings };
    commit("settings");
    return settings();
  }

  /* ---------- backup / restore ---------- */

  function exportJSON() {
    markExported();
    return JSON.stringify(get(), null, 2);
  }

  /**
   * Restore a backup file onto the server. The server validates the file
   * first (dry run) so a wrong file is rejected before anything is deleted.
   * Staff accounts are never touched — they live on the server.
   */
  async function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("ফাইলটি বৈধ নয়");
    if (!("invoices" in parsed) && !("products" in parsed)) {
      throw new Error("ফাইলে বিল বা পণ্যের তালিকা নেই — সম্ভবত সঠিক ব্যাকআপ নয়");
    }

    const summary = await API.restoreDryRun(parsed);
    if (!confirm(
      `ফাইলে ${summary.products}টি পণ্য, ${summary.invoices}টি বিল আছে।\n` +
      "সার্ভারের সব বিল ও পণ্য এই ফাইল দিয়ে বদলে যাবে। স্টাফ ও পাসওয়ার্ড অপরিবর্তিত থাকবে। চালিয়ে যাবেন?"
    )) return false;

    takeSnapshot("before-import", true);
    await API.restore(parsed);
    await sync();
    return true;
  }

  /** wipe the server's bills and products; accounts are left alone */
  async function resetAll() {
    if (!confirm("সব বিল ও পণ্য মুছে যাবে। স্টাফ অ্যাকাউন্ট থাকবে। নিশ্চিত?")) return false;
    takeSnapshot("before-reset", true);
    await API.restore({ settings: DEFAULT_SETTINGS, products: [], invoices: [], invoice_items: [] });
    writeQueue([]);
    db = emptyDB();
    db.settings = { ...DEFAULT_SETTINGS };
    commit("reset", true);
    return true;
  }

  function usageBytes() {
    try { return new Blob([localStorage.getItem(KEY) || ""]).size; } catch (e) { return 0; }
  }

  /* ---------- migration from the local-only version ---------- */

  /** bills saved in the browser before this app had a server */
  function legacyData() {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.invoices)) return null;
      return parsed;
    } catch (e) { return null; }
  }

  const needsMigration = () =>
    !localStorage.getItem(MIGRATED_KEY) && Boolean(legacyData() && legacyData().invoices.length);

  function markMigrated() {
    try { localStorage.setItem(MIGRATED_KEY, String(Date.now())); } catch (e) {}
  }

  /* ---------- safety snapshots (of the local cache + queue) ---------- */

  function readSnapshots() {
    try {
      const arr = JSON.parse(localStorage.getItem(SNAP_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeSnapshots(list) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }

  function takeSnapshot(reason, force) {
    try {
      const now = Date.now();
      const list = readSnapshots();
      if (!force && list.length && now - list[0].ts < SNAPSHOT_MIN_INTERVAL) return false;
      if (!db) return false;
      // the unsent queue is the only truly irreplaceable local data
      const data = JSON.stringify({ db, queue: readQueue() });
      const entry = { ts: now, reason: reason || "auto", invoices: db.invoices.length, data };
      const next = [entry, ...list].slice(0, MAX_SNAPSHOTS);
      let total = 0;
      for (let i = next.length - 1; i >= 0; i--) {
        total += next[i].data.length;
        if (total > MAX_TOTAL_BACKUP_BYTES && i < next.length - 1) next.splice(i, 1);
      }
      return writeSnapshots(next);
    } catch (e) { return false; }
  }

  const snapshots = () =>
    readSnapshots()
      .map((s) => ({ ts: s.ts, reason: s.reason, invoices: s.invoices, size: s.data.length }))
      .sort((a, b) => b.ts - a.ts);

  function clearSnapshots() {
    try { localStorage.removeItem(SNAP_KEY); } catch (e) {}
  }

  /** a snapshot of the cache can be put back if the browser data is lost */
  function restoreSnapshot(ts) {
    const hit = readSnapshots().find((s) => s.ts === ts);
    if (!hit) throw new Error("স্ন্যাপশট পাওয়া যায়নি");
    const parsed = JSON.parse(hit.data);
    if (parsed.db) {
      db = hydrate({
        settings: parsed.db.settings,
        products: parsed.db.products,
        staff: parsed.db.employees,
        invoices: rebuildInvoices(parsed.db),
      });
    }
    if (Array.isArray(parsed.queue) && parsed.queue.length) writeQueue(parsed.queue);
    commit("restore", true);
    return db;
  }

  function rebuildInvoices(flat) {
    const byNo = new Map();
    for (const it of flat.invoice_items || []) {
      if (!byNo.has(it.invoice_no)) byNo.set(it.invoice_no, []);
      byNo.get(it.invoice_no).push({
        seq: it.seq, item: it.item, size: it.size, qty: it.qty, price: it.price,
      });
    }
    return (flat.invoices || []).map((r) => ({ ...r, items: byNo.get(r.invoice_no) || [] }));
  }

  function markExported() {
    try { localStorage.setItem(MARK_KEY, String(Date.now())); } catch (e) {}
  }
  function lastExport() {
    try { return Number(localStorage.getItem(MARK_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  /** days since a backup file was downloaded (-1 = never) */
  function daysSinceExport() {
    const t = lastExport();
    if (!t) return -1;
    return Math.floor((Date.now() - t) / 86400000);
  }

  function commit(reason, force) {
    persist();
    try { takeSnapshot(reason, force); } catch (e) {}
    notify(reason || "change");
    try {
      if (global.BroadcastChannel) {
        if (!global.__lfjBC) global.__lfjBC = new BroadcastChannel("lfj-store");
        global.__lfjBC.postMessage({ reason });
      }
    } catch (e) {}
  }

  /* retry the queue whenever the connection comes back */
  if (global.addEventListener) {
    global.addEventListener("online", () => {
      setOnline(true);
      sync();
    });
    global.addEventListener("offline", () => setOnline(false));
  }

  global.Store = {
    KEY, QUEUE_KEY, SESSION_KEY, uid, todayStr, nowTime, num,
    load, get, onChange, usageBytes,
    me, login, logout, saveSession, readSession, sync,
    isOnline, pendingCount, statusError, flushQueue,
    products, priceFor, addProduct, updateProduct, deleteProduct,
    employees, addEmployee, updateEmployee, deleteEmployee,
    createInvoice, invoices, invoiceWithItems, deleteInvoice, statsToday,
    settings, saveSettings,
    exportJSON, importJSON, resetAll,
    legacyData, needsMigration, markMigrated,
    takeSnapshot, snapshots, restoreSnapshot, clearSnapshots,
    markExported, lastExport, daysSinceExport, MAX_SNAPSHOTS,
    DEFAULT_SETTINGS,
  };
})(typeof window !== "undefined" ? window : this);
