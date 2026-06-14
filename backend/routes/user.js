const router = require("express").Router();
const db = require("../db");
const auth = require("../middleware/auth");

router.get("/me", auth, (req, res) => {
  const user = db
    .prepare("SELECT id, name, email, phone, balance, role, created_at FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });
  res.json(user);
});

// Riwayat mutasi saldo (topup, pembelian, refund) untuk transparansi ke user
router.get("/balance-history", auth, (req, res) => {
  const list = db
    .prepare(
      "SELECT type, amount, balance_after, reference, note, created_at FROM balance_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    )
    .all(req.user.id);
  res.json(list);
});

module.exports = router;
