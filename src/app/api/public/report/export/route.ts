import { NextRequest, NextResponse } from 'next/server'
import { exportQuerySchema, firstZodMessage } from '@/lib/report-schemas'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { salesExportResponse, salesMonthlyXlsxResponse } from '@/lib/report-export'

// ─────────────────────────────────────────────────────────────
// PUBLIC API: GET /api/public/report/export — Export CSV laporan (TANPA login)
//
// Streaming CSV yang sama dengan /api/export (logika bersama di
// src/lib/report-export.ts), tapi TANPA auth untuk mendukung halaman
// Laporan publik.
//
// PENTING (keamanan & konsistensi data):
//   • claimedOnly DIPAKSA '1' — data yang bisa di-export publik selalu
//     identik dengan yang tampil di halaman Laporan (hanya penjualan
//     ber-claim crew). Penjualan belum diklaim TIDAK terekspos.
//   • Rate-limit per IP: 10 export/menit (export itu berat).
//   • Validasi Zod + ownership crew∈zoning tetap server-side.
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

    // format=monthly → XLSX multi-sheet, 1 sheet per bulan
    if (q.format === 'monthly') {
      return await salesMonthlyXlsxResponse(q)
    }

    return await salesExportResponse(q)
  } catch (error) {
    console.error('Public export error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor data' }, { status: 500 })
  }
}
