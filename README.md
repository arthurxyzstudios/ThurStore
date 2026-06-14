# ZakkiPay PPOB (v3 — Vercel Serverless + PostgreSQL)

Versi ini dirombak total agar bisa di-deploy langsung ke **Vercel** (frontend + backend
dalam satu project), dengan database **PostgreSQL** (Vercel Postgres / Neon / Supabase /
Railway Postgres — semua kompatibel) menggantikan SQLite.

## Mengapa dirombak?

Versi sebelumnya pakai Express + `better-sqlite3` yang menyimpan data ke file `ppob.db`
di disk. Vercel adalah platform **serverless**: filesystem-nya read-only dan setiap
request bisa dijalankan di instance berbeda — jadi file SQLite **tidak bisa dipakai**
(data hilang / tidak konsisten antar request).

Solusi: backend ditulis ulang sebagai **Vercel Serverless Functions** (folder `api/`),
dan storage dipindah ke **PostgreSQL** (database eksternal yang persisten, gratis di
Neon/Vercel Postgres/Supabase).

## Struktur Project

```
zakkipay/
├── api/                     ← Setiap file = 1 serverless function (Vercel)
│   ├── auth/
│   │   ├── register.js       POST /api/auth/register
│   │   └── login.js           POST /api/auth/login
│   ├── user/
│   │   ├── me.js               GET /api/user/me
│   │   └── balance-history.js  GET /api/user/balance-history
│   ├── topup/
│   │   ├── create.js          POST /api/topup/create
│   │   ├── status/[id].js      GET /api/topup/status/:id
│   │   ├── webhook.js         POST /api/topup/webhook?key=...
│   │   └── history.js          GET /api/topup/history
│   ├── order/
│   │   ├── products.js         GET /api/order/products
│   │   ├── buy.js              POST /api/order/buy
│   │   └── history.js          GET /api/order/history
│   ├── voucher/
│   │   ├── redeem.js          POST /api/voucher/redeem
│   │   └── history.js          GET /api/voucher/history
│   ├── admin/
│   │   ├── stats.js            GET /api/admin/stats
│   │   ├── orders.js           GET /api/admin/orders
│   │   ├── topups.js           GET /api/admin/topups
│   │   ├── users/index.js      GET /api/admin/users
│   │   ├── users/[id]/
│   │   │   ├── index.js        GET /api/admin/users/:id
│   │   │   ├── balance.js      POST /api/admin/users/:id/balance
│   │   │   ├── status.js       POST /api/admin/users/:id/status
│   │   │   └── role.js         POST /api/admin/users/:id/role
│   │   └── vouchers/
│   │       ├── index.js        GET/POST /api/admin/vouchers
│   │       └── [id]/
│   │           ├── index.js     PATCH/DELETE /api/admin/vouchers/:id
│   │           └── redemptions/index.js  GET /api/admin/vouchers/:id/redemptions
│   ├── health.js               GET /api/health
│   └── index.js                 GET /api
├── lib/                     ← Modul bersama, dipakai semua function di atas
│   ├── db.js                 Koneksi PostgreSQL (pg Pool, transaction, adjustBalance)
│   ├── config.js             Load & validasi environment variables
│   ├── auth.js               JWT sign/verify, requireAuth, requireAdmin
│   ├── http.js               CORS, body parsing, error handler, rate limit
│   └── topup.js              Logic settle topup (shared status & webhook)
├── sql/
│   └── schema.sql            Skema PostgreSQL — jalankan sekali di database kamu
├── scripts/
│   └── make-admin.js         CLI untuk jadikan user admin (jalan dari lokal)
├── frontend/                  React app (tidak banyak berubah, lihat di bawah)
├── package.json
├── vercel.json
└── .env.example
```

## Cara Deploy ke Vercel

### 1. Siapkan database PostgreSQL

Pilih salah satu (semua punya free tier):

- **Vercel Postgres** (Storage tab di dashboard project Vercel) — paling mudah karena
  `POSTGRES_URL` otomatis terhubung ke project.
- **Neon** (neon.tech) — buat project, copy connection string.
- **Supabase** atau **Railway Postgres** — sama, copy connection string.

Setelah punya connection string, jalankan skema:

```bash
psql "postgresql://user:pass@host/dbname?sslmode=require" -f sql/schema.sql
```

Atau paste isi `sql/schema.sql` ke SQL editor (Neon/Supabase keduanya punya SQL editor
di dashboard).

### 2. Push project ke GitHub, lalu import ke Vercel

Saat import project di Vercel:

- **Framework Preset**: pilih "Other" (root `vercel.json` sudah mengatur build).
- Vercel akan otomatis mendeteksi folder `api/` sebagai Serverless Functions dan
  menjalankan `cd frontend && npm install && npm run build` untuk frontend (lihat
  `vercel.json`).

### 3. Set Environment Variables di Vercel

