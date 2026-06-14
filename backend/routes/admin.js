const router = require("express").Router();
const db = require("../db");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/admin");

// Semua route di file ini wajib login DAN role admin
router.use(auth, adminOnly);

// ───────────────────────── DASHBOARD / STATS ─────────────────────────

router.get("/stats", (req, res) => {
  const users = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  const totalBalance = db.prepare("SELECT COALESCE(SUM(balance),0) AS s FROM users").get().s;

  const topupSuccess = db
    .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(nominal),0) AS total FROM topups WHERE status = 'SUCCESS'")
    .get();
  const topupPending = db.prepare("SELECT COUNT(*) AS c FROM topups WHERE status = 'PENDING'").get().c;

  const orderSuccess = db
    .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(harga),0) AS total FROM orders WHERE status = 'SUCCESS'")
    .get();
  const orderFailed = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'FAILED'").get().c;

  const voucherStats = db
    .prepare("SELECT COUNT(*) AS c, COALESCE(SUM(used_count),0) AS redeemed FROM vouchers")
    .get();

  res.json({
    users,
    total_balance: totalBalance,
    topup: { success_count: topupSuccess.c, success_total: topupSuccess.total, pending_count: topupPending },
    order: { success_count: orderSuccess.c, success_total: orderSuccess.total, failed_count: orderFailed },
    voucher: { total: voucherStats.c, redeemed: voucherStats.redeemed },
  });
});

// ───────────────────────── USERS ─────────────────────────

router.get("/users", (req, res) => {
  const { q } = req.query;
  let rows;
  if (q) {
    rows = db
      .prepare(
        `SELECT id, name, email, phone, balance, role, is_active, created_at FROM users
         WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?
         ORDER BY id DESC LIMIT 100`
      )
      .all(`%${q}%`, `%${q}%`, `%${q}%`);
  } else {
    rows = db
      .prepare("SELECT id, name, email, phone, balance, role, is_active, created_at FROM users ORDER BY id DESC LIMIT 100")
      .all();
  }
  res.json(rows);
});

