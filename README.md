# ZakkiPay PPOB (v2 — upgraded)

## Struktur Project
```
zakkipay/
├── backend/
│   ├── index.js
│   ├── config.js          ← validasi & load semua env
│   ├── logger.js
│   ├── db.js               ← + balance_logs (audit trail saldo)
│   ├── .env                ← SUDAH diisi (JWT_SECRET random siap pakai)
│   ├── .env.example
│   ├── middleware/
│   │   ├── auth.js          ← cek user aktif + role
│   │   ├── admin.js
│   │   └── rateLimit.js      ← anti spam tanpa dependency tambahan
│   └── routes/
│       ├── auth.js          ← validasi email/phone, pesan generik saat login gagal
│       ├── topup.js         ← webhook pakai secret key, idempotent
│       ├── order.js         ← saldo atomik + auto refund jika gagal
│       └── user.js          ← + /balance-history
└── frontend/
    ├── package.json
    ├── public/index.html
    └── src/
        ├── index.js
        └── App.jsx           ← API URL via REACT_APP_API_URL
```

## Apa yang berubah dari versi sebelumnya

- **JWT_SECRET sudah diisi otomatis** dengan string random aman (48 byte hex) di `.env`. Tidak perlu diisi manual. Kalau mau ganti, generate ulang dengan:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- **Webhook/callback sekarang divalidasi pakai secret key**, bukan whitelist IP (cocok untuk Railway/Render/Vercel yang IP-nya dinamis).
- **Audit trail saldo** (`balance_logs`): setiap top up, pembelian, refund tercatat — saldo tidak akan "hilang" tanpa jejak.
- **Saldo & order atomik**: kalau gateway gagal/timeout saat `buy`, saldo otomatis dikembalikan (refund) dan order dicatat `FAILED`.
- **Validasi input lebih ketat** di register/login (format email, panjang nomor HP, dll), pesan error login digeneralisasi (tidak bilang "email tidak ditemukan" — mencegah enumerasi akun).
- **Rate limiting** bawaan (tanpa dependency baru): 120 req/menit global, 20 req/15menit khusus `/api/auth`.
- **Security headers dasar** (`X-Content-Type-Options`, `X-Frame-Options`, dst) dan **CORS dibatasi** ke domain frontend kamu (`FRONTEND_ORIGIN`).
- **Graceful shutdown** + WAL mode SQLite agar tidak corrupt saat container restart.
- **trust proxy** diaktifkan — wajib untuk Railway/Render agar IP & rate limit akurat.

---

## ⚠️ PENTING: SQLite + Railway free tier

`better-sqlite3` menyimpan data ke file `ppob.db` di disk container. **Railway free tier menggunakan ephemeral filesystem** — setiap kali redeploy, file ini bisa hilang (saldo & history user ikut hilang).

Untuk produksi yang serius, sebaiknya:
- Gunakan **Railway Volume** (mount persistent disk ke folder backend), atau
- Migrasi ke database eksternal (PostgreSQL — Railway/Neon/Supabase punya free tier dengan storage persisten).

Untuk testing/skala kecil, SQLite + Volume sudah cukup.

---

## Setup Backend (lokal)

```bash
cd backend
npm install
npm start
```

`.env` sudah terisi JWT_SECRET. Yang **wajib kamu cek/isi sendiri**:
- `ZAKKI_TOKEN` & `ZAKKI_API` — sudah ada nilai default, ganti kalau token kamu berbeda
- `WEBHOOK_SECRET` — ganti dengan string acak (lihat bagian Callback di bawah)
- `FRONTEND_ORIGIN` — domain Vercel kamu setelah deploy

## Setup Frontend (lokal)

```bash
cd frontend
npm install
npm start
```

Untuk production, buat file `.env` di folder frontend:
```
REACT_APP_API_URL=https://NAMA-BACKEND-KAMU.up.railway.app/api
```

---

## 🔗 Setup Callback / Webhook (WAJIB)

Sebelumnya endpoint webhook (`/api/topup/webhook`) sudah ada di kode, tapi belum aman karena tidak ada IP whitelist dan IP Railway/Vercel memang **dinamis** (tidak bisa di-whitelist). Solusinya: pakai **secret key di URL**.

### 1. Generate secret
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Masukkan hasilnya ke `.env` sebagai `WEBHOOK_SECRET`.

### 2. Daftarkan URL webhook ke Zakki
Setelah backend live di Railway (misal `https://zakkipay-backend.up.railway.app`), buka URL ini sekali di browser (atau curl):

```
https://qris.zakki.store/setcallback?token=22ab8cb71fe2bb&site=https%3A%2F%2Fzakkipay-backend.up.railway.app%2Fapi%2Ftopup%2Fwebhook%3Fkey%3DISI_WEBHOOK_SECRET_KAMU
```

> Catatan: `site` harus URL-encoded karena mengandung `?` dan `&`. Ganti `ISI_WEBHOOK_SECRET_KAMU` dengan nilai `WEBHOOK_SECRET` di `.env`.

