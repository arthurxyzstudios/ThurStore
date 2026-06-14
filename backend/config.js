const crypto = require("crypto");

function required(name, fallback) {
  const val = process.env[name];
  if (val && val.trim()) return val.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`[CONFIG] Environment variable ${name} wajib diisi di file .env`);
}

// Kalau JWT_SECRET kosong/belum diganti, generate otomatis sekali per proses
// supaya server tetap jalan (dev/testing), tapi tetap warning ke log.
let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.includes("ganti_dengan")) {
  jwtSecret = crypto.randomBytes(48).toString("hex");
  console.warn(
    "[CONFIG] JWT_SECRET tidak diset / masih default. Menggunakan secret random sementara.\n" +
    "         Semua user akan ter-logout setiap kali server restart. Set JWT_SECRET di .env!"
  );
}

let webhookSecret = process.env.WEBHOOK_SECRET;
if (!webhookSecret || webhookSecret.includes("ganti_dengan")) {
  webhookSecret = null;
  console.warn(
    "[CONFIG] WEBHOOK_SECRET tidak diset. Endpoint /api/topup/webhook TIDAK divalidasi dengan key.\n" +
    "         Siapapun yang tahu URL webhook bisa memicu penambahan saldo palsu. Set WEBHOOK_SECRET di .env!"
  );
}

module.exports = {
  zakkiToken: required("ZAKKI_TOKEN"),
  zakkiApi: required("ZAKKI_API", "https://qris.zakki.store").replace(/\/+$/, ""),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  webhookSecret,
  port: parseInt(process.env.PORT, 10) || 3001,
  nodeEnv: process.env.NODE_ENV || "development",
  frontendOrigins: (process.env.FRONTEND_ORIGIN || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
