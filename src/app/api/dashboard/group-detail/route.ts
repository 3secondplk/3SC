import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// Helper: get week number (1-5)
function getWeekNumber(dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 7) return 1
  if (dayOfMonth <= 14) return 2
  if (dayOfMonth <= 21) return 3
  if (dayOfMonth <= 28) return 4
  return 5
}

// Helper: get week ranges for a month
function getWeekRanges(year: number, month: number): Array<{ week: number; start: number; end: number; startStr: string; endNextDayStr: string }> {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const fmt = (d: number) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const ranges: Array<{ week: number; start: number; end: number; startStr: string; endNextDayStr: string }> = [
    { week: 1, start: 1, end: 7, startStr: fmt(1), endNextDayStr: fmt(8) },
    { week: 2, start: 8, end: 14, startStr: fmt(8), endNextDayStr: fmt(15) },
    { week: 3, start: 15, end: 21, startStr: fmt(15), endNextDayStr: fmt(22) },
    { week: 4, start: 22, end: 28, startStr: fmt(22), endNextDayStr: fmt(29) },
  ]
  if (daysInMonth > 28) {
    const nextMonthFirst = new Date(year, month + 1, 1)
    ranges.push({
      week: 5,
      start: 29,
      end: daysInMonth,
      startStr: fmt(29),
      endNextDayStr: `${nextMonthFirst.getFullYear()}-${String(nextMonthFirst.getMonth() + 1).padStart(2, '0')}-${String(nextMonthFirst.getDate()).padStart(2, '0')}`,
    })
  }
  return ranges
}

