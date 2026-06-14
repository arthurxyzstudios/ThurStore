// api/admin/users/[id]/index.js
const db = require("../../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../../lib/auth");
const { withHandler } = require("../../../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { id } = req.query;
  const user = await db.one(
    "SELECT id, name, email, phone, balance, role, is_active, created_at FROM users WHERE id = $1",
    [id]
  );
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

  const orders = await db.many("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", [user.id]);
  const topups = await db.many("SELECT * FROM topups WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", [user.id]);
  const balanceLogs = await db.many(
    "SELECT * FROM balance_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    [user.id]
  );

  res.json({
    ...user,
    balance: Number(user.balance),
    recent_orders: orders.map((o) => ({ ...o, harga: Number(o.harga) })),
    recent_topups: topups.map((t) => ({ ...t, nominal: Number(t.nominal), nominal_total: Number(t.nominal_total) })),
    balance_logs: balanceLogs.map((b) => ({ ...b, amount: Number(b.amount), balance_after: Number(b.balance_after) })),
  });
});
