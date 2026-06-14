// api/admin/users/index.js
const db = require("../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../lib/auth");
const { withHandler } = require("../../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { q } = req.query;
  let rows;
  if (q) {
    rows = await db.many(
      `SELECT id, name, email, phone, balance, role, is_active, created_at FROM users
       WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1
       ORDER BY id DESC LIMIT 100`,
      [`%${q}%`]
    );
  } else {
    rows = await db.many(
      "SELECT id, name, email, phone, balance, role, is_active, created_at FROM users ORDER BY id DESC LIMIT 100"
    );
  }

  res.json(rows.map((r) => ({ ...r, balance: Number(r.balance) })));
});
