// api/admin/users/[id]/balance.js
const db = require("../../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../../lib/auth");
const { withHandler } = require("../../../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { id } = req.query;
  const { amount, note } = req.body || {};
  const delta = Number(amount);
  if (!Number.isInteger(delta) || delta === 0)
    return res.status(400).json({ message: "Jumlah saldo tidak valid (gunakan angka, boleh negatif)" });

  const user = await db.one("SELECT id, balance FROM users WHERE id = $1", [id]);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  if (delta < 0 && Number(user.balance) + delta < 0)
    return res.status(400).json({ message: "Saldo user tidak boleh menjadi negatif" });

  const balance = await db.adjustBalance(
    user.id,
    delta,
    "ADJUST",
    `admin:${authUser.id}`,
    note || `Penyesuaian manual oleh admin #${authUser.id}`
  );

  res.json({ message: "Saldo berhasil diperbarui", balance });
});
