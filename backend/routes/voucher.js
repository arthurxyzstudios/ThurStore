const router = require("express").Router();
const db = require("../db");
const auth = require("../middleware/auth");

/**
 * Redeem voucher: tambah saldo user kalau kode valid, masih ada kuota,
 * belum expired, dan user belum melebihi batas klaim per-user.
 */
router.post("/redeem", auth, (req, res) => {
  let { code } = req.body || {};
  code = (code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ message: "Kode voucher wajib diisi" });

  try {
    const result = db.transaction(() => {
      const voucher = db.prepare("SELECT * FROM vouchers WHERE code = ?").get(code);
      if (!voucher) throw httpError(404, "Kode voucher tidak ditemukan");
      if (!voucher.is_active) throw httpError(400, "Voucher ini sudah tidak aktif");
      if (voucher.expires_at && new Date(voucher.expires_at) < new Date())
        throw httpError(400, "Voucher sudah expired");
      if (voucher.used_count >= voucher.quota)
        throw httpError(400, "Kuota voucher sudah habis");

      const usedByUser = db
        .prepare("SELECT COUNT(*) AS c FROM voucher_redemptions WHERE voucher_id = ? AND user_id = ?")
        .get(voucher.id, req.user.id).c;
      if (usedByUser >= voucher.max_per_user)
        throw httpError(400, "Kamu sudah pernah klaim voucher ini");

      db.prepare("UPDATE vouchers SET used_count = used_count + 1 WHERE id = ?").run(voucher.id);
      db.prepare(
        "INSERT INTO voucher_redemptions (voucher_id, user_id, nominal) VALUES (?, ?, ?)"
      ).run(voucher.id, req.user.id, voucher.nominal);

      const balance = db.adjustBalance(
        req.user.id,
        voucher.nominal,
        "VOUCHER",
        voucher.code,
        `Klaim voucher ${voucher.code}`
      );

      return { nominal: voucher.nominal, balance };
    })();

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

// Riwayat voucher yang pernah diklaim user
router.get("/history", auth, (req, res) => {
  const list = db
    .prepare(
      `SELECT vr.id, v.code, vr.nominal, vr.created_at
       FROM voucher_redemptions vr
       JOIN vouchers v ON v.id = vr.voucher_id
       WHERE vr.user_id = ?
       ORDER BY vr.created_at DESC LIMIT 20`
    )
    .all(req.user.id);
  res.json(list);
});

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

module.exports = router;