### 3. Cara kerja
- User bayar QRIS → Zakki kirim `POST` ke `/api/topup/webhook?key=...`
- Backend cek `key` cocok dengan `WEBHOOK_SECRET` → kalau cocok, saldo user ditambahkan otomatis
- Idempotent: kalau Zakki kirim callback dua kali untuk transaksi yang sama, saldo **tidak** ditambah dua kali
- Sebagai fallback, frontend juga polling `/api/topup/status/:id` setiap beberapa detik (jaga-jaga kalau webhook gagal terkirim)

Tanpa `WEBHOOK_SECRET` di-set, endpoint tetap berfungsi tapi **tanpa validasi** (siapapun yang tahu URL bisa memicu penambahan saldo palsu) — selalu set ini di production.

---

## Flow Saldo

1. User topup 10k → dapat QRIS
2. User bayar QRIS
3. Zakki kirim webhook ke `/api/topup/webhook?key=...` (atau frontend polling status)
4. Saldo user +10k di DB kamu (tercatat di `balance_logs`)
5. Saldo gateway Zakki kamu otomatis +10k juga

---

## Hosting Gratis

### Backend → Railway.app
1. Push folder `/backend` ke GitHub
2. Connect repo di railway.app
3. Set semua environment variable dari `.env` (terutama `ZAKKI_TOKEN`, `JWT_SECRET`, `WEBHOOK_SECRET`, `FRONTEND_ORIGIN`)
4. (Opsional, disarankan) Tambahkan **Volume** dan mount ke `/app` agar `ppob.db` persisten antar deploy
5. Deploy otomatis — catat URL yang diberikan Railway

### Frontend → Vercel
1. Push folder `/frontend` ke GitHub
2. Connect di vercel.com, framework: Create React App
3. Set env var `REACT_APP_API_URL` = `https://<url-railway-kamu>/api`
4. Deploy

### Setelah keduanya live
1. Update `FRONTEND_ORIGIN` di Railway dengan domain Vercel kamu, redeploy
2. Daftarkan webhook seperti langkah di atas

---

## 👑 Fitur Admin

### 1. Jadikan diri sendiri admin
Register dulu lewat aplikasi seperti biasa, lalu jalankan di server (Railway shell / lokal):
```bash
cd backend
npm run make-admin -- email@kamu.com
```
Setelah itu, login ulang (token lama tidak punya role admin) untuk mendapat akses penuh.

### 2. Endpoint Admin (semua butuh header `Authorization: Bearer <token>` milik admin)

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/admin/stats` | Ringkasan: total user, total saldo beredar, statistik topup/order/voucher |
| GET | `/api/admin/users?q=keyword` | Cari/list user |
| GET | `/api/admin/users/:id` | Detail user + 10 order/topup terakhir + 20 log saldo |
| POST | `/api/admin/users/:id/balance` | `{ amount, note }` — tambah/kurangi saldo manual (boleh negatif) |
| POST | `/api/admin/users/:id/status` | `{ is_active: true/false }` — ban/unban user |
| POST | `/api/admin/users/:id/role` | `{ role: "admin" \| "user" }` — ubah role |
| GET | `/api/admin/orders?status=SUCCESS` | List semua order (filter opsional) |
| GET | `/api/admin/topups?status=PENDING` | List semua topup (filter opsional) |
| GET | `/api/admin/vouchers` | List semua voucher |
| POST | `/api/admin/vouchers` | Buat voucher baru (lihat format di bawah) |
| PATCH | `/api/admin/vouchers/:id` | Edit voucher (nominal, kuota, status, expired, dst) |
| DELETE | `/api/admin/vouchers/:id` | Nonaktifkan voucher (soft delete) |
| GET | `/api/admin/vouchers/:id/redemptions` | Lihat siapa saja yang klaim voucher tertentu |

Admin tidak bisa menonaktifkan / mengubah role akun miliknya sendiri (mencegah lockout).

---

## 🎟️ Sistem Voucher

Voucher = kode promo yang user masukkan untuk menambah saldo, tanpa perlu top up QRIS.

### Membuat voucher (admin)
```http
POST /api/admin/vouchers
{
  "code": "GASKEUN50K",
  "nominal": 50000,       // saldo yang didapat tiap klaim
  "quota": 100,            // total bisa diklaim 100x (oleh siapapun, gabungan)
  "max_per_user": 1,       // tiap user maksimal klaim 1x kode ini
  "expires_at": "2026-12-31T23:59:59"  // opsional, null = tidak expired
}
```

### Klaim voucher (user)
```http
POST /api/voucher/redeem
Authorization: Bearer <token>
{ "code": "GASKEUN50K" }
```
Respons sukses: saldo bertambah otomatis + tercatat di `balance_logs` (tipe `VOUCHER`) dan `voucher_redemptions`.

Validasi otomatis: kode tidak ditemukan, voucher nonaktif, sudah expired, kuota habis, atau user sudah pernah klaim — semua dicek di satu transaksi atomik (anti race-condition saat banyak user klaim bersamaan).

### Riwayat klaim user
```http
GET /api/voucher/history
```

---

## Skema Database Tambahan

```sql
vouchers(id, code, nominal, quota, used_count, max_per_user, min_topup, expires_at, is_active, created_by, created_at)
voucher_redemptions(id, voucher_id, user_id, nominal, created_at)
```

Catatan klaim voucher juga otomatis tercatat di `balance_logs` dengan `type = 'VOUCHER'`, jadi histori saldo user tetap satu sumber kebenaran (single source of truth).
