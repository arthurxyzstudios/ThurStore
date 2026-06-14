// api/admin/users/[id]/role.js
const db = require("../../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../../lib/auth");
const { withHandler } = require("../../../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { id } = req.query;
  const { role } = req.body || {};
  if (!["user", "admin"].includes(role))
    return res.status(400).json({ message: "Role harus 'user' atau 'admin'" });

  const user = await db.one("SELECT id FROM users WHERE id = $1", [id]);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  if (Number(user.id) === Number(authUser.id))
    return res.status(400).json({ message: "Tidak bisa mengubah role akun sendiri" });

  await db.query("UPDATE users SET role = $1 WHERE id = $2", [role, user.id]);
  res.json({ message: `Role diubah menjadi ${role}` });
});
