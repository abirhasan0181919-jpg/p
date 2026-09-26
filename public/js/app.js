/* ==========================================================
   Live Fruit Juice — Frontend (talks to our own JSON-file API)
   ========================================================== */

(function () {
  "use strict";

  const CURRENCY = "৳";
  const SALT = "livefruitjuice_salt_";
  const TOKEN_KEY = "lfj_token";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------------- ICONS ---------------- */
  const I = {
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    billing: '<path d="M6 2h12a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-4 2V4a2 2 0 0 1 2-2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    cup: '<path d="M4 4h13l-1.5 15a2 2 0 0 1-2 1.75H7.5a2 2 0 0 1-2-1.75z"/><path d="M17 6h2.5a2 2 0 0 1 0 5H17"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    receipt: '<path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  };

  function svg(name, size = 20, extra = "") {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" ${extra}>${I[name] || ""}</svg>`;
  }
  function paintIcons(root = document) {
    $$("[data-icon]", root).forEach((el) => {
      if (!el.firstElementChild) el.innerHTML = svg(el.dataset.icon, Number(el.dataset.size) || 20);
    });
  }

  /* ---------------- STATE ---------------- */
  const state = {
    token: null,
    user: null, // { username, role }
    products: [],
    staff: [],
    cart: [],
    settings: { shop_name: "Live Fruit Juice", shop_address: "", shop_phone: "", auto_print: true, show_thankyou: true },
    view: "billing",
    ownerFilter: "all",
    es: null,
    editingProductId: null,
    editingStaffId: null,
  };

  /* ---------------- UTIL ---------------- */
  const money = (n) =>
    CURRENCY +
    (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

  const p2 = (x) => String(x).padStart(2, "0");
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

  function prettyTime(t) {
    if (!t) return "";
    const [h, m] = String(t).split(":");
    const hh = Number(h);
    return `${hh % 12 === 0 ? 12 : hh % 12}:${m} ${hh >= 12 ? "PM" : "AM"}`;
  }

  const esc = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  async function sha256(text) {
    if (window.crypto && window.crypto.subtle) {
      const buf = new TextEncoder().encode(text);
      const hash = await window.crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    throw new Error("SHA256 অনুপলব্ধ");
  }

  /* ---------------- API CLIENT ---------------- */
  function setToken(t) {
    state.token = t;
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }
  function loadToken() {
    try { state.token = localStorage.getItem(TOKEN_KEY); } catch (e) { state.token = null; }
    return state.token;
  }

  class ApiError extends Error {
    constructor(msg, status) { super(msg); this.status = status; }
  }

  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = "Bearer " + state.token;

    let res;
    try {
      res = await fetch("/api" + path, {
        method: opts.method || "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new ApiError("সার্ভারে পৌঁছানো যায়নি — ইন্টারনেট দেখুন", 0);
    }

    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }

    if (!res.ok) {
      if (res.status === 401 && state.user) { forceLogout(); }
      throw new ApiError((data && data.error) || "সমস্যা হয়েছে", res.status);
    }
    return data;
  }

  /* ---------------- TOAST / MODAL ---------------- */
  function toast(msg, type = "info", ms = 3200) {
    const box = $("#toast-container");
    const ic = { success: "check", error: "alert", warning: "alert", info: "info" }[type] || "info";
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `${svg(ic, 18)}<span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0"; el.style.transform = "translateX(60px)";
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  function openModal(el) { el.classList.add("visible"); }
  function closeModal(el) { el.classList.remove("visible"); }

  function confirmDialog(message, title = "নিশ্চিত করুন") {
    return new Promise((resolve) => {
      const m = $("#confirm-modal");
      $("#modal-title").textContent = title;
      $("#modal-message").textContent = message;
      openModal(m);
      const done = (v) => {
        closeModal(m);
        $("#modal-confirm").onclick = null;
        $("#modal-cancel").onclick = null;
        resolve(v);
      };
      $("#modal-confirm").onclick = () => done(true);
      $("#modal-cancel").onclick = () => done(false);
    });
  }

  /* ---------------- LOGIN ---------------- */
  async function handleLogin(e) {
    e.preventDefault();
    const err = $("#login-error");
    const btn = $(".btn-login");
    const username = $("#username").value.trim();
    const password = $("#password").value;

    err.classList.add("hidden");
    if (!username || !password) return;

    btn.classList.add("loading");
    btn.disabled = true;

    try {
      const hash = await sha256(SALT + password);
      const res = await api("/auth/login", { method: "POST", body: { username, password_hash: hash } });
      setToken(res.token);
      state.user = { username: res.username, role: res.role };
      await enterApp();
    } catch (e2) {
      err.textContent = e2.message || "লগইনে সমস্যা হয়েছে";
      err.classList.remove("hidden");
      $("#password").value = "";
      $("#password").focus();
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  }

  function forceLogout() {
    setToken(null);
    state.user = null;
    state.cart = [];
    stopLive();
    showPage("login-page");
    renderCart();
  }

  async function logout() {
    if (cartCount() > 0) {
      const ok = await confirmDialog("কার্টে পণ্য আছে। তবুও লগ আউট করবেন?", "লগ আউট");
      if (!ok) return;
    }
    forceLogout();
    toast("লগ আউট হয়েছে", "info");
  }

  /* ---------------- NAVIGATION ---------------- */
  function showPage(id) {
    $$(".page").forEach((p) => p.classList.remove("active"));
    const el = $("#" + id);
    if (el) el.classList.add("active");
  }

  const OWNER_PAGES = { products: renderProductsManage, staff: renderStaffManage, settings: fillSettings };

  function setView(name) {
    if (state.user && state.user.role !== "owner" && OWNER_PAGES[name]) {
      toast("শুধুমাত্র মালিক এই পেজ দেখতে পারবেন", "warning");
      name = "billing";
    }
    state.view = name;
    $$(".view").forEach((v) => v.classList.remove("active"));
    const map = { billing: "billing-view", "today-bills": "today-bills-view", products: "products-view", staff: "staff-view", settings: "settings-view" };
    const el = $("#" + (map[name] || "billing-view"));
    if (el) el.classList.add("active");
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === name));
    closeSidebar();

    if (name === "today-bills") loadTodayBills();
    if (OWNER_PAGES[name]) OWNER_PAGES[name]();
    window.scrollTo({ top: 0 });
  }

  function openSidebar() {
    $("#sidebar").classList.add("open");
    const ov = $("#sidebar-overlay");
    ov.classList.remove("hidden");
    requestAnimationFrame(() => ov.classList.add("visible"));
  }
  function closeSidebar() {
    if (window.innerWidth > 768) return;
    $("#sidebar").classList.remove("open");
    const ov = $("#sidebar-overlay");
    ov.classList.remove("visible");
    setTimeout(() => { if (!ov.classList.contains("visible")) ov.classList.add("hidden"); }, 250);
  }

  /* ---------------- ENTER APP ---------------- */
  async function enterApp() {
    const isOwner = state.user.role === "owner";
    showPage("billing-page");
    $("#current-user").innerHTML = `${svg("user", 15)} ${esc(state.user.username)} · ${isOwner ? "ওনার" : "স্টাফ"}`;
    $$(".owner-only").forEach((el) => (el.style.display = isOwner ? "" : "none"));

    await Promise.allSettled([loadProducts(), loadSettings(), loadStaff()]);
    startLive();
    setView("billing");
  }

  /* ---------------- DATA LOADERS ---------------- */
  async function loadProducts() {
    try {
      state.products = (await api("/products")) || [];
      renderProducts();
    } catch (e) {
      toast("পণ্য লোড করা যায়নি", "error");
    }
  }

  async function loadSettings() {
    try {
      state.settings = (await api("/settings")) || state.settings;
    } catch (e) { /* keep defaults */ }
  }

  async function loadStaff() {
    try {
      state.staff = (await api("/employees")) || [];
    } catch (e) { state.staff = []; }
    const sel = $("#staff-filter");
    if (sel) {
      sel.innerHTML = '<option value="all">সবাই</option>' +
        state.staff.map((s) => `<option value="${esc(s.username)}">${esc(s.username)}</option>`).join("");
      sel.value = state.ownerFilter;
    }
  }

  /* ---------------- LIVE UPDATES (SSE) ---------------- */
  function setLive(on) {
    const d = $("#live-dot");
    if (d) d.classList.toggle("off", !on);
  }

  function startLive() {
    stopLive();
    if (typeof EventSource === "undefined") return pollFallback();
    try {
      const es = new EventSource("/api/events");
      state.es = es;
      es.addEventListener("hello", () => setLive(true));
      es.addEventListener("products", async () => { await loadProducts(); toast("পণ্য তালিকা আপডেট হয়েছে", "info", 1800); });
      es.addEventListener("settings", async () => { await loadSettings(); if (state.view === "settings") fillSettings(); });
      es.addEventListener("employees", async () => { await loadStaff(); if (state.view === "staff") renderStaffManage(); });
      es.onerror = () => { setLive(false); };
    } catch (e) { pollFallback(); }
  }

  function stopLive() {
    if (state.es) { try { state.es.close(); } catch (e) {} state.es = null; }
    setLive(false);
  }

  /* simple safety-net poll if SSE is blocked by a proxy */
  function pollFallback() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(async () => {
      if (!state.user) return;
      try { await loadProducts(); setLive(true); } catch (e) { setLive(false); }
    }, 8000);
  }

  /* ---------------- PRODUCTS (POS view) ---------------- */
  const priceFor = (p, s) => Number(p["price_" + String(s).toLowerCase()] || 0) || 0;

  function renderProducts() {
    const wrap = $("#products-list");
    if (!wrap) return;
    const term = ($("#product-search").value || "").trim().toLowerCase();
    const list = term ? state.products.filter((p) => String(p.name || "").toLowerCase().includes(term)) : state.products;

    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state">${svg(term ? "search" : "cup", 56)}
        <p>${term ? "কোনো পণ্য পাওয়া যায়নি" : "কোনো পণ্য নেই — মালিক পণ্য যোগ করুন"}</p></div>`;
      return;
    }

    wrap.innerHTML = list
      .map((p) => {
        const sizes = ["S", "M", "L"].map((s) => {
          const pr = priceFor(p, s);
          return `<button class="size-btn" ${pr > 0 ? "" : "disabled"} data-pid="${esc(p.id)}" data-size="${s}" data-price="${pr}">
              <span class="size-label">${s}</span>
              <span class="size-price">${pr > 0 ? money(pr) : "—"}</span>
            </button>`;
        }).join("");
        return `<div class="product-card" data-pid="${esc(p.id)}">
            <div class="product-header">
              <span class="product-name">${esc(p.name)}</span>
              <span class="product-category">জুস</span>
            </div>
            <div class="product-sizes">${sizes}</div>
          </div>`;
      })
      .join("");
  }

  /* ---------------- CART ---------------- */
  function addToCart(pid, size, price) {
    const product = state.products.find((p) => p.id === pid);
    if (!product) return;
    const key = pid + "|" + size;
    const line = state.cart.find((l) => l.key === key);
    if (line) line.qty += 1;
    else state.cart.push({ key, pid, item: product.name, size, qty: 1, price: Number(price) || 0 });
    renderCart();
  }

  function changeQty(key, delta) {
    const i = state.cart.findIndex((l) => l.key === key);
    if (i < 0) return;
    state.cart[i].qty += delta;
    if (state.cart[i].qty <= 0) state.cart.splice(i, 1);
    renderCart();
  }

  const cartCount = () => state.cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = () => state.cart.reduce((s, l) => s + l.qty * l.price, 0);

  function renderCart() {
    const wrap = $("#cart-items");
    const summary = $("#cart-summary");
    const btn = $("#complete-bill-btn");
    $("#cart-count").textContent = `${cartCount()} আইটেম`;

    if (!state.cart.length) {
      wrap.innerHTML = `<div class="empty-cart">${svg("cart", 48)}<p>কার্ট খালি</p>
        <span>পণ্য যোগ করতে সাইজ বাটনে চাপ দিন</span></div>`;
      summary.style.display = "none";
      btn.disabled = true;
      return;
    }

    summary.style.display = "";
    btn.disabled = false;
    wrap.innerHTML = state.cart
      .map((l) => `<div class="cart-item" data-key="${esc(l.key)}">
          <div class="cart-item-header">
            <div class="cart-item-info">
              <div class="cart-item-name">${esc(l.item)}</div>
              <div class="cart-item-size">সাইজ: ${esc(l.size)} · একক ${money(l.price)}</div>
            </div>
            <div class="cart-item-price">${money(l.qty * l.price)}</div>
            <button class="cart-item-remove" data-remove="${esc(l.key)}" aria-label="মুছুন">${svg("trash", 16)}</button>
          </div>
          <div class="cart-item-controls">
            <button class="qty-btn" data-dec="${esc(l.key)}" aria-label="কমান">${svg("minus", 14)}</button>
            <span class="qty-value">${l.qty}</span>
            <button class="qty-btn" data-inc="${esc(l.key)}" aria-label="বাড়ান">${svg("plus", 14)}</button>
            <div class="cart-item-subtotal">${money(l.qty * l.price)}</div>
          </div>
        </div>`)
      .join("");
    updateTotals();
  }

  function updateTotals() {
    const total = cartTotal();
    $("#grand-total").textContent = money(total);

    const raw = $("#amount-paid").value;
    const paid = raw === "" ? total : Number(raw) || 0;
    const diff = Math.round((paid - total) * 100) / 100;

    const el = $("#change-due");
    const label = $("#change-due-row").firstElementChild;
    if (diff >= 0) {
      el.textContent = money(diff);
      el.className = "change-positive";
      label.textContent = "ফেরত";
    } else {
      el.textContent = money(Math.abs(diff));
      el.className = "change-negative";
      label.textContent = "বাকি";
    }
  }

  /* ---------------- COMPLETE BILL ---------------- */
  let saving = false;
  async function completeBill() {
    if (saving || !state.cart.length) return;
    if (cartTotal() <= 0) return toast("মোট টাকা শূন্য", "warning");

    const customer = ($("#customer-name").value || "").trim() || "Walk-in Customer";
    const raw = $("#amount-paid").value;
    const paid = raw === "" ? cartTotal() : Number(raw) || 0;

    const ok = await confirmDialog(`মোট ${money(cartTotal())} টাকা — বিল সম্পন্ন করবেন?`, "বিল নিশ্চিত করুন");
    if (!ok) return;

    saving = true;
    const btn = $("#complete-bill-btn");
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `${svg("info", 18)} সেভ হচ্ছে...`;

    try {
      const res = await api("/invoices", {
        method: "POST",
        body: { customer, paid, lines: state.cart.map((l) => ({ item: l.item, size: l.size, qty: l.qty, price: l.price })) },
      });
      // server returns the authoritative numbers
      state.cart = [];
      renderCart();
      $("#customer-name").value = "Walk-in Customer";
      $("#amount-paid").value = "0";
      if (state.settings.auto_print) openReceipt(res);
      else { toast("বিল সেভ হয়েছে", "success"); loadTodayBills(); }
    } catch (e) {
      toast(e.message || "বিল সেভ করা যায়নি", "error");
    } finally {
      saving = false;
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  /* ---------------- RECEIPT ---------------- */
  function receiptHTML(payload, s) {
    const inv = payload.invoice;
    const items = payload.items || [];
    const rows = items.map((i) => `<tr>
        <td class="item-name">${esc(i.item)}${i.size ? ` <span class="item-size">(${esc(i.size)})</span>` : ""}</td>
        <td class="qty">${esc(i.qty)}</td>
        <td class="price">${money(i.price)}</td>
        <td class="subtotal">${money(Number(i.qty) * Number(i.price))}</td>
      </tr>`).join("");

    const diff = Number(inv.change || 0);
    const isDue = diff < 0;

    return `<div class="receipt-header">
        <div class="receipt-shop-name">${esc(s.shop_name)}</div>
        ${s.shop_address ? `<div class="receipt-shop-address">${esc(s.shop_address)}</div>` : ""}
        ${s.shop_phone ? `<div class="receipt-shop-phone">মোবাঃ ${esc(s.shop_phone)}</div>` : ""}
      </div>
      <div class="receipt-info">
        <div><span>সিরিয়াল</span><b>${esc(inv.invoice_no)}</b></div>
        <div><span>তারিখ</span><b>${esc(inv.date_disp)}</b></div>
        <div><span>সময়</span><b>${esc(prettyTime(inv.time_disp))}</b></div>
        <div><span>সার্ভড</span><b>${esc(inv.seller)}</b></div>
      </div>
      <div class="receipt-info">
        <div><span>কাস্টমার</span><b>${esc(inv.customer)}</b></div>
      </div>
      <table class="receipt-table">
        <thead><tr><th>আইটেম</th><th class="qty">পরিমাণ</th><th class="price">দাম</th><th class="subtotal">মোট</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="receipt-totals">
        <div class="receipt-total-row grand"><span>TOTAL</span><span>${money(inv.total)}</span></div>
        <div class="receipt-total-row"><span>প্রাপ্ত</span><span>${money(inv.paid)}</span></div>
        <div class="receipt-total-row"><span>${isDue ? "বাকি" : "ফেরত"}</span><span>${money(Math.abs(diff))}</span></div>
      </div>
      ${s.show_thankyou ? `<div class="receipt-footer"><div class="receipt-thankyou">ধন্যবাদ, আবার আসবেন!</div></div>` : ""}`;
  }

  function openReceipt(payload) {
    $("#receipt-container").innerHTML =
      receiptHTML(payload, state.settings) +
      `<div class="no-print" style="display:flex;gap:8px;margin-top:16px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="rp-print" style="flex:1;min-width:120px">${svg("print", 18)} প্রিন্ট করুন</button>
        <button class="btn btn-secondary" id="rp-close" style="flex:1;min-width:120px">${svg("back", 18)} ফিরে যান</button>
      </div>`;
    showPage("print-page");
    window.scrollTo(0, 0);
    $("#rp-print").onclick = () => window.print();
    $("#rp-close").onclick = closePrint;
    if (state.settings.auto_print) setTimeout(() => window.print(), 300);
  }

  function closePrint() {
    showPage("billing-page");
    setView(state.view);
  }

  /* ---------------- TODAY'S BILLS ---------------- */
  async function loadTodayBills() {
    const list = $("#bills-list");
    list.innerHTML = `<div class="loading-state">লোড হচ্ছে...</div>`;
    try {
      const qs = new URLSearchParams({ date: todayStr() });
      if (state.user.role === "owner" && state.ownerFilter !== "all") qs.set("seller", state.ownerFilter);
      const rows = (await api("/invoices?" + qs.toString())) || [];
      renderBills(rows);
    } catch (e) {
      list.innerHTML = `<div class="empty-state">${svg("alert", 48)}<p>${esc(e.message)}</p></div>`;
    }
  }

  function renderBills(rows) {
    const list = $("#bills-list");
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state">${svg("receipt", 56)}<p>আজ কোনো বিল পাওয়া যায়নি</p></div>`;
      return;
    }
    const isOwner = state.user.role === "owner";
    const grand = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

    list.innerHTML =
      `<div class="bill-card summary-card">
        <div class="bill-header" style="margin:0">
          <div><span class="bill-no">আজকের মোট বিল: ${rows.length}</span></div>
          <div class="bill-total" style="color:var(--color-primary)">${money(grand)}</div>
        </div>
      </div>` +
      rows.map((r) => `<div class="bill-card" data-inv="${esc(r.invoice_no)}">
        <div class="bill-header">
          <div>
            <div class="bill-no">${esc(r.invoice_no)}</div>
            <div class="bill-time">${svg("info", 13)} ${esc(prettyTime(r.time_disp))}</div>
          </div>
          ${isOwner ? `<span class="bill-seller">${esc(r.seller)}</span>` : ""}
          <div class="bill-total">${money(r.total)}</div>
        </div>
        <div class="bill-customer">${svg("user", 13)} ${esc(r.customer || "Walk-in Customer")}</div>
        <div class="bill-actions">
          <button class="bill-btn primary" data-reprint="${esc(r.invoice_no)}">${svg("print", 15)} রিপ্রিন্ট</button>
        </div>
      </div>`).join("");
  }

  async function reprint(invoiceNo) {
    try {
      const res = await api("/invoices/" + encodeURIComponent(invoiceNo));
      const auto = state.settings.auto_print;
      state.settings.auto_print = true; // reprint always opens the print dialog
      openReceipt(res);
      state.settings.auto_print = auto;
    } catch (e) {
      toast(e.message || "রিপ্রিন্ট করা যায়নি", "error");
    }
  }

  /* ---------------- PRODUCTS MANAGEMENT ---------------- */
  function renderProductsManage() {
    const wrap = $("#products-manage-list");
    if (!state.products.length) {
      wrap.innerHTML = `<div class="empty-state">${svg("cup", 56)}<p>কোনো পণ্য নেই</p>
        <button class="btn btn-primary" onclick="document.getElementById('new-product-btn').click()">+ প্রথম পণ্য যোগ করুন</button></div>`;
      return;
    }
    wrap.innerHTML = state.products.map((p) => `<div class="manage-row" data-id="${esc(p.id)}">
        <div class="manage-main">
          <div class="manage-name">${esc(p.name)}</div>
          <div class="manage-prices">
            <span class="chip">S ${money(priceFor(p, "S"))}</span>
            <span class="chip">M ${money(priceFor(p, "M"))}</span>
            <span class="chip">L ${money(priceFor(p, "L"))}</span>
          </div>
        </div>
        <div class="manage-actions">
          <button class="icon-btn-sm" data-edit-product="${esc(p.id)}" aria-label="এডিট">${svg("edit", 16)}</button>
          <button class="icon-btn-sm danger" data-del-product="${esc(p.id)}" aria-label="ডিলিট">${svg("trash", 16)}</button>
        </div>
      </div>`).join("");
  }

  function openProductModal(id) {
    state.editingProductId = id || null;
    const p = id ? state.products.find((x) => x.id === id) : null;
    $("#product-modal-title").textContent = p ? "পণ্য এডিট করুন" : "নতুন পণ্য";
    $("#p-name").value = p ? p.name : "";
    $("#p-s").value = p ? p.price_s : 0;
    $("#p-m").value = p ? p.price_m : 0;
    $("#p-l").value = p ? p.price_l : 0;
    openModal($("#product-modal"));
    $("#p-name").focus();
  }

  async function saveProduct(e) {
    e.preventDefault();
    const body = {
      name: $("#p-name").value.trim(),
      price_s: $("#p-s").value || 0,
      price_m: $("#p-m").value || 0,
      price_l: $("#p-l").value || 0,
    };
    if (!body.name) return toast("পণ্যের নাম লিখুন", "warning");
    try {
      if (state.editingProductId) await api("/products/" + state.editingProductId, { method: "PUT", body });
      else await api("/products", { method: "POST", body });
      closeModal($("#product-modal"));
      await loadProducts();
      renderProductsManage();
      toast("পণ্য সেভ হয়েছে", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  async function deleteProduct(id) {
    const p = state.products.find((x) => x.id === id);
    const ok = await confirmDialog(`"${p ? p.name : "পণ্য"}" মুছে ফেলবেন? পুরনো বিলে থাকবে।`, "পণ্য মুছে ফেলুন");
    if (!ok) return;
    try {
      await api("/products/" + id, { method: "DELETE" });
      await loadProducts();
      renderProductsManage();
      toast("পণ্য মুছে ফেলা হয়েছে", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  /* ---------------- STAFF MANAGEMENT ---------------- */
  function renderStaffManage() {
    const wrap = $("#staff-manage-list");
    if (!state.staff.length) {
      wrap.innerHTML = `<div class="empty-state">${svg("users", 56)}<p>কোনো স্টাফ নেই</p></div>`;
      return;
    }
    wrap.innerHTML = state.staff.map((s) => `<div class="manage-row${s.active === false ? " disabled-row" : ""}" data-id="${esc(s.id)}">
        <div class="manage-main">
          <div class="manage-name">
            ${esc(s.username)}
            ${s.role === "owner" ? '<span class="role-badge">ওনার</span>' : '<span class="role-badge staff">স্টাফ</span>'}
            ${s.active === false ? '<span class="role-badge off">নিষ্ক্রিয়</span>' : ""}
          </div>
        </div>
        <div class="manage-actions">
          <button class="icon-btn-sm" data-edit-staff="${esc(s.id)}" aria-label="এডিট">${svg("edit", 16)}</button>
          <button class="icon-btn-sm danger" data-del-staff="${esc(s.id)}" aria-label="ডিলিট">${svg("trash", 16)}</button>
        </div>
      </div>`).join("");
  }

  function openStaffModal(id) {
    state.editingStaffId = id || null;
    const s = id ? state.staff.find((x) => x.id === id) : null;
    $("#staff-modal-title").textContent = s ? "স্টাফ এডিট করুন" : "নতুন স্টাফ";
    $("#s-username").value = s ? s.username : "";
    $("#s-username").disabled = !!s;
    $("#s-password").value = "";
    $("#s-pass-hint").textContent = s ? "(খালি রাখলে অপরিবর্তিত থাকবে)" : "";
    $("#s-role").value = s ? s.role : "staff";
    openModal($("#staff-modal"));
    (s ? $("#s-password") : $("#s-username")).focus();
  }

  async function saveStaff(e) {
    e.preventDefault();
    const body = {
      role: $("#s-role").value,
    };
    const pw = $("#s-password").value.trim();
    if (pw) body.password = pw;

    try {
      if (state.editingStaffId) {
        await api("/employees/" + state.editingStaffId, { method: "PUT", body });
      } else {
        body.username = $("#s-username").value.trim();
        body.password = pw;
        if (!body.username) return toast("ইউজারনেম লিখুন", "warning");
        if (!body.password) return toast("পাসওয়ার্ড লিখুন", "warning");
        await api("/employees", { method: "POST", body });
      }
      closeModal($("#staff-modal"));
      await loadStaff();
      renderStaffManage();
      toast("সেভ হয়েছে", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  async function deleteStaff(id) {
    const s = state.staff.find((x) => x.id === id);
    const ok = await confirmDialog(`"${s ? s.username : ""}" কে মুছে ফেলবেন?`, "স্টাফ মুছে ফেলুন");
    if (!ok) return;
    try {
      await api("/employees/" + id, { method: "DELETE" });
      await loadStaff();
      renderStaffManage();
      toast("মুছে ফেলা হয়েছে", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  /* ---------------- SETTINGS ---------------- */
  function fillSettings() {
    $("#shop-name").value = state.settings.shop_name || "";
    $("#shop-address").value = state.settings.shop_address || "";
    $("#shop-phone").value = state.settings.shop_phone || "";
    $("#auto-print").checked = !!state.settings.auto_print;
    $("#show-thankyou").checked = !!state.settings.show_thankyou;
  }

  async function saveSettings(e) {
    e.preventDefault();
    try {
      state.settings = await api("/settings", {
        method: "PUT",
        body: {
          shop_name: $("#shop-name").value.trim(),
          shop_address: $("#shop-address").value.trim(),
          shop_phone: $("#shop-phone").value.trim(),
          auto_print: $("#auto-print").checked,
          show_thankyou: $("#show-thankyou").checked,
        },
      });
      const msg = $("#settings-message");
      msg.className = "settings-message success";
      msg.textContent = "সেটিংস সেভ হয়েছে";
      setTimeout(() => msg.classList.add("hidden"), 3000);
      toast("সেটিংস সেভ হয়েছে", "success");
    } catch (err) { toast(err.message, "error"); }
  }

  async function restoreBackup(file) {
    const ok = await confirmDialog("বর্তমান সব ডেটা মুছে ফাইলের ডেটা বসবে। চালিয়ে যাবেন?", "ফিরিয়ে আনুন");
    if (!ok) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await api("/restore", { method: "POST", body: data });
      toast("ফাইল থেকে ডেটা ফিরিয়ে আনা হয়েছে", "success");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      toast("ফাইলটি পড়া যায়নি", "error");
    }
  }

  /* ---------------- WIRING ---------------- */
  function wire() {
    $("#login-form").addEventListener("submit", handleLogin);
    $("#logout-btn").addEventListener("click", logout);

    $(".toggle-password").addEventListener("click", (e) => {
      const b = e.currentTarget;
      const inp = $("#password");
      const show = inp.type === "password";
      inp.type = show ? "text" : "password";
      b.innerHTML = svg(show ? "lock" : "eye", 18);
      b.dataset.icon = show ? "lock" : "eye";
    });

    $("#menu-toggle").addEventListener("click", () => {
      $("#sidebar").classList.contains("open") ? closeSidebar() : openSidebar();
    });
    $("#sidebar-overlay").addEventListener("click", closeSidebar);

    $$(".nav-item").forEach((n) => n.addEventListener("click", (e) => { e.preventDefault(); setView(n.dataset.page); }));
    $("#product-search").addEventListener("input", renderProducts);

    $("#products-list").addEventListener("click", (e) => {
      const b = e.target.closest(".size-btn");
      if (b && !b.disabled) addToCart(b.dataset.pid, b.dataset.size, b.dataset.price);
    });

    $("#cart-items").addEventListener("click", (e) => {
      const inc = e.target.closest("[data-inc]");
      const dec = e.target.closest("[data-dec]");
      const rm = e.target.closest("[data-remove]");
      if (inc) changeQty(inc.dataset.inc, 1);
      else if (dec) changeQty(dec.dataset.dec, -1);
      else if (rm) removeLine(rm.dataset.remove);
    });

    $("#amount-paid").addEventListener("input", updateTotals);
    $("#complete-bill-btn").addEventListener("click", completeBill);
    $("#staff-filter").addEventListener("change", (e) => { state.ownerFilter = e.target.value; loadTodayBills(); });

    $("#bills-list").addEventListener("click", (e) => {
      const b = e.target.closest("[data-reprint]");
      if (b) reprint(b.dataset.reprint);
    });

    // product management
    $("#new-product-btn").addEventListener("click", () => openProductModal(null));
    $("#product-form").addEventListener("submit", saveProduct);
    $("#p-cancel").addEventListener("click", () => closeModal($("#product-modal")));
    $("#products-manage-list").addEventListener("click", (e) => {
      const ed = e.target.closest("[data-edit-product]");
      const del = e.target.closest("[data-del-product]");
      if (ed) openProductModal(ed.dataset.editProduct);
      else if (del) deleteProduct(del.dataset.delProduct);
    });

    // staff management
    $("#new-staff-btn").addEventListener("click", () => openStaffModal(null));
    $("#staff-form").addEventListener("submit", saveStaff);
    $("#s-cancel").addEventListener("click", () => closeModal($("#staff-modal")));
    $("#staff-manage-list").addEventListener("click", (e) => {
      const ed = e.target.closest("[data-edit-staff]");
      const del = e.target.closest("[data-del-staff]");
      if (ed) openStaffModal(ed.dataset.editStaff);
      else if (del) deleteStaff(del.dataset.delStaff);
    });

    // settings
    $("#settings-form").addEventListener("submit", saveSettings);
    $("#restore-input").addEventListener("change", (e) => {
      if (e.target.files[0]) restoreBackup(e.target.files[0]);
    });

    // keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (!$("#billing-page").classList.contains("active")) return;
      if (e.target.matches("input, textarea, select")) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.key === "F2") { e.preventDefault(); $("#product-search").focus(); }
      if (e.key === "F4" && state.cart.length) { e.preventDefault(); completeBill(); }
    });

    window.addEventListener("afterprint", () => {
      if ($("#print-page").classList.contains("active") && state.settings.auto_print) closePrint();
    });
  }

  function removeLine(key) {
    state.cart = state.cart.filter((l) => l.key !== key);
    renderCart();
  }

  /* ---------------- BOOT ---------------- */
  async function checkServer() {
    const el = $("#server-status");
    try {
      const res = await fetch("/api/health");
      if (res.ok) { el.textContent = ""; return true; }
    } catch (e) { /* ignore */ }
    el.innerHTML = '<span style="color:var(--color-danger)">সার্ভার পৌঁছানো যায়নি</span>';
    return false;
  }

  function init() {
    wire();
    paintIcons();
    $("#logo-cup").innerHTML = svg("cup", 56, 'style="color:var(--color-primary)"');
    renderProducts();
    renderCart();
    checkServer();

    if (loadToken()) {
      // validate the stored session
      api("/auth/me")
        .then((me) => {
          state.user = { username: me.username, role: me.role };
          return enterApp();
        })
        .catch(() => { setToken(null); showPage("login-page"); });
    } else {
      showPage("login-page");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.__LFJ = { state, api, addToCart, cartTotal };
})();
