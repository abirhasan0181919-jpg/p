/* POST /api/auth — login, logout, session check */

const L = require("./_lib");
const auth = require("./_auth");
const { kv } = L;

module.exports = L.handler(async (req, res) => {
  const action = String((req.query && req.query.action) || "").toLowerCase();

  /* who am I? */
  if (req.method === "GET" || action === "me") {
    const user = await auth.currentUser(req);
    if (!user) return res.status(200).json({ user: null, seeded: false });
    await L.ensureSeeded(auth);
    return res.status(200).json({ user, seeded: false });
  }

  if (req.method !== "POST") throw L.httpError(405, "অনুরোধটি ঠিক নয়");

  /* logout */
  if (action === "logout") {
    await auth.destroySession(req, res);
    return res.status(200).json({ user: null });
  }

  /* login */
  if (action && action !== "login") throw L.httpError(400, "অজানা কাজ");

  const body = await L.readBody(req);
  const username = L.str(body.username, 40);
  const password = String(body.password || "");
  if (!username || !password) throw L.httpError(400, "ইউজারনেম ও পাসওয়ার্ড লিখুন");

  if (!(await auth.loginThrottle(username, req))) {
    throw L.httpError(429, "অনেকবার ভুল চেষ্টা হয়েছে, কিছুক্ষণ পরে আবার চেষ্টা করুন");
  }

  await L.ensureSeeded(auth);
  const staff = (await kv.get(L.KEYS.staff)) || [];
  const emp = staff.find(
    (e) => String(e.username).toLowerCase() === username.toLowerCase() && e.active !== false
  );

  /* same message either way — never reveal which half was wrong */
  const bad = L.httpError(401, "ইউজারনেম বা পাসওয়ার্ড ভুল");
  if (!emp) throw bad;
  if (!auth.verifyPassword(password, emp.password_hash)) throw bad;

  /* first login after migrating from the browser-only version: upgrade the hash */
  if (auth.needsRehash(emp.password_hash)) {
    emp.password_hash = auth.hashPassword(password);
    emp.hash_upgraded_at = new Date().toISOString();
    const next = staff.map((e) => (e.username === emp.username ? emp : e));
    await kv.set(L.KEYS.staff, next);
  }

  await auth.clearLoginThrottle(username, req);
  const user = await auth.createSession(res, emp);
  return res.status(200).json({ user });
});
