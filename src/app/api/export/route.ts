import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'

/** Format a number as Rp currency string */
function fmtRpServer(n: number): string {
  return 'Rp ' + new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0 }).format(n)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format')
    const crewId = searchParams.get('crewId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const groupId = searchParams.get('groupId')
    const customFilename = searchParams.get('filename')

    // ─── Summary format ──────────────────────────────────────────
    if (format === 'summary') {
      // Get WIB date
      const now = new Date()
      const utc = now.getTime() + now.getTimezoneOffset() * 60000
      const wibNow = new Date(utc + 7 * 3600000)

      const currentMonth = wibNow.getMonth()
      const currentYear = wibNow.getFullYear()
      const dayOfMonth = wibNow.getDate()
      const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
      const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

      // Fetch crews with groups
      const crews = await db.crew.findMany({
        include: { group: true },
      })
      const crewIds = crews.map(c => c.id)

      // Aggregate monthly sales
      const monthAgg = crewIds.length > 0
        ? await db.sale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, tanggal: { startsWith: monthPrefix } },
            _sum: { settle: true, qty: true },
          })
        : []

      // Build crew stats sorted by monthly total
      const monthMap = new Map(monthAgg.map(a => [a.crewId, a]))
      const crewStats = crews.map(crew => {
        const agg = monthMap.get(crew.id)
        return {
          name: crew.name,
          total: agg?._sum.settle ?? 0,
        }
      }).sort((a, b) => b.total - a.total)

      const totalSales = crewStats.reduce((s, c) => s + c.total, 0)
      const top3 = crewStats.slice(0, 3)

      // Build summary text
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
          const rankLabel = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'
          lines.push(rankLabel + ' ' + (i + 1) + '. ' + top3[i].name + ' - ' + fmtRpServer(top3[i].total))
        }
      } else {
        lines.push('📌 Top 3 Leaderboard: Belum ada data')
      }

      return NextResponse.json({ summary: lines.join('\n') })
    }

    // ─── Default CSV format ──────────────────────────────────────

    const where: Record<string, unknown> = {}

    if (crewId) {
      where.crewId = crewId
    }

    if (groupId) {
      where.crew = {
        ...((where.crew as Record<string, unknown>) || {}),
        groupId,
      }
    }

    if (dateFrom || dateTo) {
      const tanggalFilter: Record<string, unknown> = {}
      if (dateFrom) {
        tanggalFilter.gte = dateFrom
      }
      if (dateTo) {
        // BUGFIX: use lt:nextDay to handle timestamps like "2026-05-03 09:00"
        const [y, m, d] = dateTo.split('-').map(Number)
        const nextDay = new Date(y, m - 1, d + 1)
        const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`
        tanggalFilter.lt = nextDayStr
      }
      where.tanggal = tanggalFilter
    }

    const sales = await db.sale.findMany({
      where,
      include: {
        crew: {
          select: {
            name: true,
            group: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { tanggal: 'asc' },
      take: 50000, // SEC: Prevent OOM — max 50k rows exported
    })

    if (sales.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor' }, { status: 404 })
    }

    // Build CSV content
    const header = 'No,Tanggal,Kode Extend,Brand,Qty,Settle,Crew,Group,Dept,Modul,Pembayaran'
    const rows = sales.map((sale, index) => {
      const no = index + 1
      const tanggal = sale.tanggal || ''
      const kodeExtend = sale.kodeExtend || ''
      const brand = sale.brand || ''
      const qty = sale.qty
      const settle = sale.settle
      const crew = sale.crew?.name || ''
      const group = sale.crew?.group?.name || ''
      const dept = sale.dept || ''
      const modul = sale.modul || ''
      const pembayaran = sale.pembayaran || ''

      return [
        no,
        escapeCsv(tanggal),
        escapeCsv(kodeExtend),
        escapeCsv(brand),
        qty,
        settle,
        escapeCsv(crew),
        escapeCsv(group),
        escapeCsv(dept),
        escapeCsv(modul),
        escapeCsv(pembayaran),
      ].join(',')
    })

    const csvContent = '\uFEFF' + [header, ...rows].join('\n')

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${customFilename || 'laporan-penjualan.csv'}"`,
      },
    })
  } catch (error) {
    console.error('Export sales error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor data' }, { status: 500 })
  }
}

function escapeCsv(value: string | number): string {
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}
