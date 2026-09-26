/* /api/invoices — create, list, read, delete
   ------------------------------------------------------------
   Each invoice is its own KV key, and the day's invoice numbers
   live in a sorted set, so a sale writes only its own rows and
   two staff selling at the same moment never overwrite each other.

   client_id makes a sale idempotent: if the network drops mid-save
   and the client retries, the same bill is returned instead of a
   duplicate being created.
   */

const L = require("./_lib");
const auth = require("./_auth");
const { kv, KEYS } = L;

const MAX_LINES = 200;
const MAX_QTY = 9999;

const cidKey = (cid) => `lfj:cid:${cid}`;

/* the catalog price always wins, so a tampered client cannot set its own price */
async function resolvePrices(lines, user) {
  const products = (await kv.get(KEYS.products)) || [];
  return lines.map((l) => {
    const p = products.find(
      (x) => String(x.name).trim().toLowerCase() === l.item.toLowerCase()
    );
    let price = l.price;
    if (p) {
      const key = "price_" + String(l.size || "m").toLowerCase();
      if (typeof p[key] === "number") price = p[key];
    } else if (user.role !== "owner") {
      throw L.httpError(400, `"${l.item}" পণ্যটি তালিকায় নেই`);
    }
    return { ...l, price: L.nonNeg(price) };
  });
}

function readLines(body) {
  const raw = Array.isArray(body.lines) ? body.lines : [];
  if (!raw.length) throw L.httpError(400, "কার্ট খালি");
  if (raw.length > MAX_LINES) throw L.httpError(400, "এক বিলে অনেক বেশি আইটেম যোগ করা যায়নি");
  return raw
    .map((l) => ({
      item: L.str(l && l.item, 120),
      size: L.str(l && l.size, 10),
      qty: Math.min(MAX_QTY, Math.max(1, Math.round(Number(l && l.qty) || 1))),
      price: L.nonNeg(l && l.price),
    }))
    .filter((l) => l.item);
}

module.exports = L.handler(async (req, res) => {
  const user = await auth.requireAuth(req, res);
  if (!user) return;

  /* ---------------- read one (reprint) ---------------- */
  if (req.method === "GET" && req.query && req.query.no) {
    const no = L.str(req.query.no, 40);
    const inv = await kv.get(KEYS.inv(no));
    if (!inv) throw L.httpError(404, "বিল পাওয়া যায়নি");
    if (user.role !== "owner" && inv.seller !== user.username) {
      throw L.httpError(403, "এই বিলটি আপনার নয়");
    }
    return res.status(200).json(inv);
  }

  /* ---------------- list ---------------- */
  if (req.method === "GET") {
    const date = L.str((req.query && req.query.date) || L.dateDisp(), 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw L.httpError(400, "তারিখ ঠিক নয়");

    const nos = await kv.zrange(KEYS.idx(date), 0, -1, { rev: true });
    const rows = (await kv.mget(nos.map((no) => KEYS.inv(no))))
      .filter(Boolean)
      .filter((inv) => user.role === "owner" || inv.seller === user.username);

    return res.status(200).json({ date, invoices: rows });
  }

  /* ---------------- create ---------------- */
  if (req.method === "POST") {
    const body = await L.readBody(req);
    const clientId = L.str(body.client_id, 64);

    // a retry of a bill we already stored
    if (clientId) {
      const existingNo = await kv.get(cidKey(clientId));
      if (existingNo) {
        const existing = await kv.get(KEYS.inv(existingNo));
        if (existing) return res.status(200).json({ ...existing, duplicate: true });
      }
    }

    const lines = await resolvePrices(readLines(body), user);
    const total = Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;
    const paid = L.nonNeg(body.paid);
    const change = Math.round((paid - total) * 100) / 100;

    const now = new Date();
    const date = L.dateDisp(now);
    // atomic per-day counter: no two bills can ever share a number
    const seq = await kv.incr(KEYS.seq(L.ymd(now)));
    const invoice_no = `${L.ymd(now)}-${String(seq).padStart(3, "0")}`;

    const invoice = {
      invoice_no,
      client_id: clientId || null,
      date_disp: date,
      time_disp: L.timeDisp(now),
      customer: L.str(body.customer, 120) || "Walk-in Customer",
      seller: user.username,             // never taken from the client
      total,
      paid,
      change,
      created_at: now.toISOString(),
      items: lines.map((l, i) => ({ seq: i, ...l })),
    };

    await kv.set(KEYS.inv(invoice_no), invoice);
    await kv.zadd(KEYS.idx(date), now.getTime(), invoice_no);
    await kv.sadd(KEYS.allDates, date);
    if (clientId) await kv.set(cidKey(clientId), invoice_no, 60 * 60 * 24 * 90);

    return res.status(201).json(invoice);
  }

  /* ---------------- delete ---------------- */
  if (req.method === "DELETE") {
    const no = L.str((req.query && req.query.no) || (req.body && req.body.no), 40);
    if (!no) throw L.httpError(400, "বিল নম্বর দেওয়া হয়নি");
    const inv = await kv.get(KEYS.inv(no));
    if (!inv) throw L.httpError(404, "বিল পাওয়া যায়নি");
    if (user.role !== "owner" && inv.seller !== user.username) {
      throw L.httpError(403, "শুধু মালিক অথবা বিলের মালিক এই বিলটি মুছতে পারবেন");
    }
    await kv.del(KEYS.inv(no));
    await kv.zrem(KEYS.idx(inv.date_disp), no);
    if (inv.client_id) await kv.del(cidKey(inv.client_id));
    return res.status(200).json({ ok: true, invoice_no: no });
  }

  throw L.httpError(405, "অনুরোধটি ঠিক নয়");
});
