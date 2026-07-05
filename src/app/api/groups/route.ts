import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'

// Helper: get week number (1-5)
function getWeekNumber(dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 7) return 1
  if (dayOfMonth <= 14) return 2
  if (dayOfMonth <= 21) return 3
  if (dayOfMonth <= 28) return 4
  return 5
}

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const wibNow = new Date(utc + 7 * 3600000)

    const currentMonth = wibNow.getMonth()
    const currentYear = wibNow.getFullYear()
    const dayOfMonth = wibNow.getDate()
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

    const currentWeek = getWeekNumber(dayOfMonth, daysInMonth)
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

    const groupsRaw = await db.group.findMany({
      include: { crews: { select: { id: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const allCrewIds = groupsRaw.flatMap(g => g.crews.map(c => c.id))
    const monthSalesData = allCrewIds.length > 0
      ? await db.sale.findMany({
          where: { crewId: { in: allCrewIds }, tanggal: { startsWith: monthPrefix } },
          select: { crewId: true, tanggal: true, settle: true },
        })
      : []

    const salesByCrew = new Map<string, { tanggal: string; settle: number }[]>()
    for (const s of monthSalesData) {
      if (!salesByCrew.has(s.crewId!)) salesByCrew.set(s.crewId!, [])
      salesByCrew.get(s.crewId!)!.push({ tanggal: s.tanggal, settle: s.settle })
    }

    // Week range based on current week (W4=22-28, W5=29+)
    let weekStart: number, weekEnd: number
    if (currentWeek <= 4) {
      weekStart = (currentWeek - 1) * 7 + 1
      weekEnd = currentWeek * 7
    } else {
      weekStart = 29
      weekEnd = daysInMonth
    }

    const groupsWithStats = groupsRaw.map(group => {
      const crewMonthSales = group.crews.flatMap(c => salesByCrew.get(c.id) || [])
      const monthlyTotal = crewMonthSales.reduce((sum, s) => sum + s.settle, 0)
      const monthlyTarget = group.monthlyTarget
      const monthlyAchievement = monthlyTarget > 0 ? (monthlyTotal / monthlyTarget) * 100 : 0

      const weekSales = crewMonthSales.filter(s => {
        const day = s.tanggal.startsWith(monthPrefix)
          ? parseInt(s.tanggal.split('-')[2])
          : 0
        return day >= weekStart && day <= weekEnd
      })
      const weeklyTotal = weekSales.reduce((sum, s) => sum + s.settle, 0)

      const weeklyTargetPcts = [group.week1Target, group.week2Target, group.week3Target, group.week4Target, group.week5Target ?? 0]
      const weekTargetPct = weeklyTargetPcts[currentWeek - 1] ?? 0
      const weeklyAchievement = weekTargetPct > 0 ? (weeklyTotal / (monthlyTarget * weekTargetPct / 100)) * 100 : 0

      return {
        ...group,
        week5Target: group.week5Target ?? 0,
        crewCount: group.crews.length,
        monthlyTotal,
        monthlyAchievement,
        weeklyTotal,
        weeklyAchievement,
        currentWeek,
        currentWeekTarget: weekTargetPct,
      }
    })

    return NextResponse.json(groupsWithStats)
  } catch (error) {
    console.error('Get groups error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const { name, logo, monthlyTarget, week1Target, week2Target, week3Target, week4Target, week5Target } = body

    if (!name) {
      return NextResponse.json({ error: 'Nama group harus diisi' }, { status: 400 })
    }

    if (typeof name !== 'string' || name.length > 200) {
      return NextResponse.json({ error: 'Nama group maksimal 200 karakter' }, { status: 400 })
    }

    const validateTarget = (val: unknown, fieldName: string): number | NextResponse => {
      if (val === undefined || val === null || val === '') return 0
      const num = Number(val)
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json({ error: `${fieldName} harus berupa angka non-negatif` }, { status: 400 })
      }
      return num
    }

    const mt = validateTarget(monthlyTarget, 'monthlyTarget')
    if (mt instanceof NextResponse) return mt
    const w1 = validateTarget(week1Target, 'week1Target')
    if (w1 instanceof NextResponse) return w1
    const w2 = validateTarget(week2Target, 'week2Target')
    if (w2 instanceof NextResponse) return w2
    const w3 = validateTarget(week3Target, 'week3Target')
    if (w3 instanceof NextResponse) return w3
    const w4 = validateTarget(week4Target, 'week4Target')
    if (w4 instanceof NextResponse) return w4
    const w5 = validateTarget(week5Target, 'week5Target')
    if (w5 instanceof NextResponse) return w5

    const group = await db.group.create({
      data: {
        name,
        logo: logo || null,
        monthlyTarget: mt,
        week1Target: w1,
        week2Target: w2,
        week3Target: w3,
        week4Target: w4,
        week5Target: w5,
      },
    })

    logActivity('CREATE_GROUP', {
      description: `Tambah group: ${name}`,
      details: { name },
    }).catch(() => {})

    return NextResponse.json(group, { status: 201 })
  } catch (error: unknown) {
    console.error('Create group error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Nama group sudah ada' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const { id, name, logo, monthlyTarget, week1Target, week2Target, week3Target, week4Target, week5Target } = body

    if (!id) {
      return NextResponse.json({ error: 'ID group harus diisi' }, { status: 400 })
    }

    if (name !== undefined && (typeof name !== 'string' || name.length > 200)) {
      return NextResponse.json({ error: 'Nama group maksimal 200 karakter' }, { status: 400 })
    }

    const group = await db.group.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(logo !== undefined && { logo }),
        ...(monthlyTarget !== undefined && { monthlyTarget }),
        ...(week1Target !== undefined && { week1Target }),
        ...(week2Target !== undefined && { week2Target }),
        ...(week3Target !== undefined && { week3Target }),
        ...(week4Target !== undefined && { week4Target }),
        ...(week5Target !== undefined && { week5Target }),
      },
    })

    return NextResponse.json(group)
  } catch (error: unknown) {
    console.error('Update group error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Group tidak ditemukan' }, { status: 404 })
    }
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Nama group sudah ada' }, { status: 409 })
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
      return NextResponse.json({ error: 'ID group harus diisi' }, { status: 400 })
    }

    const existing = await db.group.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'ID group harus diisi' }, { status: 400 })
    }

    logActivity('DELETE_GROUP', {
      description: `Hapus group: ${existing.name}`,
      details: { name: existing.name },
    }).catch(() => {})

    await db.group.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Delete group error:', error)
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Group tidak ditemukan' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}