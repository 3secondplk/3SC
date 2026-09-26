import { db } from '@/lib/db'
import type { ReportQuery, WeeklyMatrixQuery } from '@/lib/report-schemas'
import { loadMonthTargets } from '@/lib/target-service'
import { resolveWeekTargets } from '@/lib/week-targets'
import {
  weekOfDay, weekRange, daysInMonthOf, isoDate, wibNowParts,
} from '@/lib/target-engine'

// ─────────────────────────────────────────────────────────
// Report Service — logika inti Laporan (read-only) yang dipakai
// BERSAMA oleh endpoint admin (/api/management/report/*) dan
// endpoint publik (/api/public/report/*).
//
// Endpoint hanya jadi wrapper tipis:
//   admin  → requireAuth + rate-limit per admin
//   publik → rate-limit per IP (read-only, tanpa data sensitif)
//
// Dengan ini aturan report TIDAK diduplikasi di dua tempat —
// perubahan semantik cukup dilakukan di file ini.
// ─────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

// ─────────────────────────────────────────────────────────
// LAPORAN PENJUALAN (Report by Zoning/Group & Crew)
// ─────────────────────────────────────────────────────────

// FILTER (source of truth = relasi Management existing, BUKAN mapping baru):
//   crewId  — satu crew saja (opsional)
//   groupId — satu zoning/group saja (opsional). Anggota crew diselesaikan
//             SERVER-SIDE dari Crew.groupId (client tidak dipercaya).
//   crewId + groupId bersamaan → diverifikasi crew benar-benar anggota
//   zoning itu; jika bukan → 400 (crew tidak boleh muncul di zoning lain).
//
// Hanya penjualan yang SUDAH DIKLAIM crew (crewId != null) yang masuk report
// (perilaku existing dipertahankan).
export async function getReportData(q: ReportQuery): Promise<ServiceResult<unknown>> {
  try {
    const { crewId, groupId, dateFrom, dateTo, search, page, limit } = q

    // ─── Ownership check: crew harus benar-benar anggota zoning (dari DB) ───
    if (crewId && groupId) {
      const crew = await db.crew.findUnique({
        where: { id: crewId },
        select: { groupId: true },
      })
      if (!crew) {
        return { ok: false, status: 404, error: 'Crew tidak ditemukan' }
      }
      if (crew.groupId !== groupId) {
        return { ok: false, status: 400, error: 'Crew tidak berada di zoning/group yang dipilih' }
      }
    }

    // ─── Resolusi anggota zoning SERVER-SIDE (jangan percaya mapping client) ───
    let groupCrewIds: string[] | null = null
    if (groupId) {
      const members = await db.crew.findMany({
        where: { groupId },
        select: { id: true },
      })
      groupCrewIds = members.map((c) => c.id)
    }

    // Build Prisma where clause — hanya penjualan yang diklaim crew
    const where: Record<string, unknown> = {}
    if (crewId) {
      where.crewId = crewId
    } else if (groupCrewIds) {
      // Zoning dipilih → hanya crew anggota zoning itu (index crewId dipakai)
      where.crewId = { in: groupCrewIds }
    } else {
      where.crewId = { not: null }
    }

    // Search across kodeExtend, brand, dept (case-insensitive)
    if (search) {
      const searchConditions: Record<string, unknown>[] = [
        { kodeExtend: { contains: search } },
        { brand: { contains: search } },
        { dept: { contains: search } },
      ]
      // If searching within a specific crew, also search crew name
      if (crewId) {
        searchConditions.push({ crew: { name: { contains: search } } })
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

    // ─────────────────────────────────────────────────────
    // BREAKDOWN per Zoning/Group & per Crew — dibaca dari relasi
    // Crew.groupId yang sudah ada (TIDAK ada mapping baru).
    // Aggregate via SQL groupBy crewId (index crewId), lalu diolah di JS.
    // ─────────────────────────────────────────────────────
    const scopeCrewIds = crewId
      ? [crewId]
      : groupCrewIds // null = semua crew
    const crewList = await db.crew.findMany({
      where: scopeCrewIds ? { id: { in: scopeCrewIds } } : undefined,
      select: {
        id: true,
        name: true,
        groupId: true,
        group: { select: { id: true, name: true } },
      },
    })
    const crewMap = new Map(crewList.map((c) => [c.id, c]))

    const [byCrewAgg, strukByCrew] = await Promise.all([
      db.sale.groupBy({
        by: ['crewId'],
        where,
        _sum: { qty: true, settle: true },
      }),
      db.sale.groupBy({
        by: ['crewId', 'idPenjualan'],
        where: { ...where, idPenjualan: { not: null } },
      }),
    ])

    // distinct (crew, idPenjualan) → jumlah struk per crew
    const strukPerCrew = new Map<string, Set<string>>()
    for (const row of strukByCrew) {
      if (!row.crewId || !row.idPenjualan) continue
      if (!strukPerCrew.has(row.crewId)) strukPerCrew.set(row.crewId, new Set())
      strukPerCrew.get(row.crewId)!.add(row.idPenjualan)
    }

    interface CrewRow {
      crewId: string
      crewName: string
      groupId: string
      groupName: string
      totalQty: number
      totalSettle: number
      totalStruk: number
      pctSettle: number
    }
    const byCrew: CrewRow[] = byCrewAgg
      .map((agg) => {
        const crew = agg.crewId ? crewMap.get(agg.crewId) : undefined
        if (!crew) return null
        return {
          crewId: crew.id,
          crewName: crew.name,
          groupId: crew.groupId,
          groupName: crew.group?.name || '—',
          totalQty: agg._sum.qty ?? 0,
          totalSettle: agg._sum.settle ?? 0,
          totalStruk: strukPerCrew.get(crew.id)?.size ?? 0,
          pctSettle: totalSettle > 0 ? ((agg._sum.settle ?? 0) / totalSettle) * 100 : 0,
        }
      })
      .filter((r): r is CrewRow => r !== null)
      .sort((a, b) => b.totalSettle - a.totalSettle || b.totalQty - a.totalQty || a.crewName.localeCompare(b.crewName))

    // Crew → Group rollup (JS aggregate, tidak query ulang)
    const groupMap = new Map<string, {
      groupId: string
      groupName: string
      crewIds: Set<string>
      totalQty: number
      totalSettle: number
      totalStruk: number
    }>()
    for (const row of byCrew) {
      if (!groupMap.has(row.groupId)) {
        groupMap.set(row.groupId, {
          groupId: row.groupId,
          groupName: row.groupName,
          crewIds: new Set(),
          totalQty: 0,
          totalSettle: 0,
          totalStruk: 0,
        })
      }
      const g = groupMap.get(row.groupId)!
      g.crewIds.add(row.crewId)
      g.totalQty += row.totalQty
      g.totalSettle += row.totalSettle
      g.totalStruk += row.totalStruk
    }
    const byGroup = Array.from(groupMap.values())
      .map((g) => ({
        groupId: g.groupId,
        groupName: g.groupName,
        crewCount: g.crewIds.size,
        totalQty: g.totalQty,
        totalSettle: g.totalSettle,
        totalStruk: g.totalStruk,
        pctSettle: totalSettle > 0 ? (g.totalSettle / totalSettle) * 100 : 0,
      }))
      .sort((a, b) => b.totalSettle - a.totalSettle || a.groupName.localeCompare(b.groupName))

    return {
      ok: true,
      data: {
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
        breakdown: {
          byGroup,
          byCrew,
        },
      },
    }
  } catch (error) {
    console.error('Report service error:', error)
    return { ok: false, status: 500, error: 'Terjadi kesalahan saat memuat laporan' }
  }
}

// ─────────────────────────────────────────────────────────
// LAPORAN MINGGUAN (Weekly Matrix — format sheet toko)
// ─────────────────────────────────────────────────────────

// Daftar dept kanonik sesuai format laporan toko (urutan fixed)
const FIXED_DEPTS: string[] = [
  'JAM TANGAN', 'KACAMATA', 'KRIKET', 'BODYSUITS', 'CIPUT', 'SKIRT', 'DRESS',
  'KERUDUNG', 'SANDAL', 'SEPATU', 'CELANA WNT', 'CELANA PRIA', 'KAOS WNT',
  'KAOS PRIA', 'KEMEJA WNT', 'KEMEJA PRIA', 'JAKET WNT', 'JAKET PRIA',
  'RAJUT WNT', 'RAJUT PRIA', 'TAS', 'TOPI/KUPLUK', 'AKSESORIS', 'KAOS KAKI',
  'SABUK', 'DOMPET', 'BOZER', 'PERNAK PERNIK',
]
const FIXED_SET = new Set(FIXED_DEPTS)

// Alias penulisan dept di data → kategori kanonik sheet
const DEPT_ALIAS: Record<string, string> = {
  'CELANA WANITA': 'CELANA WNT',
  'KAOS WANITA': 'KAOS WNT',
  'KEMEJA WANITA': 'KEMEJA WNT',
  'JAKET WANITA': 'JAKET WNT',
  'RAJUT WANITA': 'RAJUT WNT',
}

export const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

function normalizeDept(raw: string | null | undefined): string {
  const s = (raw || '').trim().toUpperCase()
  if (!s) return '(TANPA DEPT)'
  return DEPT_ALIAS[s] || s
}

// Laporan mingguan per Zoning (Group) — format sheet toko:
//   Tabel 1 (MATRIX): per crew × Week 1–5 → QTY | NETTO | TARGET | ACV
//                     + TOTAL (QTY, NETTO, ACV) + baris TOTAL ZONING.
//   Tabel 2 (DEPT)  : per crew × week → daftar DEPT (QTY, NETTO).
//
// SUMBER DATA (read/query layer — bukan mapping baru):
//   - PENJUALAN : tabel Sale yang SUDAH DIKLAIM crew (crewId != null),
//                 scope bulan pilihan, QTY = Σ qty, NETTO = Σ netto.
//   - TARGET    : engine realtime (loadMonthTargets → Toko → Zoning → Crew);
//                 target MINGGUAN crew = split sama rata target zoning
//                 (fix-5, konsisten dengan dashboard & breakdown).
//                 Fallback legacy (engine off): resolveWeekTargets dari
//                 Group.monthlyTarget + week1..5Target ÷ crewCount.
//   - ACV       = NETTO ÷ TARGET × 100 (dibulatkan, cap 999).
export async function getWeeklyMatrixData(q: WeeklyMatrixQuery): Promise<ServiceResult<unknown>> {
  try {
    const { groupId } = q
    const nowWib = wibNowParts()
    const year = q.year ?? nowWib.year
    const monthIdx = (q.month ?? nowWib.monthIndex + 1) - 1

    const monthPrefix = isoDate(year, monthIdx, 1).slice(0, 7) // yyyy-mm
    const dim = daysInMonthOf(year, monthIdx)
    const nextMonthFirst = monthIdx === 11 ? isoDate(year + 1, 0, 1) : isoDate(year, monthIdx + 1, 1)
    const maxWeek = dim > 28 ? 5 : 4

    // Metadata minggu yang ada tanggalnya di bulan tsb
    const weeksMeta: Array<{ week: number; dateFrom: string; dateTo: string; label: string; days: number }> = []
    for (let w = 1; w <= maxWeek; w++) {
      const [fromD, toD] = weekRange(w, dim)
      const to = Math.min(toD, dim)
      weeksMeta.push({
        week: w,
        dateFrom: isoDate(year, monthIdx, fromD),
        dateTo: isoDate(year, monthIdx, to),
        label: `${fromD}–${to} ${SHORT_MONTHS[monthIdx]}`,
        days: to - fromD + 1,
      })
    }

    // Zoning + crew anggota (SERVER-SIDE dari Crew.groupId — bukan mapping client)
    const groups = await db.group.findMany({
      where: groupId ? { id: groupId } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { crews: { orderBy: { name: 'asc' }, select: { id: true, name: true, employeeId: true } } },
    })
    if (groupId && groups.length === 0) {
      return { ok: false, status: 404, error: 'Zoning/Group tidak ditemukan' }
    }

    const allCrewIds = groups.flatMap(g => g.crews.map(c => c.id))

    // Konteks target engine (realtime) — sekali load untuk seluruh grup
    const targetCtx = await loadMonthTargets(year, monthIdx)
    const engineActive = targetCtx.engineActive && !!targetCtx.month

    // Penjualan terklaim dalam bulan tsb (SATU query — agregasi di JS)
    const sales = allCrewIds.length > 0
      ? await db.sale.findMany({
          where: { crewId: { in: allCrewIds }, tanggal: { gte: `${monthPrefix}-01`, lt: nextMonthFirst } },
          select: { crewId: true, tanggal: true, qty: true, netto: true, dept: true },
        })
      : []

    // ─── Agregasi: crew → week → {qty,netto} dan crew → week → dept → {qty,netto} ───
    const agg = new Map<string, Map<number, { qty: number; netto: number }>>()
    const deptAgg = new Map<string, Map<number, Map<string, { qty: number; netto: number }>>>()
    for (const s of sales) {
      if (!s.crewId) continue
      const day = Number(String(s.tanggal).slice(8, 10))
      if (!Number.isInteger(day) || day < 1 || day > dim) continue
      const w = weekOfDay(day)

      if (!agg.has(s.crewId)) agg.set(s.crewId, new Map())
      const byWeek = agg.get(s.crewId)!
      const acc = byWeek.get(w) ?? { qty: 0, netto: 0 }
      acc.qty += s.qty
      acc.netto += s.netto
      byWeek.set(w, acc)

      const dept = normalizeDept(s.dept)
      if (!deptAgg.has(s.crewId)) deptAgg.set(s.crewId, new Map())
      const deptByWeek = deptAgg.get(s.crewId)!
      if (!deptByWeek.has(w)) deptByWeek.set(w, new Map())
      const dMap = deptByWeek.get(w)!
      const dAcc = dMap.get(dept) ?? { qty: 0, netto: 0 }
      dAcc.qty += s.qty
      dAcc.netto += s.netto
      dMap.set(dept, dAcc)
    }

    const acvOf = (netto: number, target: number) =>
      target > 0 ? Math.min(999, Math.round((netto / target) * 100)) : 0

    const outGroups = groups.map((g) => {
      const crewCount = g.crews.length
      const engineGroup = engineActive ? (targetCtx.month!.groups.get(g.id) ?? null) : null

      // TARGET mingguan per crew: engine (split sama rata fix-5) / legacy fallback
      const crewWeeklyTargets = new Map<string, number[]>()
      if (engineGroup) {
        for (const c of engineGroup.crews.values()) {
          if (g.crews.some(gc => gc.id === c.crewId)) {
            crewWeeklyTargets.set(c.crewId, [...c.weekly])
          }
        }
      }
      if (crewWeeklyTargets.size === 0) {
        const wt = resolveWeekTargets(Number(g.monthlyTarget) || 0, [
          Number(g.week1Target) || 0, Number(g.week2Target) || 0, Number(g.week3Target) || 0,
          Number(g.week4Target) || 0, Number(g.week5Target) || 0,
        ])
        for (const c of g.crews) {
          crewWeeklyTargets.set(c.id, wt.amounts.map(a => (crewCount > 0 ? Math.round(a / crewCount) : 0)))
        }
      }

      // ─── Baris per crew ───
      const crewsOut = g.crews.map((c) => {
        const weekly = weeksMeta.map((wm) => {
          const a = agg.get(c.id)?.get(wm.week) ?? { qty: 0, netto: 0 }
          const target = crewWeeklyTargets.get(c.id)?.[wm.week - 1] ?? 0
          const netto = Math.round(a.netto)
          return { qty: a.qty, netto, target, acv: acvOf(netto, target) }
        })
        const tQty = weekly.reduce((s, w) => s + w.qty, 0)
        const tNetto = weekly.reduce((s, w) => s + w.netto, 0)
        const tTarget = weekly.reduce((s, w) => s + w.target, 0)
        return {
          crewId: c.id,
          name: c.name,
          employeeId: c.employeeId,
          weeks: weekly,
          total: { qty: tQty, netto: tNetto, target: tTarget, acv: acvOf(tNetto, tTarget) },
        }
      })

      // ─── Baris TOTAL ZONING (Σ crew; target zoning dari engine/fallback) ───
      const zoningWeeklyTarget = engineGroup
        ? engineGroup.weekly.slice(0, maxWeek)
        : (() => {
            const wt = resolveWeekTargets(Number(g.monthlyTarget) || 0, [
              Number(g.week1Target) || 0, Number(g.week2Target) || 0, Number(g.week3Target) || 0,
              Number(g.week4Target) || 0, Number(g.week5Target) || 0,
            ])
            return wt.amounts.slice(0, maxWeek)
          })()
      const totalRow = {
        weeks: weeksMeta.map((wm, i) => {
          const qty = crewsOut.reduce((s, c) => s + c.weeks[i].qty, 0)
          const netto = crewsOut.reduce((s, c) => s + c.weeks[i].netto, 0)
          const target = zoningWeeklyTarget[i] ?? 0
          return { qty, netto, target, acv: acvOf(netto, target) }
        }),
        total: (() => {
          const qty = crewsOut.reduce((s, c) => s + c.total.qty, 0)
          const netto = crewsOut.reduce((s, c) => s + c.total.netto, 0)
          const target = zoningWeeklyTarget.reduce((s, x) => s + x, 0)
          return { qty, netto, target, acv: acvOf(netto, target) }
        })(),
      }

      // ─── Dept list: fixed + ekstra dari data bulan ini (alfabetis) ───
      const extras = new Set<string>()
      for (const c of g.crews) {
        const deptByWeek = deptAgg.get(c.id)
        if (!deptByWeek) continue
        for (const dMap of deptByWeek.values()) {
          for (const d of dMap.keys()) {
            if (!FIXED_SET.has(d)) extras.add(d)
          }
        }
      }
      const deptList = [...FIXED_DEPTS, ...Array.from(extras).sort((a, b) => a.localeCompare(b))]

      // ─── Detail dept per crew per week (nol tetap ditampilkan — format sheet) ───
      const deptDetails = g.crews.map((c) => ({
        crewId: c.id,
        name: c.name,
        weeks: weeksMeta.map((wm) => ({
          week: wm.week,
          rows: deptList.map((dept) => {
            const a = deptAgg.get(c.id)?.get(wm.week)?.get(dept) ?? { qty: 0, netto: 0 }
            return { dept, qty: a.qty, netto: Math.round(a.netto) }
          }),
        })),
      }))

      return {
        groupId: g.id,
        groupName: g.name,
        crewCount,
        monthlyTarget: engineGroup ? engineGroup.monthly : (Number(g.monthlyTarget) || 0),
        crews: crewsOut,
        totalRow,
        deptList,
        deptDetails,
      }
    })

    const isCurrentMonth = year === nowWib.year && monthIdx === nowWib.monthIndex

    return {
      ok: true,
      data: {
        year,
        month: monthIdx + 1,
        monthName: MONTH_NAMES[monthIdx],
        engineActive,
        currentWeek: isCurrentMonth ? weekOfDay(nowWib.day) : null,
        weeks: weeksMeta,
        groups: outGroups,
      },
    }
  } catch (error) {
    console.error('Weekly matrix service error:', error)
    return { ok: false, status: 500, error: 'Terjadi kesalahan saat memuat laporan mingguan' }
  }
}
