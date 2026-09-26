/* GET /api/bootstrap — everything the app needs to start, in one request.
   Four separate calls would be four round trips on a slow shop connection. */

const L = require("./_lib");
const auth = require("./_auth");
const { kv, KEYS } = L;

module.exports = L.handler(async (req, res) => {
  const user = await auth.requireAuth(req, res);
  if (!user) return;
  if (req.method !== "GET") throw L.httpError(405, "অনুরোধটি ঠিক নয়");

  await L.ensureSeeded(auth);

  const date = L.str((req.query && req.query.date) || L.dateDisp(), 10);
  const staff = (await kv.get(KEYS.staff)) || [];
  const products = (await kv.get(KEYS.products)) || [];
  const settings = (await kv.get(KEYS.settings)) || L.DEFAULT_SETTINGS;

  // one round trip: the day's numbers, then the bills themselves
  const nos = await kv.zrange(KEYS.idx(date), 0, -1, { rev: true });
  const invoices = (await kv.mget(nos.map((no) => KEYS.inv(no))))
    .filter(Boolean)
    .filter((inv) => user.role === "owner" || inv.seller === user.username);

  // keep the date index self-healing, so a later full restore can find every bill
  kv.sadd(KEYS.allDates, date).catch(() => {});

  return res.status(200).json({
    user,
    date,
    settings,
    products,
    staff: staff.map(L.publicStaff),
    invoices,
    server_time: new Date().toISOString(),
  });
});
