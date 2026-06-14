require("dotenv").config();
const express = require("express");
const cors = require("cors");
const config = require("./config");
const logger = require("./logger");
const rateLimit = require("./middleware/rateLimit");

const app = express();

// Wajib untuk Railway/Render/Vercel agar req.ip & rate limiting akurat
// (mereka berjalan di belakang reverse proxy).
app.set("trust proxy", 1);

// ---- Security headers dasar (tanpa dependency tambahan) ----
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// ---- CORS ----
const allowAll = config.frontendOrigins.includes("*");
app.use(
  cors({
    origin: allowAll
      ? true
      : (origin, cb) => {
          if (!origin || config.frontendOrigins.includes(origin)) return cb(null, true);
          cb(new Error("Origin tidak diizinkan oleh CORS"));
        },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));

// ---- Global rate limit (anti spam dasar) ----
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

// ---- Routes ----
app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, max: 20, message: "Terlalu banyak percobaan login/registrasi, coba lagi nanti" }), require("./routes/auth"));
app.use("/api/topup", require("./routes/topup"));
app.use("/api/order", require("./routes/order"));
app.use("/api/user", require("./routes/user"));
app.use("/api/voucher", require("./routes/voucher"));
app.use("/api/admin", require("./routes/admin"));

app.get("/", (_, res) => res.json({ status: "ZakkiPay Backend OK", time: new Date().toISOString() }));
app.get("/health", (_, res) => res.json({ ok: true }));

// ---- 404 handler ----
app.use((req, res) => res.status(404).json({ message: "Endpoint tidak ditemukan" }));

// ---- Global error handler ----
app.use((err, req, res, next) => {
  logger.error(err);
  if (err.message === "Origin tidak diizinkan oleh CORS") {
    return res.status(403).json({ message: err.message });
  }
  res.status(500).json({ message: "Terjadi kesalahan pada server" });
});

const server = app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port} (${config.nodeEnv})`);
});

// Graceful shutdown supaya DB tidak corrupt saat platform restart container
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down...");
  server.close(() => process.exit(0));
});
