import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'

// ─────────────────────────────────────────────
// PUBLIC API: GET /api/public/report/meta — daftar Zoning & Crew (TANPA login)
//
// Data filter untuk halaman Laporan publik:
//   groups: [{ id, name }]           — daftar Zoning/Group
//   crews : [{ id, name, employeeId, photo, groupId }] — daftar Crew + zoning-nya
//
// Read-only, hanya nama/ID (tanpa target & tanpa angka penjualan).
// Informasi nama & foto crew memang sudah publik via
// /api/public/target-schedule. Rate-limit per IP 60 req/menit.
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')
    const rl = rateLimit(rateLimitKey('public-report-meta', null, ip), 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.retryAfterSec} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const [groups, crews] = await Promise.all([
      db.group.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true },
      }),
      db.crew.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, employeeId: true, photo: true, groupId: true },
      }),
    ])

    return NextResponse.json({ groups, crews })
  } catch (error) {
    console.error('Public report meta error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat memuat data filter' }, { status: 500 })
  }
}
