// lib/http.js
// Helper umum untuk Vercel Serverless Functions (Node runtime, req/res mirip Express
// tapi tanpa middleware bawaan).

const config = require("./config");

/**
 * Pasang header CORS + security dasar, dan tangani preflight OPTIONS.
 * Return true kalau request sudah selesai ditangani (OPTIONS), false kalau lanjut.
 */
function applyCors(req, res) {
  const origin = req.headers.origin;
  const allowAll = config.frontendOrigins.includes("*");

  if (allowAll) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && config.frontendOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-webhook-key");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Pastikan req.body sudah berupa object (Vercel biasanya sudah auto-parse JSON,
 * tapi ini sebagai jaga-jaga kalau body datang sebagai string/Buffer).
 */
function getBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8") || "{}");
    } catch {
      return {};
    }
  }
  return req.body;
}

/**
 * Bungkus sebuah handler async dengan: CORS, body parsing, dan error handler global.
 * Pakai seperti: module.exports = withHandler(async (req, res) => { ... });
 */
function withHandler(handler) {
  return async (req, res) => {
    try {
      if (applyCors(req, res)) return;
      req.body = getBody(req);
      await handler(req, res);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] [ERROR]`, err);
      if (err.status) {
        return res.status(err.status).json({ message: err.message });
      }
      res.status(500).json({ message: "Terjadi kesalahan pada server" });
    }
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/**
 * Rate limiter sederhana berbasis memori (per cold-start instance).
 * Cukup sebagai lapisan tambahan; untuk perlindungan kuat lintas-instance
 * gunakan Vercel Firewall / Upstash Ratelimit.
 */
function rateLimit({ windowMs = 60_000, max = 60, message = "Terlalu banyak request, coba lagi sebentar" } = {}) {
  const key = `${windowMs}:${max}`;
  if (!global.__zakkipayRateLimits) global.__zakkipayRateLimits = new Map();
  if (!global.__zakkipayRateLimits.has(key)) global.__zakkipayRateLimits.set(key, new Map());
  const hits = global.__zakkipayRateLimits.get(key);

  return (req) => {
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now - entry.start > windowMs) {
      entry = { count: 0, start: now };
      hits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) throw httpError(429, message);
  };
}

module.exports = { applyCors, getBody, withHandler, httpError, rateLimit };
