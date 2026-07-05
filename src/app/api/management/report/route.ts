import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'

// ─────────────────────────────────────────────
// GET /api/management/report — Management report with filtering, pagination & summary
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { searchParams } = new URL(request.url)

    const crewId = searchParams.get('crewId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const search = searchParams.get('search') || ''

    // Build Prisma where clause
    const where: Record<string, unknown> = {}

    // Only include claimed sales in management report
    where.crewId = crewId ? crewId : { not: null }

    // Search across kodeExtend, brand, dept (case-insensitive)
    if (search) {
      const searchConditions: Record<string, unknown>[] = [
        { kodeExtend: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { dept: { contains: search, mode: 'insensitive' } },
      ]
      // If searching within a specific crew, also search crew name
      if (crewId) {
        searchConditions.push({ crew: { name: { contains: search, mode: 'insensitive' } } })
      }
      where.OR = searchConditions
    }

    // Date range filter on tanggal (same pattern as claims/export routes)
    if (dateFrom || dateTo) {
      const tanggalFilter: Record<string, unknown> = {}
      if (dateFrom) tanggalFilter.gte = dateFrom
      if (dateTo) {
        // Calculate next day to include all timestamps on dateTo
        const [y, m, d] = dateTo.split('-').map(Number)
        const nextDay = new Date(y, m - 1, d + 1)
        const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`
        tanggalFilter.lt = nextDayStr
      }
      where.tanggal = tanggalFilter
    }

    // Fetch crew info if crewId is specified
    let crewInfo: { id: string; name: string; groupName: string } | null = null
    if (crewId) {
      const crew = await db.crew.findUnique({
        where: { id: crewId },
        select: {
          id: true,
          name: true,
          group: { select: { name: true } },
        },
      })
      if (crew) {
        crewInfo = {
          id: crew.id,
          name: crew.name,
          groupName: crew.group?.name || '',
        }
      }
    }

    const [sales, total, summary, strukGroups] = await Promise.all([
      db.sale.findMany({
        where,
        include: {
          crew: {
            select: {
              id: true,
              name: true,
              employeeId: true,
              photo: true,
              group: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [
          { tanggal: 'desc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sale.count({ where }),
      db.sale.aggregate({
        _sum: { qty: true, settle: true },
        where,
      }),
      db.sale.groupBy({
        by: ['idPenjualan'],
        where: { ...where, idPenjualan: { not: null } },
      }),
    ])

    const totalPages = Math.max(1, Math.ceil(total / limit))

    // Calculate summary stats
    const totalQty = summary._sum.qty ?? 0
    const totalSettle = summary._sum.settle ?? 0
    const totalStruk = strukGroups.length
    const basketSize = totalStruk > 0 ? totalQty / totalStruk : 0
    const pricePoint = totalQty > 0 ? totalSettle / totalQty : 0

    return NextResponse.json({
      sales,
      total,
      totalPages,
      page,
      summary: {
        totalQty,
        totalSettle,
        totalStruk,
        basketSize,
        pricePoint,
      },
      crewInfo,
    })
  } catch (error) {
    console.error('Management report error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat memuat laporan' }, { status: 500 })
  }
}
