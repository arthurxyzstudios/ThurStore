// api/auth/login.js
const bcrypt = require("bcryptjs");
const db = require("../../lib/db");
const { signToken } = require("../../lib/auth");
const { withHandler, rateLimit } = require("../../lib/http");

const limit = rateLimit({ windowMs: 15 * 60_000, max: 20, message: "Terlalu banyak percobaan login, coba lagi nanti" });

module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Method tidak diizinkan" });
  limit(req);

  let { email, password } = req.body || {};
  email = (email || "").trim().toLowerCase();

  if (!email || !password)
    return res.status(400).json({ message: "Email dan password wajib diisi" });

  const user = await db.one("SELECT * FROM users WHERE email = $1", [email]);
  // Pesan generik agar tidak membocorkan email mana yang terdaftar
  if (!user) return res.status(401).json({ message: "Email atau password salah" });
  if (!user.is_active) return res.status(403).json({ message: "Akun kamu dinonaktifkan" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: "Email atau password salah" });

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      balance: Number(user.balance),
      role: user.role,
    },
  });
});
