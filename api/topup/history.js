// api/topup/history.js
const db = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const { withHandler } = require("../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  const list = await db.many(
    `SELECT id_transaksi, nominal, nominal_total, status, created_at, settled_at
     FROM topups WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [authUser.id]
  );

  res.json(list.map((r) => ({ ...r, nominal: Number(r.nominal), nominal_total: Number(r.nominal_total) })));
});
