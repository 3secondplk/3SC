import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─────────────────────────────────────────────────────────────
// GET /api/claims/search — Case-insensitive search for SQLite
// Uses Prisma findMany with contains (LIKE) for reliability.
// SQLite LIKE is case-insensitive for ASCII by default.
// Barcode scanner: tries FULL input first, if 0 results then
// retries kodeExtend with first 9 chars as fallback.
// ─────────────────────────────────────────────────────────────

function buildSearchOr(search: string, claimed: string) {
  const searchOr: Record<string, any>[] = [
    { kodeExtend: { contains: search.toUpperCase() } },
    { kodeExtend: { contains: search } },
    { brand: { contains: search } },
    { dept: { contains: search } },
    { modul: { contains: search } },
  ]
  if (claimed !== 'false') {
    searchOr.push({ crew: { name: { contains: search } } })
  }
  return searchOr
}

async function fetchSearchResults(where: Record<string, any>, page: number, limit: number) {
  const [sales, total, summary, strukGroups] = await Promise.all([
    db.sale.findMany({
      where,
      include: {
        crew: {
          select: { id: true, name: true, employeeId: true, photo: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.sale.count({ where }),
    db.sale.aggregate({
      _sum: { qty: true, settle: true, hjp: true },
      where,
    }),
    db.sale.groupBy({
      by: ['idPenjualan'],
      where: { ...where, idPenjualan: { not: null } },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const totalQty = Number(summary._sum.qty ?? 0)
  const totalSettle = Number(summary._sum.settle ?? 0)
  const totalStruk = strukGroups.length
  const basketSize = totalStruk > 0 ? totalQty / totalStruk : 0
  const pricePoint = totalQty > 0 ? totalSettle / totalQty : 0

  return { sales, total, page, totalPages, summary: { totalQty, totalSettle, totalStruk, basketSize, pricePoint } }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const search = (searchParams.get('search') || '').trim()
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const program = searchParams.get('program') || ''
    const claimed = searchParams.get('claimed') || ''
    const crewId = searchParams.get('crewId') || ''

    // ── Build base filters (date, claimed, program, crew) ──
    const baseFilters: Record<string, any> = {}

    if (claimed === 'true') {
      baseFilters.crewId = crewId ? crewId : { not: null }
    } else if (claimed === 'false') {
      baseFilters.crewId = { equals: null }
    } else if (crewId) {
      baseFilters.crewId = crewId
    }

    if (dateFrom || dateTo) {
      const tanggalFilter: Record<string, unknown> = {}
      if (dateFrom) tanggalFilter.gte = dateFrom
      if (dateTo) {
        const [y, m, d] = dateTo.split('-').map(Number)
        const nextDay = new Date(y, m - 1, d + 1)
        const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`
        tanggalFilter.lt = nextDayStr
      }
      baseFilters.tanggal = tanggalFilter
    }

    if (program) {
      baseFilters.program = program
    }

    // ── Search with barcode scanner fallback ──
    // Step 1: Try FULL search text (all fields)
    // Step 2: If 0 results AND input > 9 chars, retry with first 9 chars for kodeExtend only
    // This ensures: exact 11-char matches still work, AND partial 9-char matches work as fallback
    if (search) {
      // ── Attempt 1: Full search ──
      const fullWhere: Record<string, any> = { OR: buildSearchOr(search, claimed) }
      if (Object.keys(baseFilters).length > 0) fullWhere.AND = baseFilters

      let result = await fetchSearchResults(fullWhere, page, limit)

      // ── Attempt 2: Fallback — trim to 9 chars for kodeExtend only ──
      if (result.total === 0 && search.length > 9) {
        const trimmed = search.slice(0, 9)
        const fallbackOr: Record<string, any>[] = [
          { kodeExtend: { contains: trimmed.toUpperCase() } },
          { kodeExtend: { contains: trimmed } },
          // Also keep brand/dept/modul with full search (they might be long text)
          { brand: { contains: search } },
          { dept: { contains: search } },
          { modul: { contains: search } },
        ]
        if (claimed !== 'false') {
          fallbackOr.push({ crew: { name: { contains: search } } })
        }

        const fallbackWhere: Record<string, any> = { OR: fallbackOr }
        if (Object.keys(baseFilters).length > 0) fallbackWhere.AND = baseFilters

        result = await fetchSearchResults(fallbackWhere, page, limit)
      }

      return NextResponse.json(result)
    }

    // ── No search term: use standard Prisma query ──
    const result = await fetchSearchResults(baseFilters, page, limit)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Search claims error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
