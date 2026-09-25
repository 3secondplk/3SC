import { NextRequest, NextResponse } from 'next/server'
import { weeklyMatrixQuerySchema, firstZodMessage } from '@/lib/report-schemas'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { getWeeklyMatrixData } from '@/lib/report-service'

// ─────────────────────────────────────────────────────────
// PUBLIC API: GET /api/public/report/weekly-matrix (TANPA login)
//
// Laporan mingguan format sheet toko (matrix crew × Week 1–5 →
// QTY | NETTO | TARGET | ACV + detail dept). Logika inti bersama
// dengan endpoint admin di src/lib/report-service.ts.
//
// Read-only. Rate-limit per IP 60 req/menit + validasi Zod.
// ─────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')
    const rl = rateLimit(rateLimitKey('public-report-matrix', null, ip), 60, 60_000)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Terlalu banyak permintaan. Coba lagi dalam ${rl.retryAfterSec} detik.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      )
    }

    const { searchParams } = new URL(request.url)
    const parsed = weeklyMatrixQuerySchema.safeParse(Object.fromEntries(searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
    }

    const result = await getWeeklyMatrixData(parsed.data)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Public weekly matrix error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat memuat laporan mingguan' }, { status: 500 })
  }
}
