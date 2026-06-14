// lib/config.js
const crypto = require("crypto");

function required(name, fallback) {
  const val = process.env[name];
  if (val && val.trim()) return val.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`[CONFIG] Environment variable ${name} wajib diisi di Vercel Project Settings`);
}

// Kalau JWT_SECRET kosong/belum diganti, generate sekali per cold start
// supaya endpoint tidak crash (dev/testing), tapi tetap warning ke log.
// Di production WAJIB set JWT_SECRET permanen, atau semua user akan
// ter-logout setiap kali function instance restart (cold start).
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.includes("ganti_dengan")) {
  jwtSecret = global.__zakkipayJwtFallback || (global.__zakkipayJwtFallback = crypto.randomBytes(48).toString("hex"));
  console.warn(
    "[CONFIG] JWT_SECRET tidak diset / masih default. Menggunakan secret sementara per cold-start.\n" +
    "         Semua user akan ter-logout secara acak. Set JWT_SECRET di Vercel Environment Variables!"
  );
}

let webhookSecret = process.env.WEBHOOK_SECRET;
if (!webhookSecret || webhookSecret.includes("ganti_dengan")) {
  webhookSecret = null;
  console.warn(
    "[CONFIG] WEBHOOK_SECRET tidak diset. Endpoint /api/topup/webhook TIDAK divalidasi dengan key.\n" +
    "         Siapapun yang tahu URL webhook bisa memicu penambahan saldo palsu. Set WEBHOOK_SECRET di Vercel!"
  );
}

module.exports = {
  zakkiToken: required("ZAKKI_TOKEN"),
  zakkiApi: required("ZAKKI_API", "https://qris.zakki.store").replace(/\/+$/, ""),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  webhookSecret,
  nodeEnv: process.env.NODE_ENV || "production",
  frontendOrigins: (process.env.FRONTEND_ORIGIN || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
