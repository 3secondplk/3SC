// ─── CMS — Target Breakdown Service (server-side loader) ───────────────
//
// Menjembatani database ↔ target-engine:
//   StoreConfig (singleton) + ShiftType + Group(+Crew) + CrewShift (roster)
//   → computeMonthTargets() → breakdown realtime siap pakai.
//
// ENGINE AKTIF jika: StoreConfig ada & monthlyTarget > 0.
// Jika tidak aktif → semua route jatuh ke perilaku legacy (equal split).
// ────────────────────────────────────────────────────────────────────────

import { db } from '@/lib/db'
import {
  computeMonthTargets,
  buildWeightMap,
  type MonthTargetResult,
} from '@/lib/target-engine'

export interface LoadedTargetContext {
  /** true jika StoreConfig terisi → hasil dari engine baru */
  engineActive: boolean
  config: {
    monthlyTarget: number
    week1Pct: number; week2Pct: number; week3Pct: number; week4Pct: number; week5Pct: number
    dayPcts: number[] // [Sen,Sel,Rab,Kam,Jum,Sab,Min]
  } | null
  shiftTypes: Array<{ id: string; code: string; label: string; weight: number; sortOrder: number; isActive: boolean }>
  month: MonthTargetResult | null
  /** Σ allocationPct semua group (untuk indikator UI) */
  allocationSum: number
}

/**
 * Muat seluruh konteks target untuk (year, monthIndex 0-based).
 * Aman dipanggil walau belum ada konfigurasi → engineActive=false.
 */
export async function loadMonthTargets(year: number, monthIndex: number): Promise<LoadedTargetContext> {
  const [config, shiftTypes, groups] = await Promise.all([
    db.storeConfig.findFirst(),
    db.shiftType.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
    db.group.findMany({
      orderBy: { createdAt: 'asc' },
      include: { crews: { orderBy: { createdAt: 'asc' }, select: { id: true } } },
    }),
  ])

  const allocationSum = groups.reduce((s, g) => s + (Number(g.allocationPct) || 0), 0)

  const engineActive = !!config && (config.monthlyTarget ?? 0) > 0
  if (!engineActive || !config) {
    return { engineActive: false, config: null, shiftTypes, month: null, allocationSum }
  }

  const dayPcts = [
    config.dayPctMon, config.dayPctTue, config.dayPctWed, config.dayPctThu,
    config.dayPctFri, config.dayPctSat, config.dayPctSun,
  ]

  const prefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  const shifts = await db.crewShift.findMany({
    where: { tanggal: { gte: `${prefix}-01`, lte: `${prefix}-31` } },
    select: { crewId: true, tanggal: true, shiftCode: true },
  })
  const shiftByCrewDate = new Map<string, string>()
  for (const s of shifts) shiftByCrewDate.set(`${s.crewId}|${s.tanggal}`, s.shiftCode)

  const activeTypes = shiftTypes.filter(st => st.isActive)
  const weightByCode = buildWeightMap(activeTypes)

  const month = computeMonthTargets({
    year,
    monthIndex,
    storeMonthlyTarget: config.monthlyTarget,
    weekPcts: [config.week1Pct, config.week2Pct, config.week3Pct, config.week4Pct, config.week5Pct],
    dayPcts,
    groups: groups.map(g => ({
      id: g.id,
      allocationPct: Number(g.allocationPct) || 0,
      crewIds: g.crews.map(c => c.id),
    })),
    shiftByCrewDate,
    weightByCode,
  })

  return {
    engineActive,
    config: {
      monthlyTarget: config.monthlyTarget,
      week1Pct: config.week1Pct,
      week2Pct: config.week2Pct,
      week3Pct: config.week3Pct,
      week4Pct: config.week4Pct,
      week5Pct: config.week5Pct,
      dayPcts,
    },
    shiftTypes,
    month,
    allocationSum,
  }
}

/**
 * Write-through: simpan StoreConfig + allocation → tulis target turunan
 * ke Group (monthlyTarget balanced + week pct) agar fitur legacy tetap
 * tampil konsisten. NILAI INI BUKAN SNAPSHOT — selalu ditimpa saat config
 * berubah, dan engine tetap satu-satunya sumber kebenaran realtime.
 */
export async function applyDerivedGroupTargets(params: {
  storeMonthlyTarget: number
  allocationPcts: Array<{ groupId: string; allocationPct: number }>
  weekPcts: [number, number, number, number, number]
}): Promise<void> {
  const { allocateByWeights } = await import('@/lib/target-engine')
  const groups = await db.group.findMany({ select: { id: true }, orderBy: { createdAt: 'asc' } })
  const pctById = new Map(params.allocationPcts.map(a => [a.groupId, a.allocationPct]))
  const weights = groups.map(g => Math.max(0, Number(pctById.get(g.id) ?? 0)))
  const amounts = allocateByWeights(params.storeMonthlyTarget, weights)

  await db.$transaction(
    groups.map((g, i) =>
      db.group.update({
        where: { id: g.id },
        data: {
          allocationPct: weights[i],
          monthlyTarget: amounts[i],
          week1Target: params.weekPcts[0],
          week2Target: params.weekPcts[1],
          week3Target: params.weekPcts[2],
          week4Target: params.weekPcts[3],
          week5Target: params.weekPcts[4],
        },
      }),
    ),
  )
}
