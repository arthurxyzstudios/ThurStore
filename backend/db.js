const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "ppob.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    password TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'user',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS topups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    id_transaksi TEXT UNIQUE NOT NULL,
    nominal INTEGER NOT NULL,
    nominal_total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    qris_image TEXT,
    qris_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    settled_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ref_id TEXT UNIQUE NOT NULL,
    server_id TEXT,
    produk TEXT NOT NULL,
    kode TEXT NOT NULL,
    tujuan TEXT NOT NULL,
    harga INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    sn TEXT,
    keterangan TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- Catatan setiap perubahan saldo (audit trail), supaya saldo tidak pernah
  -- "menghilang" tanpa jejak dan memudahkan debugging.
  CREATE TABLE IF NOT EXISTS balance_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,            -- TOPUP, ORDER, REFUND, ADJUST
    amount INTEGER NOT NULL,       -- bisa negatif
    balance_after INTEGER NOT NULL,
    reference TEXT,                -- ref_id / id_transaksi terkait
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_topups_user ON topups(user_id);
  CREATE INDEX IF NOT EXISTS idx_topups_status ON topups(status);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_balance_logs_user ON balance_logs(user_id);

  -- Voucher saldo (kode promo yang bisa diklaim user untuk nambah saldo)
  CREATE TABLE IF NOT EXISTS vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    nominal INTEGER NOT NULL,          -- jumlah saldo yang didapat per klaim
    quota INTEGER NOT NULL DEFAULT 1,  -- total berapa kali voucher ini bisa diklaim
    used_count INTEGER NOT NULL DEFAULT 0,
    max_per_user INTEGER NOT NULL DEFAULT 1, -- berapa kali 1 user boleh klaim kode ini
    min_topup INTEGER NOT NULL DEFAULT 0,    -- (reserved) syarat minimal topup, 0 = tidak ada syarat
    expires_at DATETIME,               -- NULL = tidak expired
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  -- Riwayat klaim voucher per user (mencegah klaim berulang melebihi max_per_user)
  CREATE TABLE IF NOT EXISTS voucher_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    nominal INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voucher_id) REFERENCES vouchers(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
  CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user ON voucher_redemptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions(voucher_id);
`);

/**
 * Helper transaksional: ubah saldo user dan catat ke balance_logs sekaligus.
 * amount boleh negatif (potongan saldo).
 */
function adjustBalance(userId, amount, type, reference, note) {
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amount, userId);
    const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(userId);
    db.prepare(
      `INSERT INTO balance_logs (user_id, type, amount, balance_after, reference, note)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, type, amount, user.balance, reference || null, note || null);
    return user.balance;
  });
  return tx();
}

module.exports = db;
module.exports.adjustBalance = adjustBalance;
