-- Thurs PPOB — Schema PostgreSQL
-- Kompatibel dengan Vercel Postgres (Neon) / Supabase / Railway Postgres.
--
-- Cara pakai:
--   1. Buat database Postgres (mis. Vercel Storage -> Postgres, atau Neon).
--   2. Jalankan file ini sekali via SQL editor / psql:
--        psql "$POSTGRES_URL" -f sql/schema.sql
--   3. Set environment variable POSTGRES_URL (atau POSTGRES_URL_NON_POOLING)
--      di Vercel Project Settings -> Environment Variables.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  password TEXT NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS topups (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  id_transaksi TEXT UNIQUE NOT NULL,
  nominal BIGINT NOT NULL,
  nominal_total BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  qris_image TEXT,
  qris_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  ref_id TEXT UNIQUE NOT NULL,
  server_id TEXT,
  produk TEXT NOT NULL,
  kode TEXT NOT NULL,
  tujuan TEXT NOT NULL,
  harga BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  sn TEXT,
  keterangan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Catatan setiap perubahan saldo (audit trail), supaya saldo tidak pernah
-- "menghilang" tanpa jejak dan memudahkan debugging.
CREATE TABLE IF NOT EXISTS balance_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,            -- TOPUP, ORDER, REFUND, ADJUST, VOUCHER
  amount BIGINT NOT NULL,        -- bisa negatif
  balance_after BIGINT NOT NULL,
  reference TEXT,                -- ref_id / id_transaksi terkait
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Voucher saldo (kode promo yang bisa diklaim user untuk nambah saldo)
CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  nominal BIGINT NOT NULL,            -- jumlah saldo yang didapat per klaim
  quota INTEGER NOT NULL DEFAULT 1,   -- total berapa kali voucher ini bisa diklaim
  used_count INTEGER NOT NULL DEFAULT 0,
  max_per_user INTEGER NOT NULL DEFAULT 1, -- berapa kali 1 user boleh klaim kode ini
  min_topup BIGINT NOT NULL DEFAULT 0,     -- (reserved) syarat minimal topup, 0 = tidak ada syarat
  expires_at TIMESTAMPTZ,              -- NULL = tidak expired
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Riwayat klaim voucher per user (mencegah klaim berulang melebihi max_per_user)
CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id SERIAL PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  nominal BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_topups_user ON topups(user_id);
CREATE INDEX IF NOT EXISTS idx_topups_status ON topups(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_balance_logs_user ON balance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_user ON voucher_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_voucher_redemptions_voucher ON voucher_redemptions(voucher_id);

-- Trigger untuk auto-update kolom updated_at pada tabel orders
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
