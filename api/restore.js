/* POST /api/restore — replace bills, products and settings from a backup
   file. Owner only.
   ------------------------------------------------------------
   Two steps on purpose:
     ?dry_run=1  validates and reports what is in the file
     (no query)  actually replaces the data

   Staff accounts are deliberately NOT restored. Password hashes are never
   written into a backup file, and replacing accounts from a file could lock
   every owner out of the shop. Accounts live on the server and stay there.
   ========================================================== */

const L = require("./_lib");
const auth = require("./_auth");
const { kv, KEYS } = L;

const DATES_KEY = KEYS.allDates;

/** every date that currently holds invoices, tracked in a set */
async function knownDates() {
  const dates = await kv.smembers(DATES_KEY);
  if (dates.length) return dates;
  // older data written before this set existed: find the indexes we know about
  return [];
}

async function clearInvoices() {
  const dates = await knownDates();
  const batch = [];
  for (const date of dates) {
    const nos = await kv.zrange(KEYS.idx(date), 0, -1);
    for (const no of nos) batch.push(["DEL", KEYS.inv(no)]);
    batch.push(["DEL", KEYS.idx(date)]);
  }
  batch.push(["DEL", DATES_KEY]);
  if (batch.length) await kv.pipeline(batch);
}

/** strict validation — refuse anything that is not really one of our backups */
function parseBackup(body) {
  if (!body || typeof body !== "object") throw L.httpError(400, "ফাইলটি বৈধ নয়");
  if (!("invoices" in body) && !("products" in body)) {
    throw L.httpError(400, "ফাইলে বিল বা পণ্যের তালিকা নেই — সম্ভবত সঠিক ব্যাকআপ নয়");
  }

  const products = (Array.isArray(body.products) ? body.products : [])
    .filter((p) => p && p.name)
    .map((p, i) => ({
      id: L.str(p.id, 64) || `restored-p-${i}`,
      name: L.str(p.name, 120),
      price_s: L.nonNeg(p.price_s),
      price_m: L.nonNeg(p.price_m),
      price_l: L.nonNeg(p.price_l),
      updated_at: p.updated_at || new Date().toISOString(),
    }));

  // the backup format keeps items in a separate array
  const itemsByInvoice = new Map();
  for (const it of Array.isArray(body.invoice_items) ? body.invoice_items : []) {
    if (!it || !it.invoice_no) continue;
    if (!itemsByInvoice.has(it.invoice_no)) itemsByInvoice.set(it.invoice_no, []);
    itemsByInvoice.get(it.invoice_no).push({
      seq: typeof it.seq === "number" ? it.seq : itemsByInvoice.get(it.invoice_no).length,
      item: L.str(it.item, 120),
      size: L.str(it.size, 10),
      qty: Math.max(1, Math.round(Number(it.qty) || 1)),
      price: L.nonNeg(it.price),
    });
  }

  const invoices = (Array.isArray(body.invoices) ? body.invoices : [])
    .filter((r) => r && r.invoice_no && r.date_disp)
    .map((r) => {
      const no = L.str(r.invoice_no, 40);
      const date = L.str(r.date_disp, 10);
      // a bill with an unusable date could not be filed or found again, so the
      // whole file is refused rather than quietly losing that sale
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw L.httpError(400, `বিল "${no}"-এর তারিখ ঠিক নয় (${date || "খালি"})`);
      }
      return {
        invoice_no: no,
        date_disp: date,
        time_disp: L.str(r.time_disp, 10),
        customer: L.str(r.customer, 120) || "Walk-in Customer",
        seller: L.str(r.seller, 40),
        total: L.nonNeg(r.total),
        paid: L.nonNeg(r.paid),
        change: L.str(r.change, 20) === "" ? 0 : Number(r.change) || 0,
        created_at: r.created_at || new Date().toISOString(),
        items: (itemsByInvoice.get(no) || []).sort((a, b) => a.seq - b.seq),
      };
    });

  const settings = L.cleanSettings({ ...L.DEFAULT_SETTINGS, ...(body.settings || {}) });

  const seen = new Set();
  for (const inv of invoices) {
    if (seen.has(inv.invoice_no)) throw L.httpError(400, `ফাইলে "${inv.invoice_no}" নম্বর দুইবার আছে`);
    seen.add(inv.invoice_no);
  }

  return { settings, products, invoices };
}

module.exports = L.handler(async (req, res) => {
  const user = await auth.requireAuth(req, res, "owner");
  if (!user) return;
  if (req.method !== "POST") throw L.httpError(405, "অনুরোধটি ঠিক নয়");

  const data = parseBackup(await L.readBody(req));
  const currentStaff = (await kv.get(KEYS.staff)) || [];

  const summary = {
    products: data.products.length,
    invoices: data.invoices.length,
    lines: data.invoices.reduce((s, i) => s + i.items.length, 0),
    dates: [...new Set(data.invoices.map((i) => i.date_disp))].length,
    staff_kept: currentStaff.length,
  };

  if (String((req.query && req.query.dry_run) || "") === "1") {
    return res.status(200).json({ ok: true, dry_run: true, ...summary });
  }

  await clearInvoices();

  // one round trip: every bill, plus the day's index entry
  const batch = [
    ["SET", KEYS.settings, JSON.stringify(data.settings)],
    ["SET", KEYS.products, JSON.stringify(data.products)],
  ];
  const byDate = new Map();
  for (const inv of data.invoices) {
    batch.push(["SET", KEYS.inv(inv.invoice_no), JSON.stringify(inv)]);
    if (!byDate.has(inv.date_disp)) byDate.set(inv.date_disp, []);
    byDate.get(inv.date_disp).push(inv);
  }
  for (const [date, invs] of byDate) {
    for (const inv of invs) {
      batch.push(["ZADD", KEYS.idx(date), String(Date.parse(inv.created_at) || Date.now()), JSON.stringify(inv.invoice_no)]);
    }
    batch.push(["SADD", DATES_KEY, date]);
  }
  await kv.pipeline(batch);

  return res.status(200).json({ ok: true, restored: true, ...summary });
});

module.exports.parseBackup = parseBackup;
module.exports.DATES_KEY = DATES_KEY;