// GET /api/dashboard/group-detail?groupId=xxx&period=daily
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const groupId = searchParams.get('groupId')
    const period = searchParams.get('period') || 'daily'

    if (!groupId) {
      return NextResponse.json({ error: 'groupId diperlukan' }, { status: 400 })
    }

    // Get current date in WIB (GMT+7)
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const wibNow = new Date(utc + 7 * 3600000)

    const currentMonth = wibNow.getMonth()
    const currentYear = wibNow.getFullYear()
    const dayOfMonth = wibNow.getDate()
    const todayStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
    const currentWeek = getWeekNumber(dayOfMonth, daysInMonth)
    const weekRanges = getWeekRanges(currentYear, currentMonth)
    const currentWeekRange = weekRanges.find(r => r.week === currentWeek)!

    // Determine date range based on period
    let prismaDateFilter: Record<string, unknown>
    let sqlDateCondition: Prisma.Sql
    let periodLabel: string

    switch (period) {
      case 'daily':
        prismaDateFilter = { startsWith: todayStr }
        sqlDateCondition = Prisma.sql`AND "tanggal" LIKE ${todayStr + '%'}`
        periodLabel = `${dayOfMonth} ${shortMonths[currentMonth]} ${currentYear}`
        break
      case 'weekly':
        prismaDateFilter = { gte: currentWeekRange.startStr, lt: currentWeekRange.endNextDayStr }
        sqlDateCondition = Prisma.sql`AND "tanggal" >= ${currentWeekRange.startStr} AND "tanggal" < ${currentWeekRange.endNextDayStr}`
        periodLabel = `Minggu ${currentWeek} (${currentWeekRange.start}–${currentWeekRange.end})`
        break
      case 'monthly':
        prismaDateFilter = { startsWith: monthPrefix }
        sqlDateCondition = Prisma.sql`AND "tanggal" LIKE ${monthPrefix + '%'}`
        periodLabel = `${monthNames[currentMonth]} ${currentYear}`
        break
      default:
        prismaDateFilter = { startsWith: todayStr }
        sqlDateCondition = Prisma.sql`AND "tanggal" LIKE ${todayStr + '%'}`
        periodLabel = todayStr
    }

    // Get group with crews
    const group = await db.group.findUnique({
      where: { id: groupId },
      include: { crews: { orderBy: { name: 'asc' } } },
    })

    if (!group) {
      return NextResponse.json({ error: 'Group tidak ditemukan' }, { status: 404 })
    }

    const crewIds = group.crews.map(c => c.id)

    if (crewIds.length === 0) {
      const weeklyTargetPcts = [group.week1Target, group.week2Target, group.week3Target, group.week4Target, group.week5Target ?? 0]
      return NextResponse.json({
        group: { id: group.id, name: group.name, logo: group.logo, monthlyTarget: group.monthlyTarget },
        period: periodLabel,
        periodKey: period,
        crews: [],
        groupTotal: { qty: 0, settle: 0, struk: 0, basketSize: 0, pricePoint: 0 },
        crewMonthlyTarget: 0,
        weeklyTargetPcts,
        crewWeeklyTargets: [0, 0, 0, 0, 0],
        currentWeek,
      })
    }

    // Parallel queries
    const [aggResult, strukResult] = await Promise.all([
      db.sale.groupBy({
        by: ['crewId'],
        where: { crewId: { in: crewIds }, tanggal: prismaDateFilter },
        _sum: { settle: true, qty: true },
        _count: true,
      }),
      db.$queryRaw<Array<{ crewId: string; count: number }>>`
        SELECT "crewId", COUNT(DISTINCT "idPenjualan") as count
        FROM "Sale"
        WHERE "crewId" IN (${Prisma.join(crewIds)}) AND "idPenjualan" IS NOT NULL ${sqlDateCondition}
        GROUP BY "crewId"
      `,
    ])

    const aggMap = new Map(aggResult.map(a => [a.crewId, a]))
    const strukMap = new Map(strukResult.map(r => [r.crewId, Number(r.count)]))

    // Target calculation
    const crewCount = group.crews.length
    const crewMonthlyTarget = crewCount > 0 ? Math.round(group.monthlyTarget / crewCount) : 0
    const weeklyTargetPcts = [group.week1Target, group.week2Target, group.week3Target, group.week4Target, group.week5Target ?? 0]
    const crewWeeklyTargets = weeklyTargetPcts.map(pct => Math.round((crewMonthlyTarget * pct) / 100))
    const crewCurrentWeekTarget = crewWeeklyTargets[currentWeek - 1] ?? 0

    // Query per-week aggregation
    const weekAggPromises = weekRanges.map(wr =>
      db.sale.groupBy({
        by: ['crewId'],
        where: { crewId: { in: crewIds }, tanggal: { gte: wr.startStr, lt: wr.endNextDayStr } },
        _sum: { settle: true },
      })
    )
    const weekAggResults = await Promise.all(weekAggPromises)
    const weekAggMaps = weekAggResults.map(agg => new Map(agg.map(a => [a.crewId, a._sum.settle ?? 0])))

    const crews = group.crews.map(crew => {
      const agg = aggMap.get(crew.id)
      const struk = strukMap.get(crew.id) ?? 0
      const qty = agg?._sum.qty ?? 0
      const settle = agg?._sum.settle ?? 0
      const basketSize = struk > 0 ? qty / struk : 0
      const pricePoint = qty > 0 ? settle / qty : 0

      const monthlySettle = weekAggMaps.reduce((sum, wMap) => sum + (wMap.get(crew.id) ?? 0), 0)
      const currentWeekSettle = weekAggMaps[currentWeek - 1]?.get(crew.id) ?? 0

      const monthAchievement = crewMonthlyTarget > 0 ? Math.min(Math.round((monthlySettle / crewMonthlyTarget) * 100), 999) : 0
      const weekAchievement = crewCurrentWeekTarget > 0 ? Math.min(Math.round((currentWeekSettle / crewCurrentWeekTarget) * 100), 999) : 0

      const crewWeeklyDetails = weekRanges.map((wr, i) => {
        const weekTarget = crewWeeklyTargets[i]
        const weekTotalForCrew = weekAggMaps[i].get(crew.id) ?? 0
        const achievement = weekTarget > 0 ? Math.min(Math.round((weekTotalForCrew / weekTarget) * 100), 999) : 0
        return {
          week: wr.week,
          targetPct: weeklyTargetPcts[i],
          target: weekTarget,
          total: weekTotalForCrew,
          achievement,
          dateFrom: wr.start,
          dateTo: wr.end,
        }
      })

      return {
        id: crew.id,
        name: crew.name,
        photo: crew.photo,
        employeeId: crew.employeeId,
        totalQty: qty,
        totalSettle: settle,
        totalStruk: struk,
        basketSize: Math.round(basketSize * 100) / 100,
        pricePoint: Math.round(pricePoint),
        itemCount: agg?._count ?? 0,
        crewMonthlyTarget,
        crewCurrentWeekTarget,
        crewMonthlyAchievement: monthAchievement,
        crewWeeklyAchievement: weekAchievement,
        crewWeeklyDetails,
      }
    })

    crews.sort((a, b) => b.totalSettle - a.totalSettle)

    const groupTotalQty = crews.reduce((s, c) => s + c.totalQty, 0)
    const groupTotalSettle = crews.reduce((s, c) => s + c.totalSettle, 0)
    const groupTotalStruk = crews.reduce((s, c) => s + c.totalStruk, 0)
    const groupBasketSize = groupTotalStruk > 0 ? Math.round((groupTotalQty / groupTotalStruk) * 100) / 100 : 0
    const groupPricePoint = groupTotalQty > 0 ? Math.round(groupTotalSettle / groupTotalQty) : 0

    return NextResponse.json({
      group: { id: group.id, name: group.name, logo: group.logo, monthlyTarget: group.monthlyTarget },
      period: periodLabel,
      periodKey: period,
      crews,
      groupTotal: { qty: groupTotalQty, settle: groupTotalSettle, struk: groupTotalStruk, basketSize: groupBasketSize, pricePoint: groupPricePoint },
      crewMonthlyTarget,
      weeklyTargetPcts,
      crewWeeklyTargets,
      currentWeek,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Group detail error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan', detail: msg }, { status: 500 })
  }
}