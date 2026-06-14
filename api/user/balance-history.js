// api/user/balance-history.js
const db = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const { withHandler } = require("../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  const list = await db.many(
    `SELECT type, amount, balance_after, reference, note, created_at
     FROM balance_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [authUser.id]
  );

  res.json(list.map((r) => ({ ...r, amount: Number(r.amount), balance_after: Number(r.balance_after) })));
});
