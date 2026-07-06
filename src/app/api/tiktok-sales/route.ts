import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-logger'

// ─── GET: List TikTok sales with filters ────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const crewId = searchParams.get('crewId') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const sortField = searchParams.get('sortField') || 'createdAt'
    const sortDir = searchParams.get('sortDir') || 'desc'

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

    const [items, total] = await Promise.all([
      db.tikTokSale.findMany({
        where,
        include: {
          crew: { select: { id: true, name: true, employeeId: true, photo: true, group: { select: { name: true } } } },
        },
        orderBy: { [sortField]: sortDir as 'asc' | 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.tikTokSale.count({ where }),
    ])

    // Summary stats
    const summaryWhere = dateFrom || dateTo ? {
      tanggal: {
        ...(dateFrom ? { gte: dateFrom } : {}),
        ...(dateTo ? { lte: dateTo } : {}),
      },
    } : undefined

    const summary = await db.tikTokSale.aggregate({
      _sum: { revenue: true, settle: true, qty: true },
      _count: true,
      where: summaryWhere as any,
    })

    return NextResponse.json({
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: {
        totalRevenue: summary._sum.revenue ?? 0,
        totalSettle: summary._sum.settle ?? 0,
        totalQty: summary._sum.qty ?? 0,
        count: summary._count,
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('TikTok sales GET error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan', detail: msg }, { status: 500 })
  }
}

// ─── POST: Create new TikTok sale ───────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tanggal, idOrder, status, artikel, size, qty, revenue, settle, crewId } = body

    if (!tanggal || !idOrder || !artikel) {
      return NextResponse.json({ error: 'Tanggal, ID Order, dan Artikel wajib diisi' }, { status: 400 })
    }

    const sale = await db.tikTokSale.create({
      data: {
        tanggal,
        idOrder: idOrder.trim(),
        status: status || 'Pengiriman',
        artikel: artikel.trim(),
        size: size?.trim() || null,
        qty: parseInt(qty) || 1,
        revenue: parseFloat(revenue) || 0,
        settle: parseFloat(settle) || 0,
        crewId: crewId || null,
      },
      include: {
        crew: { select: { id: true, name: true, employeeId: true, photo: true, group: { select: { name: true } } } },
      },
    })

    await logActivity('TikTok Sale Created', `Order ${sale.idOrder} — ${sale.artikel}`, sale.crew?.name)

    return NextResponse.json(sale, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('TikTok sale POST error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan', detail: msg }, { status: 500 })
  }
}

// ─── PUT: Update a TikTok sale ──────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, ...data } = body

    if (!id) {
      return NextResponse.json({ error: 'ID wajib' }, { status: 400 })
    }

    const sale = await db.tikTokSale.update({
      where: { id },
      data: {
        tanggal: data.tanggal,
        idOrder: data.idOrder?.trim(),
        status: data.status,
        artikel: data.artikel?.trim(),
        size: data.size?.trim() || null,
        qty: parseInt(data.qty) || 1,
        revenue: parseFloat(data.revenue) || 0,
        settle: parseFloat(data.settle) || 0,
        crewId: data.crewId || null,
      },
      include: {
        crew: { select: { id: true, name: true, employeeId: true, photo: true, group: { select: { name: true } } } },
      },
    })

    await logActivity('TikTok Sale Updated', `Order ${sale.idOrder} — ${sale.artikel}`, sale.crew?.name)

    return NextResponse.json(sale)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('TikTok sale PUT error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan', detail: msg }, { status: 500 })
  }
}

// ─── DELETE: Delete TikTok sale(s) ──────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const ids = searchParams.get('ids')

    if (ids) {
      const idList = ids.split(',')
      const deleted = await db.tikTokSale.deleteMany({ where: { id: { in: idList } } })
      await logActivity('TikTok Sale Batch Deleted', `${deleted.count} penjualan TikTok dihapus`)
      return NextResponse.json({ deleted: deleted.count })
    }

    if (!id) {
      return NextResponse.json({ error: 'ID wajib' }, { status: 400 })
    }

    const sale = await db.tikTokSale.findUnique({ where: { id }, include: { crew: { select: { name: true } } } })
    await db.tikTokSale.delete({ where: { id } })
    await logActivity('TikTok Sale Deleted', `Order ${sale?.idOrder} — ${sale?.artikel}`, sale?.crew?.name)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('TikTok sale DELETE error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan', detail: msg }, { status: 500 })
  }
}