import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/auth'
import { reportQuerySchema, firstZodMessage } from '@/lib/report-schemas'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { getReportData } from '@/lib/report-service'

// ─────────────────────────────────────────────
// GET /api/management/report — Management report with filtering, pagination & summary
// (ADMIN — dilindungi auth; logika inti ada di src/lib/report-service.ts
//  agar identik dengan endpoint publik /api/public/report)
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    // Rate limit — 60 req/menit per admin
    const ip = request.headers.get('x-forwarded-for')
    const rl = rateLimit(rateLimitKey('report', auth.adminId, ip), 60, 60_000)
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
    console.error('Management report error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat memuat laporan' }, { status: 500 })
  }
}
