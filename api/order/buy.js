// api/order/buy.js
const db = require("../../lib/db");
const config = require("../../lib/config");
const { requireAuth } = require("../../lib/auth");
const { withHandler, httpError } = require("../../lib/http");

const FETCH_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  const { kode, tujuan, harga, produk_nama } = req.body || {};
  const price = Number(harga);

  if (!kode || !tujuan || !Number.isInteger(price) || price <= 0)
    return res.status(400).json({ message: "Data tidak lengkap atau tidak valid" });

  const refID = "p" + Date.now().toString().slice(-10);

  // Potong saldo dulu secara atomik + tercatat di balance_logs. Kalau saldo
  // kurang, transaksi dibatalkan (throw) sehingga tidak lanjut ke gateway.
  let newBalance;
  try {
    newBalance = await db.transaction(async (client) => {
      const userRes = await client.query("SELECT balance FROM users WHERE id = $1 FOR UPDATE", [authUser.id]);
      const balance = Number(userRes.rows[0].balance);
      if (balance < price) {
        throw httpError(400, `Saldo tidak cukup. Saldo kamu: Rp ${balance.toLocaleString("id-ID")}`);
      }
      return db.adjustBalance(authUser.id, -price, "ORDER", refID, `Pembelian ${produk_nama || kode}`, client);
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    throw err;
  }

  try {
    const r = await fetchWithTimeout(`${config.zakkiApi}/h2h`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: config.zakkiToken, kode, tujuan, refID }),
    });
    const d = await r.json();

    if (d.code === 200) {
      await db.query(
        `INSERT INTO orders (user_id, ref_id, server_id, produk, kode, tujuan, harga, status, sn)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [authUser.id, refID, d.data?.serverID || "", produk_nama || kode, kode, tujuan, price, "SUCCESS", d.data?.sn || ""]
      );

      return res.json({ status: "SUCCESS", sn: d.data?.sn, message: d.message, balance: newBalance });
    }

    // Gagal: refund saldo dan catat order sebagai FAILED
    const refunded = await db.adjustBalance(authUser.id, price, "REFUND", refID, "Refund - transaksi gagal di gateway");
    await db.query(
      `INSERT INTO orders (user_id, ref_id, produk, kode, tujuan, harga, status, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [authUser.id, refID, produk_nama || kode, kode, tujuan, price, "FAILED", d.message || null]
    );

    return res.status(400).json({ status: "FAILED", message: d.message || "Transaksi gagal", balance: refunded });
  } catch (err) {
    console.error("order/buy:", err.message);
    const refunded = await db.adjustBalance(authUser.id, price, "REFUND", refID, "Refund - gateway tidak merespon");
    await db.query(
      `INSERT INTO orders (user_id, ref_id, produk, kode, tujuan, harga, status, keterangan)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [authUser.id, refID, produk_nama || kode, kode, tujuan, price, "FAILED", "Gateway tidak merespon"]
    );

    return res.status(502).json({ message: "Gagal terhubung ke gateway, saldo telah dikembalikan", balance: refunded });
  }
});
