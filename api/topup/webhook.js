// api/topup/webhook.js
const db = require("../../lib/db");
const config = require("../../lib/config");
const { withHandler } = require("../../lib/http");
const { settleTopup } = require("../../lib/topup");

/**
 * Webhook callback dari Zakki. Karena hosting serverless (Vercel) tidak punya
 * IP statis yang bisa di-whitelist, keamanan dilakukan dengan secret key di
 * query string / header, BUKAN whitelist IP.
 *
 * Daftarkan URL ke Zakki dengan format:
 *   https://<domain-vercel>/api/topup/webhook?key=<WEBHOOK_SECRET>
 *
 * via endpoint setcallback Zakki:
 *   GET {ZAKKI_API}/setcallback?token={ZAKKI_TOKEN}&site=<url-di-atas, url-encoded>
 */
module.exports = withHandler(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, message: "Method tidak diizinkan" });

  if (config.webhookSecret) {
    const key = req.query.key || req.headers["x-webhook-key"];
    if (key !== config.webhookSecret) {
      console.warn("Webhook ditolak: key tidak valid");
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
  }

  const { id_transaksi } = req.body || {};
  if (!id_transaksi) return res.status(400).json({ ok: false, message: "id_transaksi wajib diisi" });

  const topup = await db.one("SELECT * FROM topups WHERE id_transaksi = $1", [id_transaksi]);
  if (!topup) return res.status(404).json({ ok: false, message: "Transaksi tidak ditemukan" });

  // Idempoten: kalau sudah SUCCESS sebelumnya, jangan tambah saldo lagi
  if (topup.status === "SUCCESS") return res.json({ ok: true, already: true });

  await settleTopup(id_transaksi);
  res.json({ ok: true });
});
