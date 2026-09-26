/* /api/staff — owner-only management.
   Passwords are hashed here and never sent back to the browser. */

const L = require("./_lib");
const auth = require("./_auth");
const { kv, KEYS } = L;

const MIN_PASSWORD = 4;

module.exports = L.handler(async (req, res) => {
  const user = await auth.requireAuth(req, res);
  if (!user) return;
  await L.ensureSeeded(auth);

  /* everyone may see the staff list (the bills screen filters by seller) */
  if (req.method === "GET") {
    const staff = (await kv.get(KEYS.staff)) || [];
    return res.status(200).json({ staff: staff.map(L.publicStaff) });
  }

  if (user.role !== "owner") throw L.httpError(403, "শুধু মালিক স্টাফ পরিবর্তন করতে পারবেন");

  const staff = (await kv.get(KEYS.staff)) || [];
  const now = new Date().toISOString();

  if (req.method === "POST") {
    const body = await L.readBody(req);
    const username = L.str(body.username, 40);
    const password = String(body.password || "");
    const role = body.role === "owner" ? "owner" : "staff";
    if (!username) throw L.httpError(400, "ইউজারনেম লিখুন");
    if (password.length < MIN_PASSWORD) {
      throw L.httpError(400, `পাসওয়ার্ড কমপক্ষে ${MIN_PASSWORD} অক্ষরের হতে হবে`);
    }
    if (staff.some((e) => String(e.username).toLowerCase() === username.toLowerCase())) {
      throw L.httpError(400, "এই ইউজারনেম আগে থেকেই আছে");
    }
    const emp = {
      id: L.uid(),
      username,
      password_hash: auth.hashPassword(password),
      role,
      active: true,
      created_at: now,
    };
    await kv.set(KEYS.staff, staff.concat([emp]));
    return res.status(201).json({ employee: L.publicStaff(emp) });
  }

  if (req.method === "PUT") {
    const body = await L.readBody(req);
    const id = L.str(body.id, 64);
    const i = staff.findIndex((e) => e.id === id);
    if (i < 0) throw L.httpError(404, "স্টাফ পাওয়া যায়নি");
    const prev = staff[i];
    const next = { ...prev };

    if (body.username !== undefined) {
      const username = L.str(body.username, 40);
      if (!username) throw L.httpError(400, "ইউজারনেম খালি রাখা যাবে না");
      if (staff.some((e) => e.id !== id && String(e.username).toLowerCase() === username.toLowerCase())) {
        throw L.httpError(400, "এই ইউজারনেম আগে থেকেই আছে");
      }
      next.username = username;
    }
    if (body.password) {
      const password = String(body.password);
      if (password.length < MIN_PASSWORD) {
        throw L.httpError(400, `পাসওয়ার্ড কমপক্ষে ${MIN_PASSWORD} অক্ষরের হতে হবে`);
      }
      next.password_hash = auth.hashPassword(password);
      next.password_changed_at = now;
    }
    if (body.active !== undefined) {
      const active = Boolean(body.active);
      /* never let the last usable owner lock everyone out */
      if (!active && prev.role === "owner") {
        const owners = staff.filter((e) => e.role === "owner" && e.active !== false);
        if (owners.length <= 1) throw L.httpError(400, "শেষ মালিককে নিষ্ক্রিয় করা যাবে না");
      }
      next.active = active;
    }

    const list = staff.slice();
    list[i] = next;
    await kv.set(KEYS.staff, list);

    // changing a username or disabling an account must not leave live sessions behind
    if (next.username !== prev.username || next.active === false) {
      await invalidateSessions(next.username);
    }
    return res.status(200).json({ employee: L.publicStaff(next) });
  }

  if (req.method === "DELETE") {
    const id = L.str((req.query && req.query.id) || (req.body && req.body.id), 64);
    const target = staff.find((e) => e.id === id);
    if (!target) throw L.httpError(404, "স্টাফ পাওয়া যায়নি");
    if (target.username === user.username) {
      throw L.httpError(400, "নিজের অ্যাকাউন্ট মুছে ফেলা যাবে না");
    }
    if (target.role === "owner") {
      const owners = staff.filter((e) => e.role === "owner" && e.active !== false);
      if (owners.length <= 1) throw L.httpError(400, "শেষ মালিককে মুছে ফেলা যাবে না");
    }
    await kv.set(KEYS.staff, staff.filter((e) => e.id !== id));
    await invalidateSessions(target.username);
    return res.status(200).json({ ok: true, id });
  }

  throw L.httpError(405, "অনুরোধটি ঠিক নয়");
});

/** drop every stored session belonging to a username */
async function invalidateSessions(username) {
  // sessions are keyed by token hash, so we keep a per-user index of token hashes
  const index = (await kv.get(`lfj:sessidx:${username}`)) || [];
  if (index.length) await kv.del(...index.map((h) => `lfj:sess:${h}`));
  await kv.del(`lfj:sessidx:${username}`);
}
