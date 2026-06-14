/**
 * Jadikan user menjadi admin lewat command line (jalankan sekali di server).
 *
 * Cara pakai:
 *   node scripts/make-admin.js email@kamu.com
 *
 * User harus sudah register lewat halaman biasa terlebih dahulu.
 */
const db = require("../db");

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Penggunaan: node scripts/make-admin.js email@kamu.com");
  process.exit(1);
}

const user = db.prepare("SELECT id, name, email, role FROM users WHERE email = ?").get(email);
if (!user) {
  console.error(`User dengan email "${email}" tidak ditemukan. Register dulu lewat aplikasi.`);
  process.exit(1);
}

if (user.role === "admin") {
  console.log(`User "${user.email}" sudah admin.`);
  process.exit(0);
}

db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
console.log(`User "${user.email}" (id=${user.id}) sekarang menjadi admin.`);
