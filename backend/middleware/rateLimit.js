/**
 * Rate limiter sederhana berbasis memori (cukup untuk single-instance
 * deployment seperti Railway free tier). Membatasi jumlah request per IP
 * dalam jendela waktu tertentu.
 */
function rateLimit({ windowMs = 60_000, max = 30, message = "Terlalu banyak request, coba lagi sebentar" } = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start > windowMs) hits.delete(key);
    }
  }, windowMs).unref?.();

  return (req, res, next) => {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now - entry.start > windowMs) {
      entry = { count: 0, start: now };
      hits.set(key, entry);
    }

    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ message });
    }
    next();
  };
}

module.exports = rateLimit;
