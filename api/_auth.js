/* ==========================================================
   Live Fruit Juice — server auth
   ------------------------------------------------------------
   Passwords: scrypt (node:crypto, no dependencies) with a
   per-user random salt. Old SHA-256 hashes from the local-only
   version are accepted once and transparently upgraded.

   Sessions: random 32-byte token in an httpOnly cookie; only
   the SHA-256 of the token is stored in KV, so a database dump
   cannot be replayed as a login.
   ========================================================== */

const crypto = require("crypto");
const kv = require("./_kv");

const COOKIE = "lfj_session";
const SESSION_TTL = 30 * 24 * 3600;      // 30 days
const LOGIN_WINDOW = 15 * 60;            // brute-force window
const LOGIN_MAX = 8;                    // tries per window, per user+ip

/* ---------- password hashing ---------- */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p,
    salt.toString("base64"), key.toString("base64"),
  ].join("$");
}

function verifyPassword(password, stored) {
  const raw = String(stored || "");
  // legacy single-hash accounts created by the browser-only version
  if (!raw.startsWith("scrypt$")) {
    const legacy = crypto
      .createHash("sha256")
      .update("livefruitjuice_salt_" + String(password))
      .digest("hex");
    const a = Buffer.from(legacy);
    const b = Buffer.from(raw.toLowerCase());
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? "legacy" : false;
  }
  const [, N, r, p, saltB64, keyB64] = raw.split("$");
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
      ? "scrypt"
      : false;
  } catch (e) {
    return false;
  }
}

const needsRehash = (stored) => !String(stored || "").startsWith("scrypt$");

/* ---------- cookies ---------- */

function parseCookies(req) {
  const out = {};
  const raw = (req && req.headers && req.headers.cookie) || "";
  for (const part of String(raw).split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAge) {
  const bits = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV !== "development") bits.push("Secure");
  return bits.join("; ");
}

const clearCookie = () => sessionCookie("", 0);

/* ---------- sessions ---------- */

const tokenKey = (token) => "lfj:sess:" + crypto.createHash("sha256").update(token).digest("hex");
const sessionIndexKey = (username) => `lfj:sessidx:${username}`;

async function createSession(res, user) {
  const token = crypto.randomBytes(32).toString("base64url");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  await kv.set(tokenKey(token), { username: user.username, role: user.role, at: Date.now() }, SESSION_TTL);

  // keep an index so a renamed/disabled account can have its sessions revoked
  try {
    const index = (await kv.get(sessionIndexKey(user.username))) || [];
    if (!index.includes(hash)) index.push(hash);
    // cap the index so it cannot grow forever on a busy till
    await kv.set(sessionIndexKey(user.username), index.slice(-40), SESSION_TTL * 2);
  } catch (e) {
    console.error("[auth] session index write failed", e.message);
  }

  res.setHeader("Set-Cookie", sessionCookie(token, SESSION_TTL));
  return { username: user.username, role: user.role };
}

async function destroySession(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) await kv.del(tokenKey(token)).catch(() => {});
  res.setHeader("Set-Cookie", clearCookie());
}

/** resolve the signed-in user, or null */
async function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const sess = await kv.get(tokenKey(token));
  if (!sess || !sess.username) return null;
  // a disabled or deleted account must lose its live sessions immediately
  const staff = (await kv.get("lfj:staff")) || [];
  const emp = staff.find((e) => e.username === sess.username && e.active !== false);
  if (!emp) {
    await kv.del(tokenKey(token)).catch(() => {});
    return null;
  }
  return { username: emp.username, role: emp.role === "owner" ? "owner" : "staff" };
}

/* ---------- brute force protection ---------- */

function clientIp(req) {
  const fwd = (req && req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"])) || "";
  return String(fwd).split(",")[0].trim() || "unknown";
}

async function loginThrottle(username, req) {
  const key = `lfj:try:${username.toLowerCase()}:${clientIp(req)}`;
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, LOGIN_WINDOW);
  return n <= LOGIN_MAX;
}

async function clearLoginThrottle(username, req) {
  await kv.del(`lfj:try:${username.toLowerCase()}:${clientIp(req)}`).catch(() => {});
}

/* ---------- guards ---------- */

/** returns the user, or writes a 401/403 and returns null */
async function requireAuth(req, res, role) {
  let user;
  try {
    user = await currentUser(req);
  } catch (e) {
    // a missing/misconfigured database must tell the operator what to fix
    if (e && e.expose) throw e;
    res.status(503).json({ error: "সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন" });
    return null;
  }
  if (!user) {
    res.status(401).json({ error: "লগইন করা নেই" });
    return null;
  }
  if (role === "owner" && user.role !== "owner") {
    res.status(403).json({ error: "শুধু মালিক এই কাজটি করতে পারবেন" });
    return null;
  }
  return user;
}

module.exports = {
  COOKIE, SESSION_TTL, tokenKey, sessionIndexKey,
  hashPassword, verifyPassword, needsRehash,
  parseCookies, sessionCookie, clearCookie,
  createSession, destroySession, currentUser, requireAuth,
  loginThrottle, clearLoginThrottle,
};
