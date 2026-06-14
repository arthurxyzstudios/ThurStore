// api/admin/vouchers/[id]/index.js
const db = require("../../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../../lib/auth");
const { withHandler } = require("../../../../lib/http");

module.exports = withHandler(async (req, res) => {
  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  const { id } = req.query;
  const voucher = await db.one("SELECT * FROM vouchers WHERE id = $1", [id]);
  if (!voucher) return res.status(404).json({ message: "Voucher tidak ditemukan" });

  if (req.method === "PATCH") {
    const fields = [];
    const values = [];
    let i = 1;
    const { nominal, quota, max_per_user, expires_at, is_active, min_topup } = req.body || {};

    if (nominal !== undefined) {
      if (!Number.isInteger(Number(nominal)) || nominal <= 0)
        return res.status(400).json({ message: "Nominal tidak valid" });
      fields.push(`nominal = $${i++}`); values.push(Number(nominal));
    }
    if (quota !== undefined) {
      if (!Number.isInteger(Number(quota)) || quota <= 0)
        return res.status(400).json({ message: "Kuota tidak valid" });
      fields.push(`quota = $${i++}`); values.push(Number(quota));
    }
    if (max_per_user !== undefined) {
      if (!Number.isInteger(Number(max_per_user)) || max_per_user <= 0)
        return res.status(400).json({ message: "Maksimal klaim per user tidak valid" });
      fields.push(`max_per_user = $${i++}`); values.push(Number(max_per_user));
    }
    if (min_topup !== undefined) {
      fields.push(`min_topup = $${i++}`); values.push(Number(min_topup) || 0);
    }
    if (expires_at !== undefined) {
      if (expires_at && isNaN(new Date(expires_at).getTime()))
        return res.status(400).json({ message: "Tanggal expired tidak valid" });
      fields.push(`expires_at = $${i++}`); values.push(expires_at || null);
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${i++}`); values.push(!!is_active);
    }

    if (!fields.length) return res.status(400).json({ message: "Tidak ada field yang diubah" });

    values.push(voucher.id);
    await db.query(`UPDATE vouchers SET ${fields.join(", ")} WHERE id = $${i}`, values);
    const updated = await db.one("SELECT * FROM vouchers WHERE id = $1", [voucher.id]);
    return res.json({ ...updated, nominal: Number(updated.nominal), min_topup: Number(updated.min_topup) });
  }

  if (req.method === "DELETE") {
    // Soft delete: nonaktifkan saja, supaya riwayat redemption tetap valid
    await db.query("UPDATE vouchers SET is_active = false WHERE id = $1", [voucher.id]);
    return res.json({ message: "Voucher dinonaktifkan" });
  }

  res.status(405).json({ message: "Method tidak diizinkan" });
});
