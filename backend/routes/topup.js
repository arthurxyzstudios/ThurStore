const router = require("express").Router();
const fetch = require("node-fetch");
const db = require("../db");
const auth = require("../middleware/auth");
const config = require("../config");
const logger = require("../logger");

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

router.post("/create", auth, async (req, res) => {
  const { nominal } = req.body || {};
  const amount = Number(nominal);

  if (!Number.isInteger(amount) || amount < 1000)
    return res.status(400).json({ message: "Minimal top up Rp 1.000" });
  if (amount > 10_000_000)
    return res.status(400).json({ message: "Maksimal top up Rp 10.000.000" });

  try {
    const r = await fetchWithTimeout(`${config.zakkiApi}/topup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: config.zakkiToken, nominal: amount }),
    });
    const d = await r.json();

    if (d.code !== 201 || !d.data?.id_transaksi) {
      return res.status(400).json({ message: d.message || "Gagal membuat QRIS" });
    }

    const zakki_id = d.data.id_transaksi;
    const total = d.data.rincian?.total_bayar ?? amount;

    db.prepare(
      `INSERT INTO topups (user_id, id_transaksi, nominal, nominal_total, qris_image, qris_content)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(req.user.id, zakki_id, amount, total, d.data.qris_image, d.data.qris_content);

    res.status(201).json({
      id_transaksi: zakki_id,
      nominal: amount,
      nominal_total: total,
      qris_image: d.data.qris_image,
      qris_content: d.data.qris_content,
    });
  } catch (err) {
    logger.error("topup/create:", err.message);
    res.status(502).json({ message: "Gagal terhubung ke gateway pembayaran" });
  }
});

router.get("/status/:id", auth, async (req, res) => {
  const topup = db
    .prepare("SELECT * FROM topups WHERE id_transaksi = ? AND user_id = ?")
    .get(req.params.id, req.user.id);

  if (!topup) return res.status(404).json({ message: "Transaksi tidak ditemukan" });
  if (topup.status === "SUCCESS")
    return res.json({ status: "SUCCESS", nominal: topup.nominal, settled_at: topup.settled_at });

  try {
    const r = await fetchWithTimeout(`${config.zakkiApi}/cektopup?idtopup=${encodeURIComponent(req.params.id)}`);
    const d = await r.json();

    if (d.code === 200 && d.kategori_status === "SUCCESS") {
      settleTopup(topup);
      return res.json({ status: "SUCCESS", nominal: topup.nominal });
    }
    res.json({ status: topup.status });
  } catch (err) {
    logger.error("topup/status:", err.message);
    res.json({ status: topup.status });
  }
});

/**
 * Webhook callback dari Zakki. Karena hosting gratis (Railway/Vercel) tidak
 * punya IP statis yang bisa di-whitelist, keamanan dilakukan dengan secret
 * key di query string, BUKAN dengan whitelist IP.
 *
 * Daftarkan URL ke Zakki dengan format:
 *   https://<domain-backend>/api/topup/webhook?key=<WEBHOOK_SECRET>
 *
 * via endpoint setcallback Zakki:
 *   GET {ZAKKI_API}/setcallback?token={ZAKKI_TOKEN}&site=<url-di-atas, url-encoded>
 */
router.post("/webhook", (req, res) => {
  if (config.webhookSecret) {
    const key = req.query.key || req.headers["x-webhook-key"];
    if (key !== config.webhookSecret) {
      logger.warn("Webhook ditolak: key tidak valid dari IP", req.ip);
      return res.status(401).json({ ok: false, message: "Unauthorized" });
    }
  }

  const { id_transaksi } = req.body || {};
  if (!id_transaksi) return res.status(400).json({ ok: false, message: "id_transaksi wajib diisi" });

  const topup = db.prepare("SELECT * FROM topups WHERE id_transaksi = ?").get(id_transaksi);
  if (!topup) return res.status(404).json({ ok: false, message: "Transaksi tidak ditemukan" });

  // Idempoten: kalau sudah SUCCESS sebelumnya, jangan tambah saldo lagi
  if (topup.status === "SUCCESS") return res.json({ ok: true, already: true });

  settleTopup(topup);
  res.json({ ok: true });
});

router.get("/history", auth, (req, res) => {
  const list = db
    .prepare(
      "SELECT id_transaksi, nominal, nominal_total, status, created_at, settled_at FROM topups WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
    )
    .all(req.user.id);
  res.json(list);
});

/**
 * Tandai topup sukses dan tambahkan saldo user secara atomik + tercatat di
 * balance_logs. Dipakai oleh /status polling dan /webhook callback.
 */
function settleTopup(topup) {
  const tx = db.transaction(() => {
    const fresh = db.prepare("SELECT * FROM topups WHERE id_transaksi = ?").get(topup.id_transaksi);
    if (!fresh || fresh.status === "SUCCESS") return; // sudah diproses request lain
    db.prepare("UPDATE topups SET status='SUCCESS', settled_at=CURRENT_TIMESTAMP WHERE id_transaksi=?").run(topup.id_transaksi);
    db.adjustBalance(fresh.user_id, fresh.nominal, "TOPUP", fresh.id_transaksi, "Top up via QRIS");
  });
  tx();
}

module.exports = router;
