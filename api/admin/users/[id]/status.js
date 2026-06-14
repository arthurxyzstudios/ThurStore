// api/admin/users/[id]/status.js
const db = require("../../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../../lib/auth");
const { withHandler } = require("../../../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { id } = req.query;
  const { is_active } = req.body || {};
  if (typeof is_active !== "boolean")
    return res.status(400).json({ message: "is_active harus true/false" });

  const user = await db.one("SELECT id, role FROM users WHERE id = $1", [id]);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  if (Number(user.id) === Number(authUser.id))
    return res.status(400).json({ message: "Tidak bisa menonaktifkan akun sendiri" });

  await db.query("UPDATE users SET is_active = $1 WHERE id = $2", [is_active, user.id]);
  res.json({ message: is_active ? "Akun diaktifkan" : "Akun dinonaktifkan" });
});
