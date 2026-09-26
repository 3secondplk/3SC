import { NextRequest, NextResponse } from 'next/server'
import { exportQuerySchema, firstZodMessage } from '@/lib/report-schemas'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { reportWorkbookResponse } from '@/lib/report-export'

// ─────────────────────────────────────────────────────────────
// PUBLIC API: GET /api/public/report/export — Export LAPORAN (TANPA login)
//
// Menghasilkan workbook Excel (.xlsx) MULTI-SHEET — pembaruan file
// export laporan:
//   Sheet 1 "All Data"            — semua laporan penjualan (filter scope)
//   Sheet 2 "Laporan Zoning-Grup" — Laporan Mingguan per Zoning
//                                   (crew × Week 1–5: Qty|Netto|Target|ACV)
//   Sheet 3 "Laporan Per Dept"    — Detail Dept per Crew per Minggu
//
// Logika build identik dengan admin /api/export?format=xlsx
// (bersama di src/lib/report-export.ts), tapi TANPA auth untuk
// mendukung halaman Laporan publik.
//
// PENTING (keamanan & konsistensi data):
//   • claimedOnly DIPAKSA '1' — data yang bisa di-export publik selalu
//     identik dengan yang tampil di halaman Laporan (hanya penjualan
//     ber-claim crew). Penjualan belum diklaim TIDAK terekspos.
//   • Rate-limit per IP: 10 export/menit (export itu berat).
//   • Validasi Zod + ownership crew∈zoning tetap server-side.
//   • month/year = konteks bulan laporan mingguan (default: bulan WIB
//     berjalan). Tanpa rentang tanggal, sheet All Data otomatis di-scope
//     ke bulan tsb.
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')
    const rl = rateLimit(rateLimitKey('public-report-export', null, ip), 10, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Terlalu banyak permintaan export. Coba lagi dalam ${rl.retryAfterSec} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const { searchParams } = new URL(request.url)
    const parsed = exportQuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
    }

    // Paksa semantik Report: hanya penjualan yang sudah diklaim crew
    const q = { ...parsed.data, claimedOnly: '1' as const }
    return await reportWorkbookResponse(q)
  } catch (error) {
    console.error('Public export error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor data' }, { status: 500 })
  }
}