router.get("/users/:id", (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, phone, balance, role, is_active, created_at FROM users WHERE id = ?")
    .get(req.params.id);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").all(user.id);
  const topups = db.prepare("SELECT * FROM topups WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").all(user.id);
  const balanceLogs = db
    .prepare("SELECT * FROM balance_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
    .all(user.id);

  res.json({ ...user, recent_orders: orders, recent_topups: topups, balance_logs: balanceLogs });
});

// Tambah / kurangi saldo user secara manual (tercatat di balance_logs)
router.post("/users/:id/balance", (req, res) => {
  const { amount, note } = req.body || {};
  const delta = Number(amount);
  if (!Number.isInteger(delta) || delta === 0)
    return res.status(400).json({ message: "Jumlah saldo tidak valid (gunakan angka, boleh negatif)" });

  const user = db.prepare("SELECT id, balance FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  if (delta < 0 && user.balance + delta < 0)
    return res.status(400).json({ message: "Saldo user tidak boleh menjadi negatif" });

  const balance = db.adjustBalance(
    user.id,
    delta,
    "ADJUST",
    `admin:${req.user.id}`,
    note || `Penyesuaian manual oleh admin #${req.user.id}`
  );

  res.json({ message: "Saldo berhasil diperbarui", balance });
});

// Aktifkan / nonaktifkan akun user (banned)
router.post("/users/:id/status", (req, res) => {
  const { is_active } = req.body || {};
  if (typeof is_active !== "boolean")
    return res.status(400).json({ message: "is_active harus true/false" });

  const user = db.prepare("SELECT id, role FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  if (user.id === req.user.id)
    return res.status(400).json({ message: "Tidak bisa menonaktifkan akun sendiri" });

  db.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(is_active ? 1 : 0, user.id);
  res.json({ message: is_active ? "Akun diaktifkan" : "Akun dinonaktifkan" });
});

// Ubah role user (user <-> admin)
router.post("/users/:id/role", (req, res) => {
  const { role } = req.body || {};
  if (!["user", "admin"].includes(role))
    return res.status(400).json({ message: "Role harus 'user' atau 'admin'" });

  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  if (user.id === req.user.id)
    return res.status(400).json({ message: "Tidak bisa mengubah role akun sendiri" });

  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id);
  res.json({ message: `Role diubah menjadi ${role}` });
});

// ───────────────────────── ORDERS & TOPUPS (oversight) ─────────────────────────

router.get("/orders", (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db
      .prepare(
        `SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id = o.user_id
         WHERE o.status = ? ORDER BY o.created_at DESC LIMIT 100`
      )
      .all(status.toUpperCase());
  } else {
    rows = db
      .prepare(
        `SELECT o.*, u.email AS user_email FROM orders o JOIN users u ON u.id = o.user_id
         ORDER BY o.created_at DESC LIMIT 100`
      )
      .all();
  }
  res.json(rows);
});

router.get("/topups", (req, res) => {
  const { status } = req.query;
  let rows;
  if (status) {
    rows = db
      .prepare(
        `SELECT t.*, u.email AS user_email FROM topups t JOIN users u ON u.id = t.user_id
         WHERE t.status = ? ORDER BY t.created_at DESC LIMIT 100`
      )
      .all(status.toUpperCase());
  } else {
    rows = db
      .prepare(
        `SELECT t.*, u.email AS user_email FROM topups t JOIN users u ON u.id = t.user_id
         ORDER BY t.created_at DESC LIMIT 100`
      )
      .all();
  }
  res.json(rows);
});

// ───────────────────────── VOUCHERS (CRUD) ─────────────────────────

router.get("/vouchers", (req, res) => {
  const rows = db.prepare("SELECT * FROM vouchers ORDER BY id DESC LIMIT 200").all();
  res.json(rows);
});

router.post("/vouchers", (req, res) => {
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
    const result = db
      .prepare(
        `INSERT INTO vouchers (code, nominal, quota, max_per_user, min_topup, expires_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(code, nominal, quota, max_per_user, min_topup, expires_at || null, req.user.id);

    const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(voucher);
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE")
      return res.status(409).json({ message: "Kode voucher sudah ada" });
    throw err;
  }
});

router.patch("/vouchers/:id", (req, res) => {
  const voucher = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(req.params.id);
  if (!voucher) return res.status(404).json({ message: "Voucher tidak ditemukan" });

  const fields = [];
  const values = [];
  const { nominal, quota, max_per_user, expires_at, is_active, min_topup } = req.body || {};

  if (nominal !== undefined) {
    if (!Number.isInteger(Number(nominal)) || nominal <= 0)
      return res.status(400).json({ message: "Nominal tidak valid" });
    fields.push("nominal = ?"); values.push(Number(nominal));
  }
  if (quota !== undefined) {
    if (!Number.isInteger(Number(quota)) || quota <= 0)
      return res.status(400).json({ message: "Kuota tidak valid" });
    fields.push("quota = ?"); values.push(Number(quota));
  }
  if (max_per_user !== undefined) {
    if (!Number.isInteger(Number(max_per_user)) || max_per_user <= 0)
      return res.status(400).json({ message: "Maksimal klaim per user tidak valid" });
    fields.push("max_per_user = ?"); values.push(Number(max_per_user));
  }
  if (min_topup !== undefined) {
    fields.push("min_topup = ?"); values.push(Number(min_topup) || 0);
  }
  if (expires_at !== undefined) {
    if (expires_at && isNaN(new Date(expires_at).getTime()))
      return res.status(400).json({ message: "Tanggal expired tidak valid" });
    fields.push("expires_at = ?"); values.push(expires_at || null);
  }
  if (is_active !== undefined) {
    fields.push("is_active = ?"); values.push(is_active ? 1 : 0);
  }

  if (!fields.length) return res.status(400).json({ message: "Tidak ada field yang diubah" });

  db.prepare(`UPDATE vouchers SET ${fields.join(", ")} WHERE id = ?`).run(...values, voucher.id);
  const updated = db.prepare("SELECT * FROM vouchers WHERE id = ?").get(voucher.id);
  res.json(updated);
});

router.delete("/vouchers/:id", (req, res) => {
  const voucher = db.prepare("SELECT id FROM vouchers WHERE id = ?").get(req.params.id);
  if (!voucher) return res.status(404).json({ message: "Voucher tidak ditemukan" });

  // Soft delete: nonaktifkan saja, supaya riwayat redemption tetap valid
  db.prepare("UPDATE vouchers SET is_active = 0 WHERE id = ?").run(voucher.id);
  res.json({ message: "Voucher dinonaktifkan" });
});

router.get("/vouchers/:id/redemptions", (req, res) => {
  const rows = db
    .prepare(
      `SELECT vr.*, u.email AS user_email FROM voucher_redemptions vr
       JOIN users u ON u.id = vr.user_id
       WHERE vr.voucher_id = ? ORDER BY vr.created_at DESC LIMIT 200`
    )
    .all(req.params.id);
  res.json(rows);
});

module.exports = router;
