// api/admin/vouchers/index.js
const db = require("../../../lib/db");
const { requireAuth, requireAdmin } = require("../../../lib/auth");
const { withHandler } = require("../../../lib/http");

module.exports = withHandler(async (req, res) => {
  const authUser = await requireAuth(req);
  requireAdmin(authUser);

  if (req.method === "GET") {
    const rows = await db.many("SELECT * FROM vouchers ORDER BY id DESC LIMIT 200");
    return res.json(rows.map((r) => ({ ...r, nominal: Number(r.nominal), min_topup: Number(r.min_topup) })));
  }

  if (req.method === "POST") {
    let { code, nominal, quota, max_per_user, expires_at, min_topup } = req.body || {};

    code = (code || "").trim().toUpperCase();
    nominal = Number(nominal);
    quota = quota !== undefined ? Number(quota) : 1;
    max_per_user = max_per_user !== undefined ? Number(max_per_user) : 1;
    min_topup = min_topup !== undefined ? Number(min_topup) : 0;

    if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code))
      return res.status(400).json({ message: "Kode voucher harus 3-32 karakter (huruf/angka/-/_)" });
    if (!Number.isInteger(nominal) || nominal <= 0)
      return res.status(400).json({ message: "Nominal voucher harus angka positif" });
    if (!Number.isInteger(quota) || quota <= 0)
      return res.status(400).json({ message: "Kuota harus angka positif" });
    if (!Number.isInteger(max_per_user) || max_per_user <= 0)
      return res.status(400).json({ message: "Maksimal klaim per user harus angka positif" });
    if (expires_at && isNaN(new Date(expires_at).getTime()))
      return res.status(400).json({ message: "Tanggal expired tidak valid" });

    try {
      const inserted = await db.one(
        `INSERT INTO vouchers (code, nominal, quota, max_per_user, min_topup, expires_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [code, nominal, quota, max_per_user, min_topup, expires_at || null, authUser.id]
      );

      const voucher = await db.one("SELECT * FROM vouchers WHERE id = $1", [inserted.id]);
      return res.status(201).json({ ...voucher, nominal: Number(voucher.nominal), min_topup: Number(voucher.min_topup) });
    } catch (err) {
      if (err.code === "23505") return res.status(409).json({ message: "Kode voucher sudah ada" });
      throw err;
    }
  }

  res.status(405).json({ message: "Method tidak diizinkan" });
});
