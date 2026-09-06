# CMS Crew Management System (3SC)

Dashboard manajemen penjualan Crew per **Zoning** untuk retail 3Second:

- Dashboard publik Zoning (harian/mingguan/bulanan) + progress bar % Acv mingguan
- **Detail Report Summary Penjualan Brand & Dept per Zoning** (isolated per
  Zoning, berdasarkan Claim penjualan Crew) di public detail Zoning Dashboard
- Tab Achievement crew dengan **nominal Rp**
- Klaim penjualan, TikTok sales, activity log, export Excel
- Next.js 16 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind 4 · shadcn/ui

## Deploy ke Vercel

Lihat **[PANDUAN-DEPLOY-VERCEL.md](./PANDUAN-DEPLOY-VERCEL.md)** untuk
langkah lengkap (database PostgreSQL, environment variables, seed, deploy).

Environment variables wajib:

```
DATABASE_URL="postgresql://..."
NEXT_AUTH_SECRET="string-acak-panjang"
```

Login default pertama kali: `admin` / `admin123` (auto-setup, segera ganti password).

## Development lokal

```bash
bun install
cp .env.example .env        # isi DATABASE_URL & NEXT_AUTH_SECRET
bun run db:push             # buat tabel
bun run db:seed             # (opsional) data demo
bun run dev                 # http://localhost:3000
```
