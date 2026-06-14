/**
 * Jadikan user menjadi admin lewat command line (jalankan dari komputer lokal,
 * terhubung ke database Postgres production via POSTGRES_URL).
 *
 * Cara pakai:
 *   POSTGRES_URL="postgres://..." node scripts/make-admin.js email@kamu.com
 *
 * User harus sudah register lewat aplikasi terlebih dahulu.
 */
require("dotenv").config();
const { Pool } = require("pg");

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Penggunaan: node scripts/make-admin.js email@kamu.com");
  process.exit(1);
}

const connectionString = process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Set environment variable POSTGRES_URL terlebih dahulu.");
  process.exit(1);
}

const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  const { rows } = await pool.query("SELECT id, name, email, role FROM users WHERE email = $1", [email]);
  const user = rows[0];

  if (!user) {
    console.error(`User dengan email "${email}" tidak ditemukan. Register dulu lewat aplikasi.`);
    process.exit(1);
  }

  if (user.role === "admin") {
    console.log(`User "${user.email}" sudah admin.`);
    process.exit(0);
  }

  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [user.id]);
  console.log(`User "${user.email}" (id=${user.id}) sekarang menjadi admin.`);
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
