/* /api/products — owner-only management, staff read-only */

const L = require("./_lib");
const auth = require("./_auth");
const { kv, KEYS } = L;

module.exports = L.handler(async (req, res) => {
  const user = await auth.requireAuth(req, res);
  if (!user) return;
  await L.ensureSeeded(auth);

  if (req.method === "GET") {
    return res.status(200).json({ products: (await kv.get(KEYS.products)) || [] });
  }

  /* everything below changes the catalog, so owner only */
  if (user.role !== "owner") throw L.httpError(403, "শুধু মালিক পণ্য পরিবর্তন করতে পারবেন");

  const products = (await kv.get(KEYS.products)) || [];
  const now = new Date().toISOString();

  if (req.method === "POST") {
    const body = await L.readBody(req);
    const clean = L.cleanProduct(body);
    const product = { id: L.uid(), ...clean, updated_at: now };
    const next = products.concat([product]);
    await kv.set(KEYS.products, next);
    return res.status(201).json({ product });
  }

  if (req.method === "PUT") {
    const body = await L.readBody(req);
    const id = L.str(body.id, 64);
    const i = products.findIndex((p) => p.id === id);
    if (i < 0) throw L.httpError(404, "পণ্য পাওয়া যায়নি");
    const product = { ...products[i], ...L.cleanProduct(body), id, updated_at: now };
    const next = products.slice();
    next[i] = product;
    await kv.set(KEYS.products, next);
    return res.status(200).json({ product });
  }

  if (req.method === "DELETE") {
    const id = L.str((req.query && req.query.id) || (req.body && req.body.id), 64);
    const next = products.filter((p) => p.id !== id);
    if (next.length === products.length) throw L.httpError(404, "পণ্য পাওয়া যায়নি");
    await kv.set(KEYS.products, next);
    return res.status(200).json({ ok: true, id });
  }

  throw L.httpError(405, "অনুরোধটি ঠিক নয়");
});
