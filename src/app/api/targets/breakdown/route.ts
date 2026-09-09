import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { loadMonthTargets } from '@/lib/target-service'
import { wibNowParts, isoDate, weekOfDay, daysInMonthOf } from '@/lib/target-engine'

// ─── Target Breakdown API (REALTIME — tanpa snapshot) ──────────────────
// GET /api/targets/breakdown?year=&month=&date=
//   → breakdown lengkap: Toko → Minggu → Hari → Zoning → Crew
//   + checks Σ Target Crew = Σ Target Group = Target Toko

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { searchParams } = new URL(request.url)
    const nowParts = wibNowParts()
    const year = Number(searchParams.get('year')) || nowParts.year
    const month = Number(searchParams.get('month')) || (nowParts.monthIndex + 1) // 1-based
    const monthIndex = month - 1
    if (monthIndex < 0 || monthIndex > 11) {
      return NextResponse.json({ error: 'Bulan tidak valid' }, { status: 400 })
    }
    const dateParam = searchParams.get('date')
    const focusDate = dateParam && /^(\d{4})-(\d{2})-(\d{2})$/.test(dateParam)
      ? dateParam
      : isoDate(year, monthIndex, Math.min(nowParts.day, daysInMonthOf(year, monthIndex)))

    const ctx = await loadMonthTargets(year, monthIndex)
    const groupsMeta = await db.group.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, logo: true },
    })
    const crewsMeta = await db.crew.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, employeeId: true, photo: true, groupId: true },
    })
    const metaById = new Map(crewsMeta.map(c => [c.id, c]))

    const dim = daysInMonthOf(year, monthIndex)
    const focusWeek = weekOfDay(Number(focusDate.slice(8, 10)))

    if (!ctx.engineActive || !ctx.month || !ctx.config) {
      return NextResponse.json({
        engineActive: false,
        message: 'Target breakdown belum dikonfigurasi. Isi Target Bulanan Toko & alokasi zoning terlebih dahulu.',
        year, month, daysInMonth: dim, focusDate, focusWeek,
        config: null,
        store: null,
        groups: [],
        checks: null,
        shiftTypes: ctx.shiftTypes,
        allocationSum: ctx.allocationSum,
      })
    }

    const monthRes = ctx.month
    const todayStr = focusDate

    const groupRows = groupsMeta.map(gMeta => {
      const g = monthRes.groups.get(gMeta.id)
      const todayAmount = g?.daily.get(todayStr) ?? 0
      const zeroToday = g?.zeroWeightDates.get(todayStr) ?? 0
      const crewRows = [...(g?.crews.values() ?? [])].map(c => {
        const meta = metaById.get(c.crewId)
        const shiftCode = c.shiftByDate.get(todayStr) || null
        const st = ctx.shiftTypes.find(s => s.code === shiftCode)
        return {
          id: c.crewId,
          name: meta?.name ?? '(crew dihapus)',
          employeeId: meta?.employeeId ?? '',
          photo: meta?.photo ?? null,
          shiftCode, // null = belum dijadwalkan
          shiftLabel: st?.label ?? null,
          shiftWeight: shiftCode ? (st?.weight ?? 0) : 0,
          todayTarget: c.daily.get(todayStr) ?? 0,
          weeklyTarget: c.weekly[focusWeek - 1] ?? 0,
          monthlyTarget: c.monthly,
        }
      })
      const sumCrewToday = crewRows.reduce((s, c) => s + c.todayTarget, 0)
      return {
        id: gMeta.id,
        name: gMeta.name,
        logo: gMeta.logo,
        allocationPct: g?.allocationPct ?? 0,
        monthlyTarget: g?.monthly ?? 0,
        weeklyTarget: g?.weekly[focusWeek - 1] ?? 0,
        todayTarget: todayAmount,
        // tanggal di mana jadwal terisi tapi semua crew Off → target tak terdistribusi
        unassignedToday: zeroToday,
        legacyEqualSplitToday: g?.legacyEqualSplitDates.has(todayStr) ?? false,
        crews: crewRows,
        sumCrewToday,
        balancedToday: sumCrewToday === todayAmount,
      }
    })

    const sumGroupToday = groupRows.reduce((s, g) => s + g.todayTarget, 0)
    const sumCrewToday = groupRows.reduce((s, g) => s + g.sumCrewToday, 0)
    const sumGroupMonthly = groupRows.reduce((s, g) => s + g.monthlyTarget, 0)
    const sumCrewMonthly = groupRows.reduce((s, g) => s + g.crews.reduce((a, c) => a + c.monthlyTarget, 0), 0)
    const storeToday = monthRes.store.daily.find(d => d.date === todayStr)?.target ?? 0

    return NextResponse.json({
      engineActive: true,
      year, month, daysInMonth: dim, focusDate, focusWeek,
      config: {
        monthlyTarget: ctx.config.monthlyTarget,
        weekPcts: [ctx.config.week1Pct, ctx.config.week2Pct, ctx.config.week3Pct, ctx.config.week4Pct, ctx.config.week5Pct],
        dayPcts: ctx.config.dayPcts,
      },
      shiftTypes: ctx.shiftTypes,
      allocationSum: ctx.allocationSum,
      store: {
        monthlyTarget: monthRes.store.monthly,
        weeklyTargets: monthRes.store.weekly,
        weeklyPcts: [ctx.config.week1Pct, ctx.config.week2Pct, ctx.config.week3Pct, ctx.config.week4Pct, ctx.config.week5Pct],
        todayTarget: storeToday,
        dailyTargets: monthRes.store.daily.map(d => ({ date: d.date, day: d.day, week: d.week, target: d.target })),
      },
      groups: groupRows,
      checks: {
        today: { sumCrew: sumCrewToday, sumGroup: sumGroupToday, store: storeToday, balanced: sumCrewToday === sumGroupToday && sumGroupToday === storeToday },
        monthly: { sumCrew: sumCrewMonthly, sumGroup: sumGroupMonthly, store: monthRes.store.monthly, balanced: sumCrewMonthly === sumGroupMonthly && sumGroupMonthly === monthRes.store.monthly },
      },
    })
  } catch (error) {
    console.error('Breakdown error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
