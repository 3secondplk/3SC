import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { loadMonthTargets } from '@/lib/target-service'
import { wibNowParts, isoDate, weekOfDay, daysInMonthOf } from '@/lib/target-engine'

// ─── PUBLIC API: Target & Jadwal (halaman publik, TANPA login) ──────────
// GET /api/public/target-schedule?year=&month=&date=
//
// Read-only. Semua perubahan data tetap hanya lewat endpoint management
// yang dilindungi auth. Data yang diekspos sama dengan dashboard publik:
// target toko, distribusi, alokasi zoning, jadwal shift, dan breakdown.

export async function GET(request: NextRequest) {
  try {
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
    const focusWeek = weekOfDay(Number(focusDate.slice(8, 10)))

    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const dim = daysInMonthOf(year, monthIndex)

    // ── Jadwal bulan ini (roster aktif) — read-only ──
    const [shifts, crews] = await Promise.all([
      db.crewShift.findMany({
        where: { tanggal: { gte: `${prefix}-01`, lte: `${prefix}-31` } },
        select: { crewId: true, tanggal: true, shiftCode: true },
      }),
      db.crew.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, employeeId: true, photo: true, groupId: true, group: { select: { id: true, name: true } } },
      }),
    ])

    const schedule = {
      year,
      month,
      daysInMonth: dim,
      crews,
      shifts: shifts.map(s => ({ crewId: s.crewId, tanggal: s.tanggal, shiftCode: s.shiftCode })),
    }

    // ── Breakdown target (engine realtime — sama dengan /api/targets/breakdown) ──
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

    const shiftTypes = ctx.shiftTypes.filter(s => s.isActive)

    if (!ctx.engineActive || !ctx.month || !ctx.config) {
      return NextResponse.json({
        engineActive: false,
        message: 'Target breakdown belum dikonfigurasi oleh admin.',
        year, month, daysInMonth: dim, focusDate, focusWeek,
        config: null,
        store: null,
        groups: [],
        checks: null,
        shiftTypes,
        allocationSum: ctx.allocationSum,
        schedule,
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

    const breakdown = {
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
    }

    return NextResponse.json({ breakdown, schedule })
  } catch (error) {
    console.error('Public target-schedule error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
