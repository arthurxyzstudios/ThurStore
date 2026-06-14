// lib/db.js
// Koneksi PostgreSQL untuk environment serverless (Vercel).
//
// Memakai package "pg" dengan connection pooling yang aman untuk serverless:
// - max: 1  -> tiap function instance cukup 1 koneksi (hindari kehabisan slot DB)
// - Pool di-cache di global supaya tidak dibuat ulang setiap invocation (warm start)
//
// Set salah satu environment variable berikut di Vercel:
//   POSTGRES_URL              (connection string pooled — disarankan, dari Neon/Vercel Postgres)
//   POSTGRES_URL_NON_POOLING  (fallback)
//   DATABASE_URL              (fallback umum)

const { Pool } = require("pg");

const connectionString =
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "[DB] POSTGRES_URL / DATABASE_URL belum diset. Tambahkan di Vercel -> Settings -> Environment Variables."
  );
}

function getPool() {
  if (!global.__zakkipayPool) {
    global.__zakkipayPool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: connectionString && connectionString.includes("sslmode=disable")
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return global.__zakkipayPool;
}

/**
 * Jalankan query SQL. Mengembalikan { rows, rowCount }.
 * @param {string} text - SQL query (placeholder $1, $2, ...)
 * @param {any[]} params
 */
async function query(text, params = []) {
  const pool = getPool();
  return pool.query(text, params);
}

/** Ambil satu baris pertama, atau null kalau tidak ada hasil. */
async function one(text, params = []) {
  const r = await query(text, params);
  return r.rows[0] || null;
}

/** Ambil semua baris hasil query. */
async function many(text, params = []) {
  const r = await query(text, params);
  return r.rows;
}

/**
 * Jalankan beberapa query dalam satu transaksi atomik.
 * fn menerima `client` (punya method .query) dan harus return nilai akhir.
 * Kalau fn throw, transaksi otomatis ROLLBACK.
 */
async function transaction(fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Helper: ubah saldo user dan catat ke balance_logs sekaligus, atomik.
 * amount boleh negatif (potongan saldo).
 * Bisa dipanggil di dalam transaksi yang sudah berjalan dengan memberikan
 * `client` (mis. saat dipanggil dari fungsi transaction lain), atau tanpa
 * client untuk membuat transaksi baru sendiri.
 */
async function adjustBalance(userId, amount, type, reference, note, client) {
  const run = async (c) => {
    await c.query("UPDATE users SET balance = balance + $1 WHERE id = $2", [amount, userId]);
    const userRes = await c.query("SELECT balance FROM users WHERE id = $1", [userId]);
    const balance = userRes.rows[0].balance;
    await c.query(
      `INSERT INTO balance_logs (user_id, type, amount, balance_after, reference, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, amount, balance, reference || null, note || null]
    );
    return Number(balance);
  };

  if (client) return run(client);
  return transaction(run);
}

module.exports = { query, one, many, transaction, adjustBalance, getPool };
