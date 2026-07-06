import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-logger'

export const runtime = 'nodejs'
export const maxDuration = 60

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const crewId = searchParams.get('crewId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''

    // Build where clause (same logic as main GET)
    const where: any = {}

    if (search) {
      where.OR = [
        { idOrder: { contains: search } },
        { artikel: { contains: search } },
      ]
    }
    if (status) where.status = status
    if (crewId) where.crewId = crewId
    if (dateFrom) where.tanggal = { ...(where.tanggal || {}), gte: dateFrom }
    if (dateTo) where.tanggal = { ...(where.tanggal || {}), lte: dateTo }

    const sales = await db.tikTokSale.findMany({
      where,
      include: {
        crew: {
          select: {
            name: true,
            employeeId: true,
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { tanggal: 'asc' },
      take: 50000,
    })

    if (sales.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data TikTok untuk diekspor' }, { status: 404 })
    }

    // Build CSV
    const header = 'No,Tanggal,ID Order,Status,Artikel,Size,Qty,Revenue,Settle,Crew,Group'
    const rows = sales.map((sale, index) => {
      return [
        index + 1,
        escapeCsv(sale.tanggal),
        escapeCsv(sale.idOrder),
        escapeCsv(sale.status),
        escapeCsv(sale.artikel),
        escapeCsv(sale.size),
        sale.qty,
        sale.revenue,
        sale.settle,
        escapeCsv(sale.crew?.name || ''),
        escapeCsv(sale.crew?.group?.name || ''),
      ].join(',')
    })

    // Add summary row at bottom
    const totalRevenue = sales.reduce((s, x) => s + x.revenue, 0)
    const totalSettle = sales.reduce((s, x) => s + x.settle, 0)
    const totalQty = sales.reduce((s, x) => s + x.qty, 0)
    rows.push('')
    rows.push(`,,,,TOTAL,,,,${totalQty},${totalRevenue},${totalSettle},,`)

    const csvContent = '\uFEFF' + [header, ...rows].join('\n')

    // Build filename
    const filename = `tiktok-sales${dateFrom ? `-${dateFrom}` : ''}${dateTo ? `-${dateTo}` : ''}.csv`

    await logActivity('TikTok Sales Exported', { description: `${sales.length} baris diekspor` })

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('TikTok export error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor', detail: msg }, { status: 500 })
  }
}