/* /api/settings — shop name, address, receipt options. Owner-only writes. */

const L = require("./_lib");
const auth = require("./_auth");
const { kv, KEYS } = L;

module.exports = L.handler(async (req, res) => {
  const user = await auth.requireAuth(req, res);
  if (!user) return;
  await L.ensureSeeded(auth);

  if (req.method === "GET") {
    return res.status(200).json({ settings: (await kv.get(KEYS.settings)) || L.DEFAULT_SETTINGS });
  }

  if (user.role !== "owner") throw L.httpError(403, "শুধু মালিক সেটিংস পরিবর্তন করতে পারবেন");
  if (req.method !== "PUT" && req.method !== "POST") throw L.httpError(405, "অনুরোধটি ঠিক নয়");

  const body = await L.readBody(req);
  const current = (await kv.get(KEYS.settings)) || L.DEFAULT_SETTINGS;
  const settings = L.cleanSettings({ ...current, ...body });
  await kv.set(KEYS.settings, settings);
  return res.status(200).json({ settings });
});
