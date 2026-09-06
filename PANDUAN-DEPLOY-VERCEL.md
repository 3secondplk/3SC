# 🚀 Panduan Deploy Vercel — CMS Crew Management System (3SC)

Aplikasi **CMS Crew Management System** — dashboard penjualan Crew per Zoning,
lengkap dengan:

- ✅ **Detail Report Summary Penjualan Brand & Dept per Zoning** (isolated per
  Zoning, berdasarkan Claim dari penjualan Crew) — tersedia di **public detail
  Zoning Dashboard** (daily / weekly / monthly aware)
- ✅ Progress bar **% Acv mingguan** di kartu Zoning (auto-detect target %
  vs nominal)
- ✅ Tab **Achievement** crew dashboard menampilkan **nominal Rp** (bukan %)
- ✅ Filter **Bulanan (monthly)** terisolasi untuk detail Zoning & report summary
- ✅ Claim penjualan crew, TikTok sales, activity log, export Excel (xlsx)

---

## 1. Prasyarat

| Kebutuhan | Keterangan |
|---|---|
| Akun Vercel | gratis — https://vercel.com |
| Database PostgreSQL | Vercel Postgres / Neon / Supabase (semua punya free tier) |
| Node.js ≥ 20 (opsional, untuk setup DB dari lokal) | https://nodejs.org |
| Bun **atau** npm (opsional, untuk seed data demo) | https://bun.sh |

> ⚠️ **Kenapa PostgreSQL?** Filesystem Vercel bersifat *read-only & ephemeral*
> (serverless), jadi SQLite tidak bisa dipakai di production. ZIP ini sudah
> diset ke `provider = "postgresql"` pada `prisma/schema.prisma`.

---

## 2. Siapkan Database PostgreSQL

Pilih salah satu (semua gratis untuk skala kecil):

**Opsi A — Vercel Postgres (paling praktis)**
1. Buka dashboard Vercel → tab **Storage** → **Create Database** → **Postgres**.
2. Setelah dibuat, salin `DATABASE_URL` (format `postgres://...`) dari tab
   **.env.local** database tersebut.

**Opsi B — Neon** (https://neon.tech)
1. Create project → salin **connection string** (pastikan mengandung
   `?sslmode=require`).

**Opsi C — Supabase** (https://supabase.com)
1. Create project → **Project Settings → Database → Connection string (URI)**
   → pakai mode **Session/Transaction pooling** untuk serverless.

---

## 3. Setup Database (schema + data)

Ekstrak ZIP ini, lalu dari dalam folder project:

```bash
# 1) Install dependencies
bun install          # atau: npm install

# 2) Set koneksi database sementara di terminal
export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"

# 3) Buat semua tabel di PostgreSQL
bun run db:push      # atau: npx prisma db push

# 4) (OPSIONAL) Isi data demo: 3 Zoning, 7 crew, 18 penjualan
bun run db:seed      # atau: npx tsx scripts/seed.ts
```

> 💡 Bisa lewati seed — aplikasi tetap jalan kosong, dan admin dibuat otomatis
> saat login pertama (lihat langkah 6).

---

## 4. Deploy ke Vercel

### Cara 1 — Via GitHub (disarankan)
1. Push folder project ini ke repository GitHub Anda.
2. Vercel dashboard → **Add New → Project** → pilih repository tersebut.
3. Vercel otomatis mendeteksi **Next.js**. Build command
   `prisma generate && next build` sudah tertulis di `package.json`.
4. Sebelum klik **Deploy**, buka bagian **Environment Variables** dan tambahkan
   (lihat tabel langkah 5).

### Cara 2 — Via Vercel CLI (tanpa GitHub)
```bash
npm i -g vercel
cd 3sc-vercel
vercel            # ikuti prompt; untuk production: vercel --prod
```

---

## 5. Environment Variables Wajib di Vercel

Set di **Project → Settings → Environment Variables** (berlaku untuk
Production, Preview, Development):

| Nama | Wajib? | Contoh / Cara isi |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string PostgreSQL dari langkah 2 |
| `NEXT_AUTH_SECRET` | ✅ | String acak panjang. Generate: `openssl rand -base64 32` |

> ❗ `NEXT_AUTH_SECRET` **wajib** — tanpa ini, endpoint login akan menolak
> dengan pesan `Server configuration error: NEXT_AUTH_SECRET not set`.
> Kalau deploy via Vercel Postgres (Opsi A), Vercel biasanya menambahkan
> `DATABASE_URL` otomatis — cukup set `NEXT_AUTH_SECRET`.

---

## 6. Login Pertama Kali

Aplikasi memakai **auto-setup admin**: saat tabel `Admin` masih kosong,
login dengan kredensial di bawah akan otomatis membuat akun admin pertama.

| Field | Nilai default |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> 🔐 **Segera ganti password** setelah login pertama (menu profil/pengaturan).
> Password disimpan sebagai hash SHA-256.

---

## 7. Catatan Penting Operasional

- **Zona waktu**: logika tanggal aplikasi memakai **WIB (UTC+7)** — sesuai
  operasional toko Indonesia.
- **Target mingguan**: kolom `week1Target..week5Target` di Zoning dapat diisi
  **persen** (jumlah 100) atau **nominal Rp** — aplikasi otomatis mendeteksi
  mode-nya (nilai > 100 dianggap nominal).
- **Report Summary per Zoning** hanya menghitung penjualan yang sudah
  **diklaim (claimed)** oleh crew — penjualan tanpa crew tidak masuk ringkasan.
- **Export Excel** memakai library `xlsx` (sudah termasuk dependency).
- Data foto/logo crew & zoning disimpan sebagai **URL string** — tidak ada
  upload file ke disk, jadi aman di serverless Vercel.
- Free tier Postgres (Neon/Supabase/Vercel) sudah lebih dari cukup untuk
  beban data toko retail.

---

## 8. Struktur Project (ringkas)

```
├── prisma/schema.prisma          # Schema PostgreSQL (Admin, Group/Zoning, Crew, Sale, TikTokSale, ActivityLog)
├── scripts/seed.ts               # Seed data demo
├── src/
│   ├── app/page.tsx              # Halaman utama (login + dashboard public + management)
│   ├── app/api/
│   │   ├── auth/                 # Login JWT (SHA-256 + cookie httpOnly)
│   │   ├── dashboard/            # Dashboard Zoning, weekly %, group-detail + report summary
│   │   ├── claims/               # Klaim penjualan crew
│   │   ├── crews/                # CRUD crew
│   │   ├── groups/               # CRUD Zoning + target
│   │   ├── sales/                # CRUD penjualan
│   │   └── management/report/    # Laporan manajemen + export
│   ├── components/               # UI (shadcn/ui + dashboard/modals/management)
│   └── lib/                      # db client, auth helper, week-targets resolver
└── PANDUAN-DEPLOY-VERCEL.md      # File ini
```

Selamat deploy! 🎉
