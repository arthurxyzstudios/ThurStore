// api/topup/status/[id].js
const db = require("../../../lib/db");
const config = require("../../../lib/config");
const { requireAuth } = require("../../../lib/auth");
const { withHandler } = require("../../../lib/http");
const { settleTopup } = require("../../../lib/topup");

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
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

  const authUser = await requireAuth(req);
  const { id } = req.query;

  const topup = await db.one("SELECT * FROM topups WHERE id_transaksi = $1 AND user_id = $2", [id, authUser.id]);
  if (!topup) return res.status(404).json({ message: "Transaksi tidak ditemukan" });
  if (topup.status === "SUCCESS")
    return res.json({ status: "SUCCESS", nominal: Number(topup.nominal), settled_at: topup.settled_at });

  try {
    const r = await fetchWithTimeout(`${config.zakkiApi}/cektopup?idtopup=${encodeURIComponent(id)}`);
    const d = await r.json();

    if (d.code === 200 && d.kategori_status === "SUCCESS") {
      await settleTopup(id);
      return res.json({ status: "SUCCESS", nominal: Number(topup.nominal) });
    }
    res.json({ status: topup.status });
  } catch (err) {
    console.error("topup/status:", err.message);
    res.json({ status: topup.status });
  }
});
