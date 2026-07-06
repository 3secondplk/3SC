import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'

// Helper: get week number (1-5) based on day of month
function getWeekNumber(dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 7) return 1
  if (dayOfMonth <= 14) return 2
  if (dayOfMonth <= 21) return 3
  if (dayOfMonth <= 28) return 4
  return 5
}

// Helper: get week ranges for a month (W1=1-7, W2=8-14, W3=15-21, W4=22-28, W5=29-end)
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

// Helper: get WIB date
function getWIBDate(): Date {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utc + 7 * 3600000)
}

function formatDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'today' // today, week, month
    const groupId = searchParams.get('groupId')

    // Month filter: allow viewing past months (default = current month)
    const filterMonth = searchParams.get('month')
    const filterYear = searchParams.get('year')
    const wibNow = getWIBDate()
    const isCurrentMonth = !filterMonth && !filterYear

    const targetYear = filterYear ? parseInt(filterYear) : wibNow.getFullYear()
    const targetMonth = filterMonth ? parseInt(filterMonth) - 1 : wibNow.getMonth() // 0-indexed
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
    const monthPrefix = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`

    // For "today" and "week" calculations, use real WIB date only if viewing current month
    let currentWeek: number
    let weekStart: number
    let weekEnd: number
    let todayStr: string

    if (isCurrentMonth) {
      const dayOfMonth = wibNow.getDate()
      todayStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`
      currentWeek = getWeekNumber(dayOfMonth, daysInMonth)
      const weekRanges = getWeekRanges(targetYear, targetMonth)
      const currentWeekRange = weekRanges.find(r => r.week === currentWeek)
      weekStart = currentWeekRange?.start ?? 1
      weekEnd = currentWeekRange?.end ?? 7
    } else {
      // For past months, "today" = first day of month, "week" = week 1
      todayStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-01`
      currentWeek = 1
      weekStart = 1
      weekEnd = 7
    }

    const weekStartStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(weekStart).padStart(2, '0')}`
    const weekEndNextDay = new Date(targetYear, targetMonth, weekEnd + 1)
    const weekEndNextDayStr = formatDateStr(weekEndNextDay)

    // Get all crews with their groups
    const crewWhere: Record<string, unknown> = {}
    if (groupId) crewWhere.groupId = groupId

    const crews = await db.crew.findMany({
      where: crewWhere,
      include: { group: true },
    })
    const crewIds = crews.map(c => c.id)

    // Use groupBy aggregation (Sale + TikTokSale combined)
    const [monthAgg, todayAgg, weekAgg, allTimeAgg,
          tkMonthAgg, tkTodayAgg, tkWeekAgg, tkAllTimeAgg] = crewIds.length > 0
      ? await Promise.all([
          db.sale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, tanggal: { startsWith: monthPrefix } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
          db.sale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, tanggal: { startsWith: todayStr } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
          db.sale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, tanggal: { gte: weekStartStr, lt: weekEndNextDayStr } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
          db.sale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
          // TikTok aggregations (Pengiriman + Selesai = active sales)
          db.tikTokSale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { startsWith: monthPrefix } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
          db.tikTokSale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { startsWith: todayStr } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
          db.tikTokSale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { gte: weekStartStr, lt: weekEndNextDayStr } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
          db.tikTokSale.groupBy({
            by: ['crewId'],
            where: { crewId: { in: crewIds }, status: { in: ['Pengiriman', 'Selesai'] } },
            _sum: { settle: true, qty: true },
            _count: true,
          }),
        ])
      : [[], [], [], [], [], [], [], []]

    // Merge Sale + TikTokSale into combined maps
    const mergeAgg = (saleAgg: any[], tiktokAgg: any[]) => {
      const map = new Map(saleAgg.map(a => [a.crewId, { settle: a._sum.settle ?? 0, qty: a._sum.qty ?? 0, count: a._count ?? 0 }]))
      for (const a of tiktokAgg) {
        const existing = map.get(a.crewId) || { settle: 0, qty: 0, count: 0 }
        map.set(a.crewId, {
          settle: existing.settle + (a._sum.settle ?? 0),
          qty: existing.qty + (a._sum.qty ?? 0),
          count: existing.count + (a._count ?? 0),
        })
      }
      return map
    }

    const monthMap = mergeAgg(monthAgg, tkMonthAgg)
    const todayMap = mergeAgg(todayAgg, tkTodayAgg)
    const weekMap = mergeAgg(weekAgg, tkWeekAgg)
    const allTimeMap = mergeAgg(allTimeAgg, tkAllTimeAgg)

    // Struk counts per crew per period
    const [todayStrukRaw, weekStrukRaw, monthStrukRaw, allTimeStrukRaw] = crewIds.length > 0
      ? await Promise.all([
          db.$queryRaw<Array<{ crewId: string; count: number }>>`
            SELECT "crewId", COUNT(DISTINCT "idPenjualan") as count
            FROM "Sale"
            WHERE "crewId" IN (${Prisma.join(crewIds)}) AND "idPenjualan" IS NOT NULL AND "tanggal" LIKE ${todayStr + '%'}
            GROUP BY "crewId"
          `,
          db.$queryRaw<Array<{ crewId: string; count: number }>>`
            SELECT "crewId", COUNT(DISTINCT "idPenjualan") as count
            FROM "Sale"
            WHERE "crewId" IN (${Prisma.join(crewIds)}) AND "idPenjualan" IS NOT NULL AND "tanggal" >= ${weekStartStr} AND "tanggal" < ${weekEndNextDayStr}
            GROUP BY "crewId"
          `,
          db.$queryRaw<Array<{ crewId: string; count: number }>>`
            SELECT "crewId", COUNT(DISTINCT "idPenjualan") as count
            FROM "Sale"
            WHERE "crewId" IN (${Prisma.join(crewIds)}) AND "idPenjualan" IS NOT NULL AND "tanggal" LIKE ${monthPrefix + '%'}
            GROUP BY "crewId"
          `,
          db.$queryRaw<Array<{ crewId: string; count: number }>>`
            SELECT "crewId", COUNT(DISTINCT "idPenjualan") as count
            FROM "Sale"
            WHERE "crewId" IN (${Prisma.join(crewIds)}) AND "idPenjualan" IS NOT NULL
            GROUP BY "crewId"
          `,
        ])
      : [[], [], [], []]

    const todayStrukMap = new Map(todayStrukRaw.map(r => [r.crewId, Number(r.count)]))
    const weekStrukMap = new Map(weekStrukRaw.map(r => [r.crewId, Number(r.count)]))
    const monthStrukMap = new Map(monthStrukRaw.map(r => [r.crewId, Number(r.count)]))
    const allTimeStrukMap = new Map(allTimeStrukRaw.map(r => [r.crewId, Number(r.count)]))

    // Calculate per-week date ranges for all weeks (4 or 5)
    const weekRanges = getWeekRanges(targetYear, targetMonth)

    // Query per-week aggregation for all weeks (Sale + TikTokSale)
    const weekAggPromises = weekRanges.map(wr =>
      Promise.all([
        db.sale.groupBy({
          by: ['crewId'],
          where: { crewId: { in: crewIds }, tanggal: { gte: wr.startStr, lt: wr.endNextDayStr } },
          _sum: { settle: true },
        }),
        db.tikTokSale.groupBy({
          by: ['crewId'],
          where: { crewId: { in: crewIds }, status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { gte: wr.startStr, lt: wr.endNextDayStr } },
          _sum: { settle: true },
        }),
      ])
    )
    const weekAggResults = crewIds.length > 0 ? await Promise.all(weekAggPromises) : weekRanges.map(() => [[], []])
    const weekAggMaps = weekAggResults.map(([saleAgg, tkAgg]) => {
      const map = new Map(saleAgg.map((a: any) => [a.crewId, a._sum.settle ?? 0]))
      for (const a of tkAgg) {
        map.set(a.crewId, (map.get(a.crewId) ?? 0) + (a._sum.settle ?? 0))
      }
      return map
    })
    // TikTok-only per-week maps (for visual breakdown)
    const tkWeekOnlyMaps = weekAggResults.map(([_, tkAgg]) =>
      new Map(tkAgg.map((a: any) => [a.crewId, a._sum.settle ?? 0]))
    )
    // TikTok-only month map
    const tkMonthOnlyMap = new Map(tkMonthAgg.map((a: any) => [a.crewId, a._sum.settle ?? 0]))

    // Build group info map
    const groupInfoMap = new Map<string, { monthlyTarget: number; crewCount: number; weeklyTargetPcts: number[] }>()
    for (const crew of crews) {
      if (!groupInfoMap.has(crew.group.id)) {
        groupInfoMap.set(crew.group.id, {
          monthlyTarget: crew.group.monthlyTarget,
          crewCount: 0,
          weeklyTargetPcts: [crew.group.week1Target, crew.group.week2Target, crew.group.week3Target, crew.group.week4Target, crew.group.week5Target ?? 0],
        })
      }
      groupInfoMap.get(crew.group.id)!.crewCount++
    }

    const crewStats = crews.map(crew => {
      const mAgg = monthMap.get(crew.id)
      const tAgg = todayMap.get(crew.id)
      const wAgg = weekMap.get(crew.id)
      const aAgg = allTimeMap.get(crew.id)

      const monthTotal = mAgg?.settle ?? 0
      const monthQty = mAgg?.qty ?? 0
      const todayTotal = tAgg?.settle ?? 0
      const todayQty = tAgg?.qty ?? 0
      const weekTotal = wAgg?.settle ?? 0
      const weekQty = wAgg?.qty ?? 0
      const allTimeTotal = aAgg?.settle ?? 0
      const allTimeQty = aAgg?.qty ?? 0

      const todayStruk = todayStrukMap.get(crew.id) ?? 0
      const weekStruk = weekStrukMap.get(crew.id) ?? 0
      const monthStruk = monthStrukMap.get(crew.id) ?? 0
      const allTimeStruk = allTimeStrukMap.get(crew.id) ?? 0

      // Target per Crew calculation
      const gInfo = groupInfoMap.get(crew.group.id)
      const crewCount = gInfo?.crewCount ?? 1
      const groupMonthlyTarget = gInfo?.monthlyTarget ?? 0
      const weeklyPcts = gInfo?.weeklyTargetPcts ?? [0, 0, 0, 0, 0]

      const crewMonthlyTarget = crewCount > 0 ? Math.round(groupMonthlyTarget / crewCount) : 0
      const crewWeeklyTargets = weeklyPcts.map(pct => Math.round((crewMonthlyTarget * pct) / 100))
      const crewCurrentWeekTarget = crewWeeklyTargets[currentWeek - 1] ?? 0
      const crewMonthlyAchievement = crewMonthlyTarget > 0 ? Math.min(Math.round((monthTotal / crewMonthlyTarget) * 100), 999) : 0
      const crewWeeklyAchievement = crewCurrentWeekTarget > 0 ? Math.min(Math.round((weekTotal / crewCurrentWeekTarget) * 100), 999) : 0

      // Per-week achievements for this crew
      const crewWeeklyDetails = weekRanges.map((wr, i) => {
        const weekTarget = crewWeeklyTargets[i]
        const weekTotalForCrew = weekAggMaps[i].get(crew.id) ?? 0
        const achievement = weekTarget > 0 ? Math.min(Math.round((weekTotalForCrew / weekTarget) * 100), 999) : 0
        return {
          week: wr.week,
          targetPct: weeklyPcts[i],
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
        groupId: crew.group.id,
        groupName: crew.group.name,
        groupLogo: crew.group.logo,
        todayTotal,
        todayQty,
        todayStruk,
        weekTotal,
        weekQty,
        weekStruk,
        monthTotal,
        monthQty,
        monthStruk,
        allTimeTotal,
        allTimeQty,
        allTimeStruk,
        transactionCount: aAgg?.count ?? 0,
        crewMonthlyTarget,
        crewMonthlyAchievement,
        crewWeeklyTargets,
        crewCurrentWeekTarget,
        crewWeeklyAchievement,
        crewWeeklyDetails,
        currentWeek,
        groupMonthlyTarget,
        groupWeeklyTargetPcts: weeklyPcts,
      }
    })

    // Sort by relevant period
    let sortedCrews = [...crewStats]
    switch (period) {
      case 'today':
        sortedCrews.sort((a, b) => b.todayTotal - a.todayTotal)
        break
      case 'week':
        sortedCrews.sort((a, b) => b.weekTotal - a.weekTotal)
        break
      case 'month':
        sortedCrews.sort((a, b) => b.monthTotal - a.monthTotal)
        break
    }

    // Calculate totals
    const totals = {
      today: crewStats.reduce((s, c) => s + c.todayTotal, 0),
      week: crewStats.reduce((s, c) => s + c.weekTotal, 0),
      month: crewStats.reduce((s, c) => s + c.monthTotal, 0),
      todayQty: crewStats.reduce((s, c) => s + c.todayQty, 0),
      weekQty: crewStats.reduce((s, c) => s + c.weekQty, 0),
      monthQty: crewStats.reduce((s, c) => s + c.monthQty, 0),
    }

    // Count claimed/unclaimed + imported data per period (Sale + TikTok)
    const [claimedAgg, unclaimedAgg, allSalesAgg, importedTodayAgg, importedWeekAgg, importedMonthAgg,
          tkMonthAgg2, tkTodayAgg2, tkWeekAgg2, tkAllAgg2] = await Promise.all([
      db.sale.count({ where: { crewId: { not: null } } }),
      db.sale.count({ where: { crewId: null } }),
      db.sale.aggregate({ _sum: { settle: true, qty: true } }),
      db.sale.aggregate({ _sum: { settle: true, qty: true }, where: { tanggal: { startsWith: todayStr } } }),
      db.sale.aggregate({ _sum: { settle: true, qty: true }, where: { tanggal: { gte: weekStartStr, lt: weekEndNextDayStr } } }),
      db.sale.aggregate({ _sum: { settle: true, qty: true }, where: { tanggal: { startsWith: monthPrefix } } }),
      // TikTok totals (Pengiriman + Selesai)
      db.tikTokSale.aggregate({ _sum: { settle: true, qty: true }, where: { status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { startsWith: todayStr } } }),
      db.tikTokSale.aggregate({ _sum: { settle: true, qty: true }, where: { status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { gte: weekStartStr, lt: weekEndNextDayStr } } }),
      db.tikTokSale.aggregate({ _sum: { settle: true, qty: true }, where: { status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { startsWith: monthPrefix } } }),
      db.tikTokSale.aggregate({ _sum: { settle: true, qty: true }, where: { status: { in: ['Pengiriman', 'Selesai'] } } }),
    ])

    // TikTok weekly breakdown for chart (Pengiriman + Selesai)
    const tiktokWeeklyBreakdown = await Promise.all(
      weekRanges.map(wr =>
        db.tikTokSale.aggregate({
          _sum: { settle: true, qty: true },
          _count: true,
          where: { status: { in: ['Pengiriman', 'Selesai'] }, tanggal: { gte: wr.startStr, lt: wr.endNextDayStr } },
        })
      )
    )

    // --- Trends (only for current month) ---
    const saleGroupFilter = groupId ? { crew: { groupId } } : {}
    const [yesterdayAgg, lastWeekAgg, lastMonthAgg, lastWeekTotalsAgg, recentSales, groups] = isCurrentMonth
      ? await Promise.all([
          // Yesterday
          (() => {
            const yesterdayDate = new Date(wibNow)
            yesterdayDate.setDate(yesterdayDate.getDate() - 1)
            const yesterdayStr = formatDateStr(yesterdayDate)
            return db.sale.aggregate({ _sum: { settle: true }, where: { ...saleGroupFilter, tanggal: { startsWith: yesterdayStr } } })
          })(),
          // Last week (previous 7-day window)
          (() => {
            const yesterdayDate = new Date(wibNow)
            yesterdayDate.setDate(yesterdayDate.getDate() - 1)
            const lastWeekStart = new Date(yesterdayDate)
            lastWeekStart.setDate(lastWeekStart.getDate() - 6)
            const lastWeekEndNextDay = new Date(yesterdayDate)
            lastWeekEndNextDay.setDate(lastWeekEndNextDay.getDate() + 1)
            return db.sale.aggregate({ _sum: { settle: true }, where: { ...saleGroupFilter, tanggal: { gte: formatDateStr(lastWeekStart), lt: formatDateStr(lastWeekEndNextDay) } } })
          })(),
          // Last month
          (() => {
            const lastMonthDate = new Date(wibNow.getFullYear(), wibNow.getMonth() - 1, 1)
            const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
            return db.sale.aggregate({ _sum: { settle: true }, where: { ...saleGroupFilter, tanggal: { startsWith: lastMonthStr } } })
          })(),
          // Last week totals for comparison
          (() => {
            const yesterdayDate = new Date(wibNow)
            yesterdayDate.setDate(yesterdayDate.getDate() - 1)
            const lastWeekStart = new Date(yesterdayDate)
            lastWeekStart.setDate(lastWeekStart.getDate() - 6)
            const lastWeekEndNextDay = new Date(yesterdayDate)
            lastWeekEndNextDay.setDate(lastWeekEndNextDay.getDate() + 1)
            return db.sale.aggregate({ _sum: { settle: true, qty: true }, _count: true, where: { ...saleGroupFilter, tanggal: { gte: formatDateStr(lastWeekStart), lt: formatDateStr(lastWeekEndNextDay) } } })
          })(),
          // Recent sales
          db.sale.findMany({
            take: 10,
            where: { crewId: { not: null } },
            include: { crew: { select: { name: true, photo: true, group: { select: { name: true } } } } },
            orderBy: { createdAt: 'desc' },
          }),
          // Groups
          db.group.findMany({ include: { crews: { select: { id: true } } } }),
        ])
      : await Promise.all([
          // For past months: no trends
          { _sum: { settle: null } } as any,
          { _sum: { settle: null } } as any,
          { _sum: { settle: null } } as any,
          { _sum: { settle: 0, qty: 0 }, _count: 0 } as any,
          // Recent sales for the month
          db.sale.findMany({
            take: 10,
            where: { tanggal: { startsWith: monthPrefix }, crewId: { not: null } },
            include: { crew: { select: { name: true, photo: true, group: { select: { name: true } } } } },
            orderBy: { createdAt: 'desc' },
          }),
          db.group.findMany({ include: { crews: { select: { id: true } } } }),
        ])

    const calcTrend = (current: number, previous: number | null) => {
      const prev = previous ?? 0
      if (prev === 0) {
        return { previousValue: prev, changePercent: null, direction: 'same' as const }
      }
      const changePercent = Math.round(((current - prev) / prev) * 10000) / 100
      return {
        previousValue: prev,
        changePercent,
        direction: (changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'same') as 'up' | 'down' | 'same',
      }
    }

    const trends = {
      today: calcTrend(importedTodayAgg._sum.settle ?? 0, yesterdayAgg._sum.settle),
      week: calcTrend(importedWeekAgg._sum.settle ?? 0, lastWeekAgg._sum.settle),
      month: calcTrend(importedMonthAgg._sum.settle ?? 0, lastMonthAgg._sum.settle),
    }

    // Group/Zoning achievements
    const groupAchievements = groups.map(group => {
      const groupMonthTotal = group.crews.reduce((sum, c) => sum + (monthMap.get(c.id)?.settle ?? 0), 0)
      const weeklyTotal = group.crews.reduce((sum, c) => sum + (weekMap.get(c.id)?.settle ?? 0), 0)

      const weeklyTargetPcts = [group.week1Target, group.week2Target, group.week3Target, group.week4Target, group.week5Target ?? 0]
      let weekTargetPct = weeklyTargetPcts[currentWeek - 1] ?? 0

      const monthlyAchievement = group.monthlyTarget > 0
        ? Math.min((groupMonthTotal / group.monthlyTarget) * 100, 100)
        : 0
      const weeklyTarget = group.monthlyTarget * (weekTargetPct / 100)
      const weeklyAchievement = weeklyTarget > 0
        ? Math.min((weeklyTotal / weeklyTarget) * 100, 100)
        : 0

      const crewCount = group.crews.length
      const crewMonthlyTarget = crewCount > 0 ? Math.round(group.monthlyTarget / crewCount) : 0
      const crewWeeklyTargets = weeklyTargetPcts.map(pct => Math.round((crewMonthlyTarget * pct) / 100))

      // Per-week achievements
      const weeklyDetails = weekRanges.map((wr, i) => {
        const targetPct = weeklyTargetPcts[i]
        const weekTarget = group.monthlyTarget * (targetPct / 100)
        const weekTotal = group.crews.reduce((sum, c) => sum + (weekAggMaps[i].get(c.id) ?? 0), 0)
        const weekTiktok = group.crews.reduce((sum, c) => sum + (tkWeekOnlyMaps[i].get(c.id) ?? 0), 0)
        const achievement = weekTarget > 0 ? Math.min(Math.round((weekTotal / weekTarget) * 100), 999) : 0
        return {
          week: wr.week,
          targetPct,
          target: Math.round(weekTarget),
          total: weekTotal,
          tiktokTotal: weekTiktok,
          achievement,
          dateFrom: wr.start,
          dateTo: wr.end,
        }
      })

      const groupTiktokMonth = group.crews.reduce((sum, c) => sum + (tkMonthOnlyMap.get(c.id) ?? 0), 0)

      return {
        id: group.id,
        name: group.name,
        logo: group.logo,
        monthlyTarget: group.monthlyTarget,
        monthlyTotal: groupMonthTotal,
        tiktokMonthlyTotal: groupTiktokMonth,
        monthlyAchievement,
        weeklyTarget,
        weeklyTotal,
        weeklyAchievement,
        weekTargetPct,
        currentWeek,
        crewCount,
        crewMonthlyTarget,
        weeklyTargetPcts,
        crewWeeklyTargets,
        weeklyDetails,
      }
    })

    const topCrews = sortedCrews.slice(0, 3)

    return NextResponse.json({
      crewStats: sortedCrews,
      totals: {
        ...totals,
        today: crewStats.reduce((s, c) => s + c.todayTotal, 0),
        week: crewStats.reduce((s, c) => s + c.weekTotal, 0),
        month: crewStats.reduce((s, c) => s + c.monthTotal, 0),
        todayQty: crewStats.reduce((s, c) => s + c.todayQty, 0),
        weekQty: crewStats.reduce((s, c) => s + c.weekQty, 0),
        monthQty: crewStats.reduce((s, c) => s + c.monthQty, 0),
        totalTransactions: claimedAgg + unclaimedAgg,
        totalSettle: allSalesAgg._sum.settle ?? 0,
        totalQty: allSalesAgg._sum.qty ?? 0,
        importedToday: importedTodayAgg._sum.settle ?? 0,
        importedTodayQty: importedTodayAgg._sum.qty ?? 0,
        importedWeek: importedWeekAgg._sum.settle ?? 0,
        importedWeekQty: importedWeekAgg._sum.qty ?? 0,
        importedMonth: importedMonthAgg._sum.settle ?? 0,
        importedMonthQty: importedMonthAgg._sum.qty ?? 0,
        // TikTok totals (Pengiriman + Selesai)
        tiktokToday: tkTodayAgg2._sum.settle ?? 0,
        tiktokTodayQty: tkTodayAgg2._sum.qty ?? 0,
        tiktokWeek: tkWeekAgg2._sum.settle ?? 0,
        tiktokWeekQty: tkWeekAgg2._sum.qty ?? 0,
        tiktokMonth: tkMonthAgg2._sum.settle ?? 0,
        tiktokMonthQty: tkMonthAgg2._sum.qty ?? 0,
        tiktokAllTime: tkAllAgg2._sum.settle ?? 0,
        // TikTok weekly breakdown
        tiktokWeeklyBreakdown: weekRanges.map((wr, i) => ({
          week: wr.week,
          settle: tiktokWeeklyBreakdown[i]._sum.settle ?? 0,
          qty: tiktokWeeklyBreakdown[i]._sum.qty ?? 0,
          count: tiktokWeeklyBreakdown[i]._count ?? 0,
          dateFrom: wr.start,
          dateTo: wr.end,
        })),
      },
      trends,
      groupAchievements,
      topCrews,
      recentSales,
      lastWeekTotals: isCurrentMonth
        ? { settle: lastWeekTotalsAgg._sum.settle ?? 0, qty: lastWeekTotalsAgg._sum.qty ?? 0, transactions: lastWeekTotalsAgg._count ?? 0 }
        : null,
      dateInfo: {
        today: todayStr,
        currentWeek,
        weekStart,
        weekEnd,
        currentMonth: targetMonth,
        currentYear: targetYear,
        isCurrentMonth,
      },
      claimedCount: claimedAgg,
      unclaimedCount: unclaimedAgg,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Dashboard error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan', detail: msg }, { status: 500 })
  }
}