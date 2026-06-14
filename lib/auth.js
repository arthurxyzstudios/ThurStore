// lib/auth.js
const jwt = require("jsonwebtoken");
const config = require("./config");
const db = require("./db");
const { httpError } = require("./http");

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role || "user" }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

/**
 * Ambil & verifikasi user dari header Authorization: Bearer <token>.
 * Throw httpError(401/403) kalau gagal. Return { id, email, role }.
 */
async function requireAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw httpError(401, "Token tidak ditemukan, silakan login");
  }

  let payload;
  try {
    payload = jwt.verify(authHeader.slice(7), config.jwtSecret);
  } catch (err) {
    if (err.name === "TokenExpiredError") throw httpError(401, "Session expired, silakan login ulang");
    throw httpError(401, "Token tidak valid");
  }

  const user = await db.one("SELECT id, email, role, is_active FROM users WHERE id = $1", [payload.id]);
  if (!user) throw httpError(401, "User tidak ditemukan, silakan login ulang");
  if (!user.is_active) throw httpError(403, "Akun kamu dinonaktifkan");

  return { id: user.id, email: user.email, role: user.role };
}

/** Pastikan user adalah admin. Throw httpError(403) kalau bukan. */
function requireAdmin(user) {
  if (!user || user.role !== "admin") {
    throw httpError(403, "Akses ditolak, khusus admin");
  }
}

module.exports = { signToken, requireAuth, requireAdmin };
