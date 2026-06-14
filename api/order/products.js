// api/order/products.js
const config = require("../../lib/config");
const { withHandler } = require("../../lib/http");

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
  if (req.method !== "GET") return res.status(405).json({ message: "Method tidak diizinkan" });

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
    console.error("order/products:", err.message);
    res.status(502).json({ message: "Gagal mengambil produk dari gateway" });
  }
});
