// api/user/me.js
const db = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");
const { withHandler } = require("../../lib/http");

module.exports = withHandler(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  const user = await db.one(
    "SELECT id, name, email, phone, balance, role, created_at FROM users WHERE id = $1",
    [authUser.id]
  );
  if (!user) return res.status(404).json({ message: "User tidak ditemukan" });

  res.json({ ...user, balance: Number(user.balance) });
});
