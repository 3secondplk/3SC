import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get('groupId')
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (groupId) where.groupId = groupId
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { employeeId: { contains: search } },
      ]
    }

    const crews = await db.crew.findMany({
      where,
      include: { group: true },
      orderBy: { createdAt: 'asc' },
    })

    if (crews.length === 0) return NextResponse.json([])

    const crewIds = crews.map(c => c.id)

    // Get WIB today
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const wibNow = new Date(utc + 7 * 3600000)
    const todayStr = `${wibNow.getFullYear()}-${String(wibNow.getMonth() + 1).padStart(2, '0')}-${String(wibNow.getDate()).padStart(2, '0')}`

    // PERF: Use groupBy aggregation — NO row loading, DB computes sums
    const [allTimeAgg, todayAgg] = await Promise.all([
      db.sale.groupBy({
        by: ['crewId'],
        where: { crewId: { in: crewIds } },
        _sum: { settle: true, qty: true },
        _count: true,
      }),
      db.sale.groupBy({
        by: ['crewId'],
        where: { crewId: { in: crewIds }, tanggal: { startsWith: todayStr } },
        _sum: { settle: true },
      }),
    ])

    // Build lookup maps
    const allTimeMap = new Map(allTimeAgg.map(a => [a.crewId, a]))
    const todayMap = new Map(todayAgg.map(a => [a.crewId, a]))

    const crewsWithStats = crews.map(crew => {
      const agg = allTimeMap.get(crew.id)
      const tAgg = todayMap.get(crew.id)

      return {
        ...crew,
        totalSales: agg?._sum.settle ?? 0,
        totalQty: agg?._sum.qty ?? 0,
        todaySales: tAgg?._sum.settle ?? 0,
        transactionCount: agg?._count ?? 0,
      }
    })

    return NextResponse.json(crewsWithStats)
  } catch (error) {
    console.error('Get crews error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const { name, photo, employeeId, groupId } = body

    if (!name || !employeeId || !groupId) {
      return NextResponse.json({ error: 'Nama, ID Karyawan, dan Group harus diisi' }, { status: 400 })
    }

    // SEC-06: Input length validation
    if (name.length > 200) {
      return NextResponse.json({ error: 'Nama maksimal 200 karakter' }, { status: 400 })
    }
    if (employeeId.length > 50) {
      return NextResponse.json({ error: 'ID Karyawan maksimal 50 karakter' }, { status: 400 })
    }

    const crew = await db.crew.create({
      data: { name, photo: photo || null, employeeId, groupId },
      include: { group: true },
    })

    // Log create crew activity (fire-and-forget)
    logActivity('CREATE_CREW', {
      description: `Tambah crew: ${name}`,
      crewName: name,
      details: { name },
    }).catch(() => {})

    return NextResponse.json(crew, { status: 201 })
  } catch (error: unknown) {
    console.error('Create crew error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'ID Karyawan sudah terdaftar' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const { id, name, photo, employeeId, groupId } = body

    if (!id) {
      return NextResponse.json({ error: 'ID crew harus diisi' }, { status: 400 })
    }

    // SEC-06: Input length validation
    if (name && name.length > 200) {
      return NextResponse.json({ error: 'Nama maksimal 200 karakter' }, { status: 400 })
    }
    if (employeeId && employeeId.length > 50) {
      return NextResponse.json({ error: 'ID Karyawan maksimal 50 karakter' }, { status: 400 })
    }

    const crew = await db.crew.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(photo !== undefined && { photo }),
        ...(employeeId && { employeeId }),
        ...(groupId && { groupId }),
      },
      include: { group: true },
    })

    return NextResponse.json(crew)
  } catch (error: unknown) {
    console.error('Update crew error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 })
    }
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'ID Karyawan sudah terdaftar' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID crew harus diisi' }, { status: 400 })
    }

    const existing = await db.crew.findUnique({ where: { id } })

    if (existing) {
      // Log delete crew activity (fire-and-forget)
      logActivity('DELETE_CREW', {
        description: `Hapus crew: ${existing.name}`,
        crewName: existing.name,
        details: { name: existing.name },
      }).catch(() => {})
    }

    await db.crew.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Delete crew error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
