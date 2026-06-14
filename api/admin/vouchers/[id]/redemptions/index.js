// api/admin/vouchers/[id]/redemptions/index.js
const db = require("../../../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../../../lib/auth");
const { withHandler } = require("../../../../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { id } = req.query;
  const rows = await db.many(
    `SELECT vr.*, u.email AS user_email FROM voucher_redemptions vr
     JOIN users u ON u.id = vr.user_id
     WHERE vr.voucher_id = $1 ORDER BY vr.created_at DESC LIMIT 200`,
    [id]
  );

  res.json(rows.map((r) => ({ ...r, nominal: Number(r.nominal) })));
});
