// api/admin/orders.js
const db = require("../../lib/db");
const { requireAuth, requireAdmin } = require("../../lib/auth");
const { withHandler } = require("../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { status } = req.query;
  let rows;
  if (status) {
    rows = await db.many(
      `SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id = o.user_id
       WHERE o.status = $1 ORDER BY o.created_at DESC LIMIT 100`,
      [status.toUpperCase()]
    );
  } else {
    rows = await db.many(
      `SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 100`
    );
  }

  res.json(rows.map((r) => ({ ...r, harga: Number(r.harga) })));
});
