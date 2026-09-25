import { NextRequest, NextResponse } from 'next/server'
import { reportQuerySchema, firstZodMessage } from '@/lib/report-schemas'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { getReportData } from '@/lib/report-service'

// ─────────────────────────────────────────────
// PUBLIC API: GET /api/public/report — Laporan Penjualan (TANPA login)
//
// Halaman Laporan kini halaman SENDIRI dan bisa diakses PUBLIK.
// Endpoint ini read-only, mengembalikan data yang sama dengan
// /api/management/report (logika inti bersama di src/lib/report-service.ts):
//   • Hanya penjualan yang SUDAH DIKLAIM crew (crewId != null)
//   • Filter crewId/groupId/dateFrom/dateTo/search + pagination
//   • Summary (Total Settle/Qty/Struk/Basket Size/Price Point)
//   • Breakdown per Zoning & per Crew
//
// Perlindungan: rate-limit per IP (60 req/menit) + validasi Zod.
// Tidak ada data sensitif: nama crew & foto memang sudah publik
// lewat /api/public/target-schedule.
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    // Rate limit per IP — endpoint publik
    const ip = request.headers.get('x-forwarded-for')
    const rl = rateLimit(rateLimitKey('public-report', null, ip), 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.retryAfterSec} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const { searchParams } = new URL(request.url)
    const parsed = reportQuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
    }

    const result = await getReportData(parsed.data)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Public report error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat memuat laporan' }, { status: 500 })
  }
}
