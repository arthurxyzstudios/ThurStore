// api/topup/create.js
const db = require("../../lib/db");
const config = require("../../lib/config");
const { requireAuth } = require("../../lib/auth");
const { withHandler } = require("../../lib/http");

const FETCH_TIMEOUT_MS = 15_000;

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
  const { nominal } = req.body || {};
  const amount = Number(nominal);

  if (!Number.isInteger(amount) || amount < 1000)
    return res.status(400).json({ message: "Minimal top up Rp 1.000" });
  if (amount > 10_000_000)
    return res.status(400).json({ message: "Maksimal top up Rp 10.000.000" });

  let d;
  try {
    const r = await fetchWithTimeout(`${config.zakkiApi}/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: config.zakkiToken, nominal: amount }),
    });
    d = await r.json();
  } catch (err) {
    console.error("topup/create:", err.message);
    return res.status(502).json({ message: "Gagal terhubung ke gateway pembayaran" });
  }

  if (d.code !== 201 || !d.data?.id_transaksi) {
    return res.status(400).json({ message: d.message || "Gagal membuat QRIS" });
  }

  const zakki_id = d.data.id_transaksi;
  const total = d.data.rincian?.total_bayar ?? amount;

  await db.query(
    `INSERT INTO topups (user_id, id_transaksi, nominal, nominal_total, qris_image, qris_content)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [authUser.id, zakki_id, amount, total, d.data.qris_image, d.data.qris_content]
  );

  res.status(201).json({
    id_transaksi: zakki_id,
    nominal: amount,
    nominal_total: total,
    qris_image: d.data.qris_image,
    qris_content: d.data.qris_content,
  });
});
