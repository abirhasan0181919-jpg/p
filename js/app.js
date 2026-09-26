/* ==========================================================
   Live Fruit Juice — Advanced Staff Billing System
   Vanilla JS + Supabase + Custom Auth (SHA256)
   ========================================================== */

(function () {
  "use strict";

  /* ---------------- CONFIG ---------------- */
  const SALT = "livefruitjuice_salt_";
  const DEFAULT_SETTINGS = {
    shop_name: "Live Fruit Juice",
    shop_address: "",
    shop_phone: "",
    auto_print: true,
    show_thankyou: true,
  };
  const SETTINGS_KEY = "lfj_settings";
  const SESSION_KEY = "lfj_session";
  const CURRENCY = "৳";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ---------------- STATE ---------------- */
  const state = {
    supabase: null,
    ready: false,
    missingConfig: false,
    user: null, // { username, role }
    products: [],
    cart: [],
    settings: { ...DEFAULT_SETTINGS },
    billingOpen: false,
    view: "billing",
    ownerFilter: "all",
    staffList: [],
    invoiceCounter: 0,
    productChannel: null,
  };

  /* ---------------- ICONS (inline SVG) ---------------- */
  const ICONS = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    billing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-4 2V4a2 2 0 0 1 2-2z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    cup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13l-1.5 15a2 2 0 0 1-2 1.75H7.5a2 2 0 0 1-2-1.75z"/><path d="M17 6h2.5a2 2 0 0 1 0 5H17"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  };

  function icon(name, size = 20) {
    return `<span class="icon" style="width:${size}px;height:${size}px" aria-hidden="true">${
      ICONS[name] || ""
    }</span>`;
  }

  /* ---------------- UTILITIES ---------------- */
  const money = (n) => {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    return CURRENCY + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };

  function todayStr(d = new Date()) {
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function nowTime(d = new Date()) {
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function prettyTime(t) {
    if (!t) return "";
    const [h, m] = String(t).split(":");
    const hh = Number(h);
    const suffix = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${m} ${suffix}`;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------------- SHA256 (WebCrypto + fallback) ---------------- */
  async function sha256(text) {
    if (window.crypto && window.crypto.subtle) {
      const buf = new TextEncoder().encode(text);
      const hash = await window.crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    if (window.CryptoJS && window.CryptoJS.SHA256) {
      return window.CryptoJS.SHA256(text).toString();
    }
    throw new Error("SHA256 unavailable");
  }

  /* ---------------- TOASTS ---------------- */
  function toast(msg, type = "info", ms = 3200) {
    const box = $("#toast-container");
    if (!box) return;
    const ic = { success: "check", error: "alert", warning: "alert", info: "info" }[type] || "info";
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `${icon(ic, 18)}<span>${esc(msg)}</span>`;
    box.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s, transform .3s";
      el.style.opacity = "0";
      el.style.transform = "translateX(60px)";
      setTimeout(() => el.remove(), 300);
    }, ms);
  }

  /* ---------------- MODAL ---------------- */
  function confirmDialog(message, title = "নিশ্চিত করুন") {
    return new Promise((resolve) => {
      const modal = $("#confirm-modal");
      $("#modal-title").textContent = title;
      $("#modal-message").textContent = message;
      modal.classList.add("visible");
      const done = (val) => {
        modal.classList.remove("visible");
        $("#modal-confirm").onclick = null;
        $("#modal-cancel").onclick = null;
        resolve(val);
      };
      $("#modal-confirm").onclick = () => done(true);
      $("#modal-cancel").onclick = () => done(false);
    });
  }

  /* ---------------- SETTINGS (localStorage) ---------------- */
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      state.settings = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      state.settings = { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------------- SUPABASE ---------------- */
  function readConfig() {
    const cfg = (window.SUPABASE_CONFIG || {});
    const params = new URLSearchParams(location.search);
    let url = (cfg.url || params.get("supabase_url") || "").trim();
    let key = (cfg.anonKey || cfg.key || params.get("supabase_key") || "").trim();
    // localStorage override (set once, survives edits)
    try {
      const saved = JSON.parse(localStorage.getItem("lfj_supabase") || "null");
      if (saved && saved.url && saved.key) {
        url = saved.url;
        key = saved.key;
      }
    } catch (e) {}
    return { url, key };
  }

  function initSupabase() {
    const { url, key } = readConfig();
    if (!url || !key) {
      state.missingConfig = true;
      return;
    }
    try {
      state.supabase = window.supabase.createClient(url, key);
      state.ready = true;
    } catch (e) {
      console.error("Supabase init failed", e);
      state.missingConfig = true;
    }
  }

  async function q(builder) {
    const { data, error } = await builder;
    if (error) throw error;
    return data;
  }

  /* ---------------- AUTH ---------------- */

  /**
   * Employee lookup.
   * Preferred: `login_employee` RPC (server-side compare, hashes never leave the DB).
   * Fallback: direct read of `employees` (only works if you allow anon SELECT).
   * Returns { username, role } on success, or null.
   */
  async function lookupEmployee(username, hash) {
    const clean = String(username || "").trim();
    const h = String(hash || "").toLowerCase();

    // 1) secure RPC
    try {
      const { data, error } = await state.supabase.rpc("login_employee", {
        p_username: clean,
        p_hash: h,
      });
      if (!error && data && data.length) {
        const r = Array.isArray(data[0]) ? data[0][0] : data[0];
        if (r && r.username) return { username: r.username, role: r.role };
      }
      if (!error && data && !data.length) return null; // RPC ran fine, no match
    } catch (e) {
      /* function not installed -> fall through */
    }

    // 2) direct read fallback
    const rows = await q(
      state.supabase
        .from("employees")
        .select("username, password_hash, role")
        .eq("username", clean)
        .limit(1)
    );
    const emp = rows && rows[0];
    if (!emp) return null;
    if (String(emp.password_hash || "").toLowerCase() !== h) return null;
    return { username: emp.username, role: emp.role };
  }

  function saveSession(user) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch (e) {}
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function restoreSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (s && s.username) {
        state.user = { username: s.username, role: s.role === "owner" ? "owner" : "staff" };
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const err = $("#login-error");
    const form = $("#login-form");
    const btn = $(".btn-login", form);
    const username = $("#username").value.trim();
    const password = $("#password").value;

    err.classList.add("hidden");
    err.textContent = "";

    if (!username || !password) return;

    btn.classList.add("loading");
    btn.disabled = true;

    try {
      if (!state.supabase) throw new Error("NO_CONFIG");

      const hash = await sha256(SALT + password);
      const emp = await lookupEmployee(username, hash);

      const ok = emp && !!emp.username;

      if (!ok) {
        err.textContent = "ইউজারনেম বা পাসওয়ার্ড ভুল";
        err.classList.remove("hidden");
        $("#password").value = "";
        $("#password").focus();
        return;
      }

      state.user = { username: emp.username, role: emp.role === "owner" ? "owner" : "staff" };
      saveSession(state.user);
      await enterApp();
    } catch (e2) {
      if (String(e2.message).includes("NO_CONFIG")) {
        err.innerHTML =
          "সাপ্লাবেস কনফিগারেশন পাওয়া যায়নি। <br>একই ডিভাইসে চালালে <b>config.js</b> ফাইলে আপনার Supabase URL ও Anon Key বসান।";
      } else {
        err.textContent = "লগইনে সমস্যা হয়েছে। ইন্টারনেট সংযোগ দেখুন।";
        console.error(e2);
      }
      err.classList.remove("hidden");
    } finally {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  }

  /* ---------------- PAGE / VIEW MANAGEMENT ---------------- */
  function showPage(id) {
    $$(".page").forEach((p) => p.classList.remove("active"));
    const el = $("#" + id);
    if (el) el.classList.add("active");
  }

  function setView(name) {
    state.view = name;
    $$(".view").forEach((v) => v.classList.remove("active"));
    const map = { billing: "billing-view", "today-bills": "today-bills-view", settings: "settings-view" };
    const el = $("#" + (map[name] || "billing-view"));
    if (el) el.classList.add("active");
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === name));
    closeSidebar();
    if (name === "billing") state.billingOpen = true;
    if (name === "today-bills") loadTodayBills();
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
    setTimeout(() => {
      if (!ov.classList.contains("visible")) ov.classList.add("hidden");
    }, 250);
  }

  /* ---------------- ENTER APP ---------------- */
  async function enterApp() {
    const u = state.user;
    const isOwner = u.role === "owner";

    showPage("billing-page");

    $("#current-user").innerHTML = `${icon("user", 15)} ${esc(u.username)} · ${
      isOwner ? "ওনার" : "স্টাফ"
    }`;
    $$(".owner-only").forEach((el) => (el.style.display = isOwner ? "" : "none"));

    await Promise.all([loadProducts(), loadSettings()]);
    subscribeProducts();
    if (isOwner) loadStaffList();
    setView("billing");
  }

  function logout() {
    clearSession();
    state.user = null;
    state.cart = [];
    state.productChannel = null;
    try {
      if (state.supabase) state.supabase.removeAllChannels();
    } catch (e) {}
    showPage("login-page");
    $("#login-form").reset();
    $("#login-error").classList.add("hidden");
  }

  /* ---------------- PRODUCTS ---------------- */
  async function loadProducts() {
    if (!state.supabase) {
      renderProducts();
      return;
    }
    try {
      const rows = await q(state.supabase.from("products").select("*").order("name", { ascending: true }));
      state.products = rows || [];
    } catch (e) {
      console.error("loadProducts", e);
      toast("পণ্য লোড করা যায়নি", "error");
      state.products = [];
    }
    renderProducts();
  }

  function subscribeProducts() {
    if (!state.supabase || state.productChannel) return;
    try {
      state.productChannel = state.supabase
        .channel("products-live")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "products" },
          (payload) => {
            const e = payload.eventType;
            const row = payload.new;
            const old = payload.old;
            if (e === "DELETE") {
              if (old && old.id) state.products = state.products.filter((p) => p.id !== old.id);
            } else if (row && row.id) {
              const i = state.products.findIndex((p) => p.id === row.id);
              if (i >= 0) state.products[i] = { ...state.products[i], ...row };
              else state.products.push(row);
              state.products.sort((a, b) => String(a.name).localeCompare(String(b.name)));
            }
            renderProducts();
            toast("পণ্য তালিকা আপডেট হয়েছে", "info", 2000);
          }
        )
        .subscribe();
    } catch (e) {
      console.warn("realtime subscribe failed", e);
    }
  }

  const priceFor = (p, size) => Number(p["price_" + String(size).toLowerCase()] || 0) || 0;

  function renderProducts() {
    const wrap = $("#products-list");
    if (!wrap) return;
    const term = ($("#product-search").value || "").trim().toLowerCase();
    const list = term
      ? state.products.filter((p) => String(p.name || "").toLowerCase().includes(term))
      : state.products;

    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state">
        ${icon(term ? "search" : "cup", 56)}
        <p>${term ? "কোনো পণ্য পাওয়া যায়নি" : "এখনো কোনো পণ্য যোগ করা হয়নি"}</p>
      </div>`;
      return;
    }

    wrap.innerHTML = list
      .map((p) => {
        const sizes = ["S", "M", "L"]
          .map((s) => {
            const pr = priceFor(p, s);
            const dis = pr > 0 ? "" : "disabled";
            return `<button class="size-btn" ${dis} data-pid="${p.id}" data-size="${s}" data-price="${pr}">
              <span class="size-label">${s}</span>
              <span class="size-price">${pr > 0 ? money(pr) : "—"}</span>
            </button>`;
          })
          .join("");
        return `<div class="product-card" data-pid="${p.id}">
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
    else
      state.cart.push({
        key,
        pid,
        item: product.name,
        size,
        qty: 1,
        price: Number(price) || 0,
      });
    renderCart();
  }

  function changeQty(key, delta) {
    const i = state.cart.findIndex((l) => l.key === key);
    if (i < 0) return;
    state.cart[i].qty += delta;
    if (state.cart[i].qty <= 0) state.cart.splice(i, 1);
    renderCart();
  }

  function removeLine(key) {
    state.cart = state.cart.filter((l) => l.key !== key);
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
      wrap.innerHTML = `<div class="empty-cart">
        ${icon("cart", 48)}
        <p>কার্ট খালি</p>
        <span>পণ্য যোগ করতে সাইজ বাটনে চাপ দিন</span>
      </div>`;
      summary.style.display = "none";
      btn.disabled = true;
      return;
    }

    summary.style.display = "";
    btn.disabled = false;

    wrap.innerHTML = state.cart
      .map(
        (l) => `<div class="cart-item" data-key="${esc(l.key)}">
          <div class="cart-item-header">
            <div class="cart-item-info">
              <div class="cart-item-name">${esc(l.item)}</div>
              <div class="cart-item-size">সাইজ: ${esc(l.size)} · একক ${money(l.price)}</div>
            </div>
            <div class="cart-item-price">${money(l.qty * l.price)}</div>
            <button class="cart-item-remove" data-remove="${esc(l.key)}" aria-label="মুছুন">${icon(
              "trash",
              16
            )}</button>
          </div>
          <div class="cart-item-controls">
            <button class="qty-btn" data-dec="${esc(l.key)}" aria-label="কমান">${icon("minus", 14)}</button>
            <span class="qty-value">${l.qty}</span>
            <button class="qty-btn" data-inc="${esc(l.key)}" aria-label="বাড়ান">${icon("plus", 14)}</button>
            <div class="cart-item-subtotal">${money(l.qty * l.price)}</div>
          </div>
        </div>`
      )
      .join("");

    updateTotals();
  }

  function updateTotals() {
    const total = cartTotal();
    $("#grand-total").textContent = money(total);

    const paidRaw = $("#amount-paid").value;
    const paid = paidRaw === "" ? total : Number(paidRaw) || 0;
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

  /* ---------------- INVOICE NUMBER ---------------- */
  async function nextInvoiceNo() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const prefix = `${y}${m}${day}-`;

    let max = 0;
    try {
      const rows = await q(
        state.supabase
          .from("invoices")
          .select("invoice_no")
          .like("invoice_no", `${prefix}%`)
          .order("invoice_no", { ascending: false })
          .limit(1)
      );
      if (rows && rows[0] && rows[0].invoice_no) {
        const n = parseInt(String(rows[0].invoice_no).split("-")[1], 10);
        if (!isNaN(n)) max = n;
      }
    } catch (e) {
      console.warn("invoice counter fallback", e);
    }
    state.invoiceCounter = max + 1;
    return prefix + String(state.invoiceCounter).padStart(3, "0");
  }

  /* ---------------- COMPLETE BILL ---------------- */
  let saving = false;
  async function completeBill() {
    if (saving || !state.cart.length) return;
    const total = cartTotal();
    if (total <= 0) {
      toast("মোট টাকা শূন্য — পণ্য যোগ করুন", "warning");
      return;
    }
    const customer = ($("#customer-name").value || "").trim() || "Walk-in Customer";
    const paidRaw = $("#amount-paid").value;
    const paid = paidRaw === "" ? total : Number(paidRaw) || 0;
    const change = Math.round((paid - total) * 100) / 100;

    const confirmed = await confirmDialog(
      `মোট ${money(total)} টাকা — বিল সম্পন্ন করবেন?`,
      "বিল নিশ্চিত করুন"
    );
    if (!confirmed) return;

    saving = true;
    const btn = $("#complete-bill-btn");
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.innerHTML = `${icon("info", 18)} সেভ হচ্ছে...`;

    try {
      const invoice_no = await nextInvoiceNo();
      const now = new Date();

      const invoiceRow = {
        invoice_no,
        date_disp: todayStr(now),
        time_disp: nowTime(now),
        customer,
        seller: state.user.username,
        total,
        paid,
        change,
        created_at: now.toISOString(),
      };

      const items = state.cart.map((l) => ({
        invoice_no,
        item: l.item,
        size: l.size,
        qty: l.qty,
        price: l.price,
      }));

      const ins = await q(state.supabase.from("invoices").insert(invoiceRow).select());
      if (ins && ins[0] && ins[0].invoice_no) {
        invoiceRow.invoice_no = ins[0].invoice_no;
        items.forEach((i) => (i.invoice_no = ins[0].invoice_no));
      }
      await q(state.supabase.from("invoice_items").insert(items));

      state.cart = [];
      renderCart();
      $("#customer-name").value = "Walk-in Customer";
      $("#amount-paid").value = "0";

      const payload = { invoice: invoiceRow, items };
      if (state.settings.auto_print) {
        openReceipt(payload);
      } else {
        toast("বিল সেভ হয়েছে", "success");
      }
    } catch (e) {
      console.error("completeBill", e);
      toast("বিল সেভ করা যায়নি। আবার চেষ্টা করুন।", "error");
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
    const rows = items
      .map(
        (i) => `<tr>
        <td class="item-name">${esc(i.item)}${i.size ? ` <span class="item-size">(${esc(i.size)})</span>` : ""}</td>
        <td class="qty">${esc(i.qty)}</td>
        <td class="price">${money(i.price)}</td>
        <td class="subtotal">${money(Number(i.qty) * Number(i.price))}</td>
      </tr>`
      )
      .join("");

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
        <div><span>সার্ভড বাই</span><b>${esc(inv.seller)}</b></div>
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
        <div class="receipt-total-row"><span>${isDue ? "বাকি" : "ফেরত"}</span><span>${money(
      Math.abs(diff)
    )}</span></div>
      </div>
      ${
        s.show_thankyou
          ? `<div class="receipt-footer"><div class="receipt-thankyou">ধন্যবাদ, আবার আসবেন!</div></div>`
          : ""
      }`;
  }

  function openReceipt(payload) {
    const cont = $("#receipt-container");
    cont.innerHTML =
      receiptHTML(payload, state.settings) +
      `<div class="no-print" style="display:flex;gap:8px;margin-top:16px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" id="rp-print" style="flex:1;min-width:120px">${icon("print", 18)} প্রিন্ট করুন</button>
        <button class="btn btn-secondary" id="rp-close" style="flex:1;min-width:120px">${icon("back", 18)} ফিরে যান</button>
      </div>`;

    showPage("print-page");
    window.scrollTo(0, 0);

    $("#rp-print").onclick = () => doPrint();
    $("#rp-close").onclick = closePrint;

    // let layout settle before printing
    setTimeout(() => {
      if (state.settings.auto_print) doPrint();
    }, 250);
  }

  function closePrint() {
    showPage("billing-page");
    setView(state.view === "print" ? "billing" : state.view);
  }

  function doPrint() {
    window.print();
  }

  /* ---------------- TODAY'S BILLS ---------------- */
  async function loadStaffList() {
    if (!state.supabase) return;
    try {
      const rows = await q(state.supabase.from("employees").select("username").order("username"));
      state.staffList = (rows || []).map((r) => r.username);
      const sel = $("#staff-filter");
      const current = sel.value;
      sel.innerHTML =
        '<option value="all">সব স্টাফ</option>' +
        state.staffList.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
      sel.value = state.ownerFilter || current || "all";
    } catch (e) {
      console.warn("loadStaffList", e);
    }
  }

  async function loadTodayBills() {
    const list = $("#bills-list");
    list.innerHTML = `<div class="loading-state">লোড হচ্ছে...</div>`;
    if (!state.supabase) {
      list.innerHTML = `<div class="empty-state">${icon("alert", 48)}<p>সাপ্লাবেস সংযোগ নেই</p></div>`;
      return;
    }

    try {
      let query = state.supabase
        .from("invoices")
        .select("*")
        .eq("date_disp", todayStr())
        .order("created_at", { ascending: false });

      // staff -> own bills only; owner -> optionally filtered
      if (state.user.role !== "owner") query = query.eq("seller", state.user.username);
      else if (state.ownerFilter && state.ownerFilter !== "all")
        query = query.eq("seller", state.ownerFilter);

      const rows = (await q(query)) || [];
      renderBills(rows);
    } catch (e) {
      console.error("loadTodayBills", e);
      list.innerHTML = `<div class="empty-state">${icon("alert", 48)}<p>বিল লোড করা যায়নি</p></div>`;
    }
  }

  function renderBills(rows) {
    const list = $("#bills-list");
    if (!rows.length) {
      list.innerHTML = `<div class="empty-state">${icon("receipt", 56)}<p>আজ কোনো বিল পাওয়া যায়নি</p></div>`;
      return;
    }
    const isOwner = state.user.role === "owner";
    const grand = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

    list.innerHTML =
      `<div class="bill-card" style="background:var(--color-primary-bg);border-color:var(--color-primary)">
        <div class="bill-header" style="margin:0">
          <div><span class="bill-no">আজকের মোট বিল: ${rows.length}</span></div>
          <div class="bill-total" style="color:var(--color-primary)">${money(grand)}</div>
        </div>
      </div>` +
      rows
        .map(
          (r) => `<div class="bill-card" data-inv="${esc(r.invoice_no)}">
        <div class="bill-header">
          <div>
            <div class="bill-no">${esc(r.invoice_no)}</div>
            <div class="bill-time">${icon("info", 13)} ${esc(prettyTime(r.time_disp))}</div>
          </div>
          ${
            isOwner
              ? `<span class="bill-seller">${esc(r.seller)}</span>`
              : ""
          }
          <div class="bill-total">${money(r.total)}</div>
        </div>
        <div class="bill-customer">${icon("user", 13)} ${esc(r.customer || "Walk-in Customer")}</div>
        <div class="bill-actions">
          <button class="bill-btn primary" data-reprint="${esc(r.invoice_no)}">${icon("print", 15)} রিপ্রিন্ট</button>
        </div>
      </div>`
        )
        .join("");
  }

  async function reprint(invoiceNo) {
    try {
      const inv = (await q(state.supabase.from("invoices").select("*").eq("invoice_no", invoiceNo).limit(1)) || [])[0];
      if (!inv) return toast("বিল পাওয়া যায়নি", "error");
      const items =
        (await q(state.supabase.from("invoice_items").select("*").eq("invoice_no", invoiceNo).order("id"))) || [];
      openReceipt({ invoice: inv, items });
    } catch (e) {
      console.error("reprint", e);
      toast("রিপ্রিন্ট করা যায়নি", "error");
    }
  }

  /* ---------------- SETTINGS VIEW ---------------- */
  function fillSettings() {
    $("#shop-name").value = state.settings.shop_name || "";
    $("#shop-address").value = state.settings.shop_address || "";
    $("#shop-phone").value = state.settings.shop_phone || "";
    $("#auto-print").checked = !!state.settings.auto_print;
    $("#show-thankyou").checked = !!state.settings.show_thankyou;
  }

  async function saveSettingsForm(e) {
    e.preventDefault();
    state.settings = {
      shop_name: $("#shop-name").value.trim() || DEFAULT_SETTINGS.shop_name,
      shop_address: $("#shop-address").value.trim(),
      shop_phone: $("#shop-phone").value.trim(),
      auto_print: $("#auto-print").checked,
      show_thankyou: $("#show-thankyou").checked,
    };
    saveSettings();

    const msg = $("#settings-message");
    msg.className = "settings-message success";
    msg.textContent = "সেটিংস সেভ হয়েছে ✅";
    toast("সেটিংস সেভ হয়েছে", "success");
    setTimeout(() => msg.classList.add("hidden"), 3000);
  }

  /* ---------------- EVENT WIRING ---------------- */
  function wire() {
    $("#login-form").addEventListener("submit", handleLogin);

    $$(".toggle-password").forEach((b) =>
      b.addEventListener("click", () => {
        const inp = $("#password");
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        b.innerHTML = show ? icon("lock", 18) : icon("eye", 18);
        b.setAttribute("aria-label", show ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান");
      })
    );

    $("#menu-toggle").addEventListener("click", () => {
      const sb = $("#sidebar");
      if (sb.classList.contains("open")) closeSidebar();
      else openSidebar();
    });
    $("#sidebar-overlay").addEventListener("click", closeSidebar);

    $$(".nav-item").forEach((n) =>
      n.addEventListener("click", (ev) => {
        ev.preventDefault();
        const page = n.dataset.page;
        if (page === "settings" && state.user.role !== "owner") {
          toast("শুধুমাত্র ওনার এই পেজ দেখতে পারবেন", "warning");
          return;
        }
        if (page === "settings") fillSettings();
        setView(page);
      })
    );

    $("#logout-btn").addEventListener("click", async () => {
      if (cartCount() > 0) {
        const ok = await confirmDialog("কার্টে পণ্য আছে। তবুও লগ আউট করবেন?", "লগ আউট");
        if (!ok) return;
      }
      logout();
    });

    // products: search + size click (delegated)
    $("#product-search").addEventListener("input", renderProducts);
    $("#products-list").addEventListener("click", (e) => {
      const btn = e.target.closest(".size-btn");
      if (!btn || btn.disabled) return;
      addToCart(btn.dataset.pid, btn.dataset.size, btn.dataset.price);
    });

    // cart interactions (delegated)
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

    $("#staff-filter").addEventListener("change", (e) => {
      state.ownerFilter = e.target.value;
      loadTodayBills();
    });

    $("#settings-form").addEventListener("submit", saveSettingsForm);

    // keyboard shortcuts (desktop)
    document.addEventListener("keydown", (e) => {
      if (!$("#billing-page").classList.contains("active")) return;
      if (e.target.matches("input, textarea, select")) {
        if (e.key === "Escape") e.target.blur();
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        $("#product-search").focus();
      }
      if (e.key === "F4" && state.cart.length) {
        e.preventDefault();
        completeBill();
      }
    });

    // after print dialog closes, leave print view if auto-print was on
    window.addEventListener("afterprint", () => {
      if ($("#print-page").classList.contains("active") && state.settings.auto_print) closePrint();
    });
  }

  /* ---------------- BOOT ---------------- */
  function injectIcons() {
    const map = [
      ["#menu-toggle", "menu", 22],
      ["#logout-btn", "logout", 20],
      [".nav-item[data-page='billing'] .nav-icon", "billing", 20],
      [".nav-item[data-page='today-bills'] .nav-icon", "list", 20],
      [".nav-item[data-page='settings'] .nav-icon", "settings", 20],
      [".search-icon", "search", 17],
      [".toggle-password", "eye", 18],
    ];
    map.forEach(([sel, name, size]) => {
      const el = $(sel);
      if (el) el.innerHTML = icon(name, size);
    });

    // login form field icons: first = user, second = lock
    const fieldIcons = $$(".login-form .input-icon");
    if (fieldIcons[0]) fieldIcons[0].innerHTML = icon("user", 18);
    if (fieldIcons[1]) fieldIcons[1].innerHTML = icon("lock", 18);
  }

  function init() {
    loadSettings();
    initSupabase();
    wire();
    injectIcons();
    renderProducts();
    renderCart();

    if (restoreSession()) {
      enterApp().catch((e) => {
        console.error(e);
        logout();
      });
    } else {
      showPage("login-page");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.__LFJ_DEBUG = state;
})();
