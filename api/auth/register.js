// api/auth/register.js
const bcrypt = require("bcryptjs");
const db = require("../../lib/db");
const { signToken } = require("../../lib/auth");
const { withHandler, rateLimit } = require("../../lib/http");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const limit = rateLimit({ windowMs: 15 * 60_000, max: 20, message: "Terlalu banyak percobaan registrasi, coba lagi nanti" });

module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Method tidak diizinkan" });
  limit(req);

  let { name, email, phone, password } = req.body || {};
  name = (name || "").trim();
  email = (email || "").trim().toLowerCase();
  phone = (phone || "").trim();

  if (!name || !email || !phone || !password)
    return res.status(400).json({ message: "Semua field wajib diisi" });
  if (!EMAIL_RE.test(email))
    return res.status(400).json({ message: "Format email tidak valid" });
  if (password.length < 6)
    return res.status(400).json({ message: "Password minimal 6 karakter" });
  if (!/^[0-9+]{8,15}$/.test(phone))
    return res.status(400).json({ message: "Nomor HP tidak valid" });

  const exists = await db.one("SELECT id FROM users WHERE email = $1", [email]);
  if (exists) return res.status(409).json({ message: "Email sudah terdaftar" });

  const hash = await bcrypt.hash(password, 10);

  let inserted;
  try {
    inserted = await db.one(
      "INSERT INTO users (name, email, phone, password) VALUES ($1,$2,$3,$4) RETURNING id",
      [name, email, phone, hash]
    );
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Email sudah terdaftar" });
    throw err;
  }

  const user = { id: inserted.id, email, role: "user" };
  const token = signToken(user);

  res.status(201).json({
    message: "Registrasi berhasil",
    token,
    user: { id: user.id, name, email, phone, balance: 0, role: "user" },
  });
});
