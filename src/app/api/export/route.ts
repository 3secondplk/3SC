import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { exportQuerySchema, firstZodMessage } from '@/lib/report-schemas'
import { rateLimit, rateLimitKey } from '@/lib/rate-limit'
import { salesExportResponse, salesMonthlyXlsxResponse } from '@/lib/report-export'

// ─────────────────────────────────────────────────────────────
// GET /api/export — CSV export (server-side STREAMING, chunked)
// (ADMIN — dilindungi auth; logika streaming ada di
//  src/lib/report-export.ts agar identik dengan endpoint publik
//  /api/public/report/export)
//
// SCOPE (dropdown Export Data di Report):
//   scope=zoning → wajib groupId → export 1 zoning (semua crew-nya)
//   scope=crew   → wajib crewId  → export 1 crew saja
//   scope=all    → semua zoning & crew (crewId/groupId diabaikan)
//   (scope kosong = mode legacy untuk caller lama: pakai
//    crewId/groupId apa adanya — kompatibel ExportTab existing)
//
// claimedOnly=1 → semantik Report (hanya penjualan yang sudah
// diklaim crew). Caller legacy tanpa param ini tetap mendapat
// seluruh penjualan (perilaku lama dipertahankan).
//
// format=summary → mode legacy ringkasan teks (dipakai ExportTab).
// ─────────────────────────────────────────────────────────────

/** Format a number as Rp currency string */
function fmtRpServer(n: number): string {
  return 'Rp ' + new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(n)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    // Rate limit — 10 export/menit per admin (export itu berat)
    const ip = request.headers.get('x-forwarded-for')
    const rl = rateLimit(rateLimitKey('export', auth.adminId, ip), 10, 60_000)
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

    const q = parsed.data

    // ─── Summary format (legacy, tidak berubah) ──────────────────
    if (q.format === 'summary') {
      const now = new Date()
      const utc = now.getTime() + now.getTimezoneOffset() * 60000
      const wibNow = new Date(utc + 7 * 3600000)

      const currentMonth = wibNow.getMonth()
      const currentYear = wibNow.getFullYear()
      const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

      const crews = await db.crew.findMany({ include: { group: true } })
      const crewIds = crews.map((c) => c.id)

      const monthAgg = crewIds.length > 0
        ? await db.sale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, tanggal: { startsWith: monthPrefix } },
            _sum: { settle: true, qty: true },
          })
        : []

      const monthMap = new Map(monthAgg.map((a) => [a.crewId, a]))
      const crewStats = crews
        .map((crew) => {
          const agg = monthMap.get(crew.id)
          return { name: crew.name, total: agg?._sum.settle ?? 0 }
        })
        .sort((a, b) => b.total - a.total)

      const totalSales = crewStats.reduce((s, c) => s + c.total, 0)
      const top3 = crewStats.slice(0, 3)

      const dateStr = wibNow.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const lines: string[] = [
        '📊 CMS Crew Management System',
        '📅 ' + dateStr,
        '',
        '💰 Total Penjualan Bulan Ini: ' + fmtRpServer(totalSales),
        '👥 Total Crew Aktif: ' + crews.length,
      ]

      if (top3.length > 0 && top3[0].total > 0) {
        lines.push('🏆 Top Performer: ' + top3[0].name + ' (' + fmtRpServer(top3[0].total) + ')')
      } else {
        lines.push('🏆 Top Performer: Belum ada data')
      }

      lines.push('')

      if (top3.length > 0 && top3[0].total > 0) {
        lines.push('📌 Top 3 Leaderboard:')
        for (let i = 0; i < top3.length; i++) {
          const rankLabel = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅'
          lines.push(rankLabel + ' ' + (i + 1) + '. ' + top3[i].name + ' - ' + fmtRpServer(top3[i].total))
        }
      } else {
        lines.push('📌 Top 3 Leaderboard: Belum ada data')
      }

      return NextResponse.json({ summary: lines.join('\n') })
    }

    // ─── XLSX per bulan (Export Semua Crew Per Bulan) ────────────
    if (q.format === 'monthly') {
      return await salesMonthlyXlsxResponse(q)
    }

    // ─── CSV streaming (logika di report-export service) ─────────
    return await salesExportResponse(q)
  } catch (error) {
    console.error('Export sales error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor data' }, { status: 500 })
  }
}
