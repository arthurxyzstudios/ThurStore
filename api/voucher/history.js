// api/voucher/history.js
const db = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const { withHandler } = require("../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  const list = await db.many(
    `SELECT vr.id, v.code, vr.nominal, vr.created_at
     FROM voucher_redemptions vr
     JOIN vouchers v ON v.id = vr.voucher_id
     WHERE vr.user_id = $1
     ORDER BY vr.created_at DESC LIMIT 20`,
    [authUser.id]
  );

  res.json(list.map((r) => ({ ...r, nominal: Number(r.nominal) })));
});
