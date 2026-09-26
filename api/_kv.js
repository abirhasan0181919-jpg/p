/* ==========================================================
   Live Fruit Juice — Vercel KV (Upstash Redis) client
   ------------------------------------------------------------
   Talks to the Upstash REST API with plain fetch, so the
   project needs NO npm dependencies and NO build step.

   Env vars (Vercel dashboard → Settings → Environment Variables):
     KV_REST_API_URL     https://....upstash.io
     KV_REST_API_TOKEN   xxxx
   ========================================================== */

const KV_URL = (process.env.KV_REST_API_URL || "").replace(/\/+$/, "");
const KV_TOKEN = process.env.KV_REST_API_TOKEN || "";

/** is the database configured? handlers use this to fail loudly, not silently */
const isConfigured = () => Boolean(KV_URL && KV_TOKEN);

class KvError extends Error {
  constructor(message, status, expose) {
    super(message);
    this.name = "KvError";
    this.status = status || 500;
    // setup problems must show their real text so the owner can fix the env vars;
    // everything else stays generic so internals are never leaked
    this.expose = Boolean(expose);
  }
}

const NOT_CONFIGURED = () =>
  new KvError(
    "ডেটাবেস কনফিগার করা নেই — Vercel-এ KV_REST_API_URL ও KV_REST_API_TOKEN সেট করুন",
    503,
    true
  );

/* ---------- low level ---------- */

async function command(args) {
  if (!isConfigured()) throw NOT_CONFIGURED();
  const res = await fetch(`${KV_URL}/${args.map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new KvError(`KV অনুরোধ ব্যর্থ (${res.status}): ${text.slice(0, 200)}`, 502);
  }

  const body = await res.json().catch(() => null);
  if (body && body.error) throw new KvError(`KV ত্রুটি: ${String(body.error).slice(0, 200)}`, 500);
  return body ? body.result : null;
}

/** run many commands in one round trip (atomic on the server) */
async function pipeline(list) {
  if (!isConfigured()) throw NOT_CONFIGURED();
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(list),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new KvError(`KV পাইপলাইন ব্যর্থ (${res.status}): ${text.slice(0, 200)}`, 502);
  }
  const body = await res.json().catch(() => null);
  if (!Array.isArray(body)) throw new KvError("KV পাইপলাইনের উত্তর অপ্রত্যাশিত", 502);
  for (const step of body) {
    if (step && step.error) throw new KvError(`KV ত্রুটি: ${String(step.error).slice(0, 200)}`, 500);
  }
  return body.map((s) => (s ? s.result : null));
}

/* ---------- json helpers ---------- *
   Values are stored as JSON strings so shapes stay exact.
   ============================================ */

const enc = (v) => JSON.stringify(v === undefined ? null : v);
const dec = (v) => {
  if (v === null || v === undefined) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
};

async function get(key) {
  return dec(await command(["GET", key]));
}

async function mget(keys) {
  if (!keys.length) return [];
  const res = await command(["MGET", ...keys]);
  return (Array.isArray(res) ? res : []).map(dec);
}

/** set a value, optionally with a TTL in seconds */
async function set(key, value, ttlSeconds) {
  const args = ttlSeconds ? ["SET", key, enc(value), "EX", String(ttlSeconds)] : ["SET", key, enc(value)];
  await command(args);
  return value;
}

async function del(...keys) {
  const flat = keys.flat();
  if (!flat.length) return 0;
  return command(["DEL", ...flat]);
}

/** atomic counter — the reason invoice numbers never collide on a busy counter */
async function incr(key) {
  const n = await command(["INCR", key]);
  return Number(n) || 0;
}

async function rpush(key, value) {
  return command(["RPUSH", key, enc(value)]);
}

async function lrange(key, start, stop) {
  const res = await command(["LRANGE", key, String(start), String(stop)]);
  return (Array.isArray(res) ? res : []).map(dec);
}

/** fetch a sorted-set range as parsed values (used for bill indexes) */
async function zrange(key, start, stop, opts) {
  const args = ["ZRANGE", key, String(start), String(stop)];
  if (opts && opts.rev) args.push("REV");
  const res = await command(args);
  return (Array.isArray(res) ? res : []).map((v) =>
    typeof v === "string" ? dec(v) : v
  );
}

async function zadd(key, score, member) {
  return command(["ZADD", key, String(score), enc(member)]);
}

async function zrem(key, member) {
  return command(["ZREM", key, enc(member)]);
}

async function expire(key, ttlSeconds) {
  return command(["EXPIRE", key, String(ttlSeconds)]);
}

async function sadd(key, ...members) {
  if (!members.length) return 0;
  return command(["SADD", key, ...members.map(String)]);
}

async function smembers(key) {
  const res = await command(["SMEMBERS", key]);
  return Array.isArray(res) ? res.map(String) : [];
}

async function srem(key, ...members) {
  if (!members.length) return 0;
  return command(["SREM", key, ...members.map(String)]);
}

async function ttl(key) {
  return Number(await command(["TTL", key])) || 0;
}

async function exists(key) {
  return (Number(await command(["EXISTS", key])) || 0) > 0;
}

module.exports = {
  isConfigured, KvError,
  command, pipeline,
  get, mget, set, del, incr,
  rpush, lrange, zadd, zrange, zrem, expire, ttl, exists,
  sadd, smembers, srem,
};
