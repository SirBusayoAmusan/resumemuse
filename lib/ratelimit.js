// Fixed-window rate limiting, per IP, two windows (burst + hourly).
//
// If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, counters live
// in Upstash and survive across serverless instances and cold starts. That is
// the configuration you want in production.
//
// If they are not set, we fall back to an in-memory counter. That still stops a
// single warm instance from being hammered, but each instance counts on its own,
// so it is best treated as a safety net for local dev and early beta, not a wall.

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const BURST = int(process.env.RATE_LIMIT_BURST, 8);       // requests per minute
const HOURLY = int(process.env.RATE_LIMIT_HOURLY, 100);   // requests per hour

function int(v, d) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : d;
}

/* ---------- Upstash (durable) ---------- */
async function upstashHit(ip, limit, windowSec, tag) {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `rl:${tag}:${ip}:${bucket}`;
  const res = await fetch(`${URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    // INCR the counter, then set an expiry only if one is not already set (NX).
    body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowSec, 'NX']]),
  });
  if (!res.ok) throw new Error('upstash ' + res.status);
  const data = await res.json();
  const count = (data && data[0] && data[0].result) || 0;
  return { ok: count <= limit, count };
}

/* ---------- In-memory (fallback) ---------- */
const mem = new Map();
function memHit(ip, limit, windowSec, tag) {
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${tag}:${ip}:${bucket}`;
  const count = (mem.get(key) || 0) + 1;
  mem.set(key, count);
  // Opportunistic cleanup so the Map cannot grow without bound.
  if (mem.size > 5000) {
    for (const k of mem.keys()) {
      mem.delete(k);
      if (mem.size < 2500) break;
    }
  }
  return { ok: count <= limit, count };
}

export async function rateLimit(ip) {
  const durable = Boolean(URL && TOKEN);
  const rules = [
    { tag: 'm', limit: BURST, win: 60 },
    { tag: 'h', limit: HOURLY, win: 3600 },
  ];
  for (const r of rules) {
    let res;
    try {
      res = durable
        ? await upstashHit(ip, r.limit, r.win, r.tag)
        : memHit(ip, r.limit, r.win, r.tag);
    } catch {
      // If Upstash is down we do not want to lock everyone out. Degrade to memory.
      res = memHit(ip, r.limit, r.win, r.tag);
    }
    if (!res.ok) return { allowed: false, retryAfter: r.win, scope: r.tag };
  }
  return { allowed: true };
}
