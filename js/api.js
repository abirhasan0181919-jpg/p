/* ==========================================================
   Live Fruit Juice — API client
   ------------------------------------------------------------
   Thin wrapper over fetch for the /api endpoints. The session is
   an httpOnly cookie set by the server, so nothing secret is ever
   kept in JavaScript.

   Two failure modes are handled differently on purpose:

     network failure / server unreachable  ->  "offline"
     the server said no (401, 400, 403...) ->  a real error

   Only the first kind is retried, so a rejected sale is never
   silently retried into a duplicate.
   ========================================================== */

(function (global) {
  "use strict";

  const TIMEOUT = 12000;

  /** an error the server deliberately returned */
  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.name = "ApiError";
      this.status = status;
    }
  }
  /** the server could not be reached at all — worth retrying later */
  class OfflineError extends Error {
    constructor(message) {
      super(message || "সার্ভারের সাথে সংযোগ নেই");
      this.name = "OfflineError";
      this.offline = true;
    }
  }

  async function request(method, path, body, opts) {
    const o = opts || {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), o.timeout || TIMEOUT);

    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      // aborted, DNS failure, no connection, CORS — all mean "try later"
      throw new OfflineError();
    } finally {
      clearTimeout(timer);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      if (!res.ok) throw new ApiError("সার্ভার থেকে ঠিক উত্তর আসেনি", res.status);
    }

    if (!res.ok) {
      // 5xx from our own handlers can be transient (cold start, KV blip)
      if (res.status >= 500) {
        const err = new OfflineError((data && data.error) || "সার্ভারে সমস্যা হয়েছে");
        err.status = res.status;
        err.serverMessage = data && data.error;
        throw err;
      }
      throw new ApiError((data && data.error) || "অনুরোধটি ব্যর্থ হয়েছে", res.status);
    }
    return data;
  }

  const qs = (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj || {})) {
      if (v !== undefined && v !== null && v !== "") p.set(k, v);
    }
    const s = p.toString();
    return s ? "?" + s : "";
  };

  global.API = {
    ApiError,
    OfflineError,

    me: () => request("GET", "/api/auth"),
    login: (username, password) =>
      request("POST", "/api/auth?action=login", { username, password }),
    logout: () => request("POST", "/api/auth?action=logout", {}),

    bootstrap: (date) => request("GET", "/api/bootstrap" + qs({ date })),

    listInvoices: (date) => request("GET", "/api/invoices" + qs({ date })),
    getInvoice: (no) => request("GET", "/api/invoices" + qs({ no })),
    createInvoice: (body) => request("POST", "/api/invoices", body, { timeout: 20000 }),
    deleteInvoice: (no) => request("DELETE", "/api/invoices" + qs({ no })),

    saveProducts: (method, body) => request(method, "/api/products", body),
    deleteProduct: (id) => request("DELETE", "/api/products" + qs({ id })),

    saveStaff: (method, body) => request(method, "/api/staff", body),
    deleteStaff: (id) => request("DELETE", "/api/staff" + qs({ id })),

    saveSettings: (body) => request("PUT", "/api/settings", body),

    /** validate a backup file without changing anything */
    restoreDryRun: (backup) => request("POST", "/api/restore?dry_run=1", backup, { timeout: 30000 }),
    /** actually replace products, settings and bills from a backup file */
    restore: (backup) => request("POST", "/api/restore", backup, { timeout: 60000 }),
  };
})(typeof window !== "undefined" ? window : this);
