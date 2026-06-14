// api/admin/stats.js
const db = require("../../lib/db");
const { requireAuth, requireAdmin } = require("../../lib/auth");
const { withHandler } = require("../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const users = Number((await db.one("SELECT COUNT(*) AS c FROM users")).c);
  const totalBalance = Number((await db.one("SELECT COALESCE(SUM(balance),0) AS s FROM users")).s);

  const topupSuccess = await db.one(
    "SELECT COUNT(*) AS c, COALESCE(SUM(nominal),0) AS total FROM topups WHERE status = 'SUCCESS'"
  );
  const topupPending = Number((await db.one("SELECT COUNT(*) AS c FROM topups WHERE status = 'PENDING'")).c);

  const orderSuccess = await db.one(
    "SELECT COUNT(*) AS c, COALESCE(SUM(harga),0) AS total FROM orders WHERE status = 'SUCCESS'"
  );
  const orderFailed = Number((await db.one("SELECT COUNT(*) AS c FROM orders WHERE status = 'FAILED'")).c);

  const voucherStats = await db.one(
    "SELECT COUNT(*) AS c, COALESCE(SUM(used_count),0) AS redeemed FROM vouchers"
  );

  res.json({
    users,
    total_balance: totalBalance,
    topup: {
      success_count: Number(topupSuccess.c),
      success_total: Number(topupSuccess.total),
      pending_count: topupPending,
    },
    order: {
      success_count: Number(orderSuccess.c),
      success_total: Number(orderSuccess.total),
      failed_count: orderFailed,
    },
    voucher: { total: Number(voucherStats.c), redeemed: Number(voucherStats.redeemed) },
  });
});
