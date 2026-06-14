const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const config = require("../config");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role || "user" }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

router.post("/register", async (req, res) => {
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

  try {
    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) return res.status(409).json({ message: "Email sudah terdaftar" });

    const hash = await bcrypt.hash(password, 10);
    const result = db
      .prepare("INSERT INTO users (name, email, phone, password) VALUES (?,?,?,?)")
      .run(name, email, phone, hash);

    const user = { id: result.lastInsertRowid, email, role: "user" };
    const token = signToken(user);

    res.status(201).json({
      message: "Registrasi berhasil",
      token,
      user: { id: user.id, name, email, phone, balance: 0, role: "user" },
    });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE")
      return res.status(409).json({ message: "Email sudah terdaftar" });
    throw err;
  }
});

router.post("/login", async (req, res) => {
  let { email, password } = req.body || {};
  email = (email || "").trim().toLowerCase();

  if (!email || !password)
    return res.status(400).json({ message: "Email dan password wajib diisi" });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
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
      balance: user.balance,
      role: user.role,
    },
  });
});

module.exports = router;
