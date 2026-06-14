const router = require("express").Router();
const fetch = require("node-fetch");
const db = require("../db");
const auth = require("../middleware/auth");
const config = require("../config");
const logger = require("../logger");

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

router.get("/products", async (req, res) => {
  const { jenis, type } = req.query;
  try {
    let url = `${config.zakkiApi}/listkode`;
    const params = [];
    if (jenis) params.push(`jenis=${encodeURIComponent(jenis)}`);
    if (jenis && type) params.push(`type=${encodeURIComponent(type)}`);
    if (params.length) url += `?${params.join("&")}`;

    const r = await fetchWithTimeout(url);
    const d = await r.json();
    res.json(d);
  } catch (err) {
    logger.error("order/products:", err.message);
    res.status(502).json({ message: "Gagal mengambil produk dari gateway" });
  }
});

router.post("/buy", auth, async (req, res) => {
  const { kode, tujuan, harga, produk_nama } = req.body || {};
  const price = Number(harga);

  if (!kode || !tujuan || !Number.isInteger(price) || price <= 0)
    return res.status(400).json({ message: "Data tidak lengkap atau tidak valid" });

  const refID = "p" + Date.now().toString().slice(-10);

  // Potong saldo dulu secara atomik + tercatat di balance_logs. Kalau saldo
  // kurang, transaksi dibatalkan (throw) sehingga tidak lanjut ke gateway.
  let newBalance;
  try {
    const tx = db.transaction(() => {
      const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(req.user.id);
      if (user.balance < price) {
        const err = new Error("INSUFFICIENT_BALANCE");
        err.balance = user.balance;
        throw err;
      }
      newBalance = db.adjustBalance(req.user.id, -price, "ORDER", refID, `Pembelian ${produk_nama || kode}`);
    });
    tx();
  } catch (err) {
    if (err.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({
        message: `Saldo tidak cukup. Saldo kamu: Rp ${err.balance.toLocaleString("id-ID")}`,
      });
    }
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
      db.prepare(
        `INSERT INTO orders (user_id, ref_id, server_id, produk, kode, tujuan, harga, status, sn)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(req.user.id, refID, d.data?.serverID || "", produk_nama || kode, kode, tujuan, price, "SUCCESS", d.data?.sn || "");

      return res.json({ status: "SUCCESS", sn: d.data?.sn, message: d.message, balance: newBalance });
    }

    // Gagal: refund saldo dan catat order sebagai FAILED
    const refunded = db.adjustBalance(req.user.id, price, "REFUND", refID, "Refund - transaksi gagal di gateway");
    db.prepare(
      `INSERT INTO orders (user_id, ref_id, produk, kode, tujuan, harga, status, keterangan)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(req.user.id, refID, produk_nama || kode, kode, tujuan, price, "FAILED", d.message || null);

    return res.status(400).json({ status: "FAILED", message: d.message || "Transaksi gagal", balance: refunded });
  } catch (err) {
    logger.error("order/buy:", err.message);
    const refunded = db.adjustBalance(req.user.id, price, "REFUND", refID, "Refund - gateway tidak merespon");
    db.prepare(
      `INSERT INTO orders (user_id, ref_id, produk, kode, tujuan, harga, status, keterangan)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(req.user.id, refID, produk_nama || kode, kode, tujuan, price, "FAILED", "Gateway tidak merespon");

    return res.status(502).json({ message: "Gagal terhubung ke gateway, saldo telah dikembalikan", balance: refunded });
  }
});

router.get("/history", auth, (req, res) => {
  const list = db
    .prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 30")
    .all(req.user.id);
  res.json(list);
});

module.exports = router;