Buka **Project Settings → Environment Variables**, isi sesuai `.env.example`:

| Variable | Wajib | Keterangan |
|---|---|---|
| `POSTGRES_URL` | ✅ | Connection string Postgres (otomatis terisi kalau pakai Vercel Postgres) |
| `ZAKKI_TOKEN` | ✅ | Token dari Zakki QRIS gateway |
| `ZAKKI_API` | opsional | Default `https://qris.zakki.store` |
| `JWT_SECRET` | ✅ | String random ≥32 karakter, **harus permanen** (generate sekali, jangan diganti-ganti) |
| `JWT_EXPIRES_IN` | opsional | Default `7d` |
| `WEBHOOK_SECRET` | ✅ (untuk webhook) | String rahasia untuk validasi callback Zakki |
| `FRONTEND_ORIGIN` | opsional | `*` jika frontend & backend satu project (default) |

Generate `JWT_SECRET` dan `WEBHOOK_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

⚠️ **Penting**: `JWT_SECRET` harus sama di semua deployment dan tidak boleh berubah,
karena setiap kali berubah, semua user yang sedang login akan ter-logout.

### 4. Daftarkan Webhook ke Zakki (opsional, untuk auto-deteksi pembayaran)

Setelah deploy, daftarkan callback URL agar saldo otomatis bertambah saat QRIS dibayar
(selain polling `/api/topup/status/:id` yang sudah berjalan dari frontend):

```
GET https://qris.zakki.store/setcallback?token=ZAKKI_TOKEN&site=https%3A%2F%2Fdomain-kamu.vercel.app%2Fapi%2Ftopup%2Fwebhook%3Fkey%3DWEBHOOK_SECRET
```

(Ganti `domain-kamu.vercel.app`, `ZAKKI_TOKEN`, dan `WEBHOOK_SECRET` sesuai konfigurasi
kamu, dan pastikan seluruh URL ter-encode dengan benar.)

### 5. Jadikan akun pertama sebagai admin

Setelah register lewat aplikasi, jalankan dari komputer lokal (butuh akses ke
`POSTGRES_URL`):

```bash
npm install
POSTGRES_URL="postgresql://...(connection string production)" npm run make-admin -- email@kamu.com
```

## Frontend

Frontend (React) tidak banyak berubah secara fungsional. Yang diubah:

- `REACT_APP_API_URL` default sekarang `/api` (same-origin), cocok untuk deploy
  frontend+backend dalam satu project Vercel. Kalau backend di-deploy terpisah, set
  `REACT_APP_API_URL=https://domain-backend.vercel.app/api` di Environment Variables
  Vercel untuk project frontend.

## Apa yang berubah dari v2 (penting!)

- **Database**: SQLite (`better-sqlite3`) → **PostgreSQL** (`pg`), karena Vercel
  filesystem-nya read-only & ephemeral. Semua tabel & index dipindah ke
  `sql/schema.sql` (Postgres syntax: `SERIAL`, `BOOLEAN`, `TIMESTAMPTZ`, `ILIKE`, dll).
- **Struktur backend**: Express monolith (`backend/index.js` + `routes/*.js`) →
  **Vercel Serverless Functions** (`api/**/*.js`), satu file = satu endpoint, memakai
  Node `fetch` bawaan (tidak perlu `node-fetch`).
- **Transaksi atomik & audit trail saldo** (`balance_logs`, `adjustBalance`) tetap
  dipertahankan — sekarang via `pg` transaction (`BEGIN`/`COMMIT`/`ROLLBACK`) dengan
  `SELECT ... FOR UPDATE` untuk mencegah race condition saat saldo dipotong.
- **CORS & security headers**: dipindah ke `lib/http.js`, dipasang di setiap function
  (karena tidak ada middleware global seperti Express).
- **Rate limiting**: tetap berbasis memori per-instance (`lib/http.js`), cukup sebagai
  lapisan tambahan dasar. Untuk perlindungan lebih kuat di skala besar, pertimbangkan
  Vercel Firewall atau Upstash Ratelimit (Redis).
- **Webhook**: logic settle topup dipindah ke `lib/topup.js` agar dipakai bersama oleh
  endpoint status (polling) dan webhook — tetap idempoten.
- **`scripts/make-admin.js`**: sekarang konek ke Postgres production via
  `POSTGRES_URL`, dijalankan dari lokal.
- Folder `backend/` (Express + SQLite) **dihapus total**, diganti `api/` + `lib/`.

## Catatan keamanan

- Jangan commit file `.env` berisi `POSTGRES_URL`, `JWT_SECRET`, `ZAKKI_TOKEN`, atau
  `WEBHOOK_SECRET` ke git — gunakan Environment Variables di Vercel.
- `WEBHOOK_SECRET` wajib diisi di production, atau siapa pun yang tahu URL webhook bisa
  memicu penambahan saldo palsu.
