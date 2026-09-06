import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'

// ─────────────────────────────────────────────────────────────
// GET /api/management/report/zoning-summary
// Detail Report Summary — Penjualan Brand & Dept, isolated per
// Zoning (Group), berdasarkan CLAIM penjualan Crew.
//
// Query params (sama dengan /api/management/report):
//   crewId   — filter satu crew saja (opsional)
//   groupId  — filter satu zoning saja (opsional)
//   dateFrom — tanggal mulai (YYYY-MM-DD, opsional)
//   dateTo   — tanggal akhir (YYYY-MM-DD, opsional)
//   search   — kata kunci kode/brand/dept (opsional)
//
// Hanya penjualan yang SUDAH DIKLAIM crew (crewId != null)
// yang dihitung. Output per zoning: rows Brand|Dept|Qty|Netto.
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { searchParams } = new URL(request.url)

    const crewId = searchParams.get('crewId') || ''
    const groupId = searchParams.get('groupId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const search = searchParams.get('search') || ''

    // Build Prisma where clause — hanya sales yang diklaim crew
    const where: Record<string, unknown> = {
      crewId: crewId ? crewId : { not: null },
    }

    // Filter zoning via relasi crew
    if (groupId) {
      where.crew = { groupId }
    }

    // Search across kodeExtend, brand, dept (SQLite contains = case-insensitive utk ASCII)
    if (search) {
      const searchConditions: Record<string, unknown>[] = [
        { kodeExtend: { contains: search } },
        { brand: { contains: search } },
        { dept: { contains: search } },
      ]
      if (crewId) {
        searchConditions.push({ crew: { name: { contains: search } } })
      }
      where.OR = searchConditions
    }

    // Date range filter on tanggal (pola sama dengan route report)
    if (dateFrom || dateTo) {
      const tanggalFilter: Record<string, unknown> = {}
      if (dateFrom) tanggalFilter.gte = dateFrom
      if (dateTo) {
        const [y, m, d] = dateTo.split('-').map(Number)
        const nextDay = new Date(y, m - 1, d + 1)
        const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`
        tanggalFilter.lt = nextDayStr
      }
      where.tanggal = tanggalFilter
    }

    // Fetch claimed sales (field minimal) + info zoning via crew
    const sales = await db.sale.findMany({
      where,
      select: {
        qty: true,
        netto: true,
        idPenjualan: true,
        brand: true,
        dept: true,
        crew: {
          select: {
            id: true,
            group: { select: { id: true, name: true } },
          },
        },
      },
    })

    // ─── Aggregate in JS: zoning → (brand, dept) ───
    interface Row { brand: string; dept: string; qty: number; netto: number; struk: Set<string>; strukNull: number }
    const zoningMap = new Map<string, {
      groupId: string
      groupName: string
      rows: Map<string, Row>
      crews: Set<string>
    }>()

    for (const s of sales) {
      const crew = s.crew
      const group = crew?.group
      if (!crew || !group) continue // safety: hanya penjualan ber-claim crew dengan zoning

      if (!zoningMap.has(group.id)) {
        zoningMap.set(group.id, { groupId: group.id, groupName: group.name, rows: new Map(), crews: new Set() })
      }
      const zone = zoningMap.get(group.id)!
      zone.crews.add(crew.id)

      const brand = s.brand && s.brand.trim() !== '' ? s.brand.trim() : '—'
      const dept = s.dept && s.dept.trim() !== '' ? s.dept.trim() : '—'
      const key = `${brand}||${dept}`

      if (!zone.rows.has(key)) {
        zone.rows.set(key, { brand, dept, qty: 0, netto: 0, struk: new Set(), strukNull: 0 })
      }
      const row = zone.rows.get(key)!
      row.qty += s.qty
      row.netto += s.netto
      if (s.idPenjualan) row.struk.add(s.idPenjualan)
      else row.strukNull += 1
    }

    const zonings = Array.from(zoningMap.values())
      .map((zone) => {
        const rows = Array.from(zone.rows.values())
          .map((r) => ({
            brand: r.brand,
            dept: r.dept,
            qty: r.qty,
            netto: r.netto,
            struk: r.struk.size + r.strukNull,
          }))
          // Urutkan: netto terbesar dulu, lalu qty, lalu abjad brand
          .sort((a, b) => b.netto - a.netto || b.qty - a.qty || a.brand.localeCompare(b.brand) || a.dept.localeCompare(b.dept))
        return {
          groupId: zone.groupId,
          groupName: zone.groupName,
          crewCount: zone.crews.size,
          rowCount: rows.length,
          totalQty: rows.reduce((t, r) => t + r.qty, 0),
          totalNetto: rows.reduce((t, r) => t + r.netto, 0),
          rows,
        }
      })
      .sort((a, b) => a.groupName.localeCompare(b.groupName))

    return NextResponse.json({
      zonings,
      grandTotal: {
        zoningCount: zonings.length,
        totalQty: zonings.reduce((t, z) => t + z.totalQty, 0),
        totalNetto: zonings.reduce((t, z) => t + z.totalNetto, 0),
        rowCount: zonings.reduce((t, z) => t + z.rowCount, 0),
      },
    })
  } catch (error) {
    console.error('Zoning summary error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat memuat summary zoning' }, { status: 500 })
  }
}
