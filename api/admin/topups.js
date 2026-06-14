// api/admin/topups.js
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
      `SELECT t.*, u.email AS user_email FROM topups t JOIN users u ON u.id = t.user_id
       WHERE t.status = $1 ORDER BY t.created_at DESC LIMIT 100`,
      [status.toUpperCase()]
    );
  } else {
    rows = await db.many(
      `SELECT t.*, u.email AS user_email FROM topups t JOIN users u ON u.id = t.user_id
       ORDER BY t.created_at DESC LIMIT 100`
    );
  }

  res.json(rows.map((r) => ({ ...r, nominal: Number(r.nominal), nominal_total: Number(r.nominal_total) })));
});
