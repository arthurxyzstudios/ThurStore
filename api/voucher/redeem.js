// api/voucher/redeem.js
const db = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const { withHandler, httpError } = require("../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  let { code } = req.body || {};
  code = (code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ message: "Kode voucher wajib diisi" });

  try {
    const result = await db.transaction(async (client) => {
      const voucherRes = await client.query("SELECT * FROM vouchers WHERE code = $1 FOR UPDATE", [code]);
      const voucher = voucherRes.rows[0];
      if (!voucher) throw httpError(404, "Kode voucher tidak ditemukan");
      if (!voucher.is_active) throw httpError(400, "Voucher ini sudah tidak aktif");
      if (voucher.expires_at && new Date(voucher.expires_at) < new Date())
        throw httpError(400, "Voucher sudah expired");
      if (voucher.used_count >= voucher.quota)
        throw httpError(400, "Kuota voucher sudah habis");

      const usedByUserRes = await client.query(
        "SELECT COUNT(*) AS c FROM voucher_redemptions WHERE voucher_id = $1 AND user_id = $2",
        [voucher.id, authUser.id]
      );
      const usedByUser = Number(usedByUserRes.rows[0].c);
      if (usedByUser >= voucher.max_per_user)
        throw httpError(400, "Kamu sudah pernah klaim voucher ini");

      await client.query("UPDATE vouchers SET used_count = used_count + 1 WHERE id = $1", [voucher.id]);
      await client.query(
        "INSERT INTO voucher_redemptions (voucher_id, user_id, nominal) VALUES ($1, $2, $3)",
        [voucher.id, authUser.id, voucher.nominal]
      );

      const balance = await db.adjustBalance(
        authUser.id,
        Number(voucher.nominal),
        "VOUCHER",
        voucher.code,
        `Klaim voucher ${voucher.code}`,
        client
      );

      return { nominal: Number(voucher.nominal), balance };
    });

    res.json({
      message: `Voucher berhasil diklaim! Saldo +Rp ${result.nominal.toLocaleString("id-ID")}`,
      nominal: result.nominal,
      balance: result.balance,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    throw err;
  }
});
