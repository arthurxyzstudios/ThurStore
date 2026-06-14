const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config");
const db = require("../db");

module.exports = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer "))
    return res.status(401).json({ message: "Token tidak ditemukan, silakan login" });

  try {
    const payload = jwt.verify(auth.slice(7), jwtSecret);

    // Pastikan user masih ada & aktif (mis. tidak dibanned)
    const user = db.prepare("SELECT id, email, role, is_active FROM users WHERE id = ?").get(payload.id);
    if (!user) return res.status(401).json({ message: "User tidak ditemukan, silakan login ulang" });
    if (!user.is_active) return res.status(403).json({ message: "Akun kamu dinonaktifkan" });

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ message: "Session expired, silakan login ulang" });
    return res.status(401).json({ message: "Token tidak valid" });
  }
};
