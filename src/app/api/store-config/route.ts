import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'
import { applyDerivedGroupTargets } from '@/lib/target-service'

// ─── Store Config: Target Bulanan Toko + Distribusi Mingguan (%) ───────
// Singleton — sumber utama seluruh hierarki target.

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const [config, groups, shiftTypes] = await Promise.all([
      db.storeConfig.findFirst(),
      db.group.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, logo: true, allocationPct: true, monthlyTarget: true, _count: { select: { crews: true } } },
      }),
      db.shiftType.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
    ])

    return NextResponse.json({
      config: config
        ? {
            ...config,
            dayPcts: [
              config.dayPctMon, config.dayPctTue, config.dayPctWed, config.dayPctThu,
              config.dayPctFri, config.dayPctSat, config.dayPctSun,
            ],
          }
        : null,
      allocations: groups.map(g => ({
        id: g.id, name: g.name, logo: g.logo,
        allocationPct: g.allocationPct,
        derivedMonthlyTarget: g.monthlyTarget,
        crewCount: g._count.crews,
      })),
      allocationSum: groups.reduce((s, g) => s + (Number(g.allocationPct) || 0), 0),
      shiftTypes,
    })
  } catch (error) {
    console.error('Get store-config error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const monthlyTarget = num(body.monthlyTarget, -1)
    const weekPcts = [body.week1Pct, body.week2Pct, body.week3Pct, body.week4Pct, body.week5Pct].map(v => num(v, NaN))
    // Bobot harian Senin..Minggu — bobot RELATIF, tidak wajib Σ=100.
    // Kalau tidak dikirim → pakai default (3,3,3,3,3,4.5,4.5).
    const dayPcts: number[] = Array.isArray(body.dayPcts) && body.dayPcts.length === 7
      ? body.dayPcts.map((v: unknown) => num(v, NaN))
      : [3, 3, 3, 3, 3, 4.5, 4.5]
    const allocations: Array<{ groupId: string; allocationPct: number }> | undefined = Array.isArray(body.allocations)
      ? body.allocations.map((a: { groupId?: unknown; allocationPct?: unknown }) => ({
          groupId: String(a.groupId ?? ''),
          allocationPct: num(a.allocationPct, NaN),
        }))
      : undefined

    // ── Validasi ──
    if (monthlyTarget < 0) {
      return NextResponse.json({ error: 'Target bulanan toko harus berupa angka ≥ 0' }, { status: 400 })
    }
    if (weekPcts.some(p => !Number.isFinite(p) || p < 0 || p > 100)) {
      return NextResponse.json({ error: 'Persentase mingguan harus angka 0–100' }, { status: 400 })
    }
    if (dayPcts.some(p => !Number.isFinite(p) || p < 0 || p > 100)) {
      return NextResponse.json({ error: 'Persentase harian (Senin–Minggu) harus angka 0–100' }, { status: 400 })
    }
    const weekSum = weekPcts.reduce((s, p) => s + p, 0)
    if (Math.abs(weekSum - 100) > 0.001) {
      return NextResponse.json(
        { error: `Total distribusi mingguan harus 100% (saat ini: ${Number(weekSum.toFixed(4))}%)` },
        { status: 400 },
      )
    }
    if (allocations) {
      if (allocations.some(a => !a.groupId || !Number.isFinite(a.allocationPct) || a.allocationPct < 0 || a.allocationPct > 100)) {
        return NextResponse.json({ error: 'Alokasi zoning harus angka 0–100' }, { status: 400 })
      }
      const allocSum = allocations.reduce((s, a) => s + a.allocationPct, 0)
      if (Math.abs(allocSum - 100) > 0.001) {
        return NextResponse.json(
          { error: `Total alokasi zoning harus 100% (saat ini: ${Number(allocSum.toFixed(4))}%)` },
          { status: 400 },
        )
      }
      const ids = allocations.map(a => a.groupId)
      const found = await db.group.findMany({ where: { id: { in: ids } }, select: { id: true } })
      if (found.length !== new Set(ids).size) {
        return NextResponse.json({ error: 'Ada group/zoning yang tidak ditemukan' }, { status: 400 })
      }
    }

    // ── Simpan (singleton) ──
    const existing = await db.storeConfig.findFirst()
    const data = {
      monthlyTarget,
      week1Pct: weekPcts[0],
      week2Pct: weekPcts[1],
      week3Pct: weekPcts[2],
      week4Pct: weekPcts[3],
      week5Pct: weekPcts[4],
      dayPctMon: dayPcts[0],
      dayPctTue: dayPcts[1],
      dayPctWed: dayPcts[2],
      dayPctThu: dayPcts[3],
      dayPctFri: dayPcts[4],
      dayPctSat: dayPcts[5],
      dayPctSun: dayPcts[6],
    }
    const config = existing
      ? await db.storeConfig.update({ where: { id: existing.id }, data })
      : await db.storeConfig.create({ data })

    // ── Write-through alokasi + target turunan ke Group (bukan snapshot —
    //    selalu ditimpa saat config berubah; engine tetap sumber realtime) ──
    if (allocations) {
      await applyDerivedGroupTargets({
        storeMonthlyTarget: monthlyTarget,
        allocationPcts: allocations,
        weekPcts: [weekPcts[0], weekPcts[1], weekPcts[2], weekPcts[3], weekPcts[4]],
      })
    }

    logActivity('UPDATE_STORE_CONFIG', {
      description: `Update target toko: Rp${monthlyTarget.toLocaleString('id-ID')} (minggu ${weekPcts.map(p => `${p}%`).join('/')}; hari ${dayPcts.join('/')})`,
      details: { monthlyTarget, weekPcts, dayPcts },
    }).catch(() => {})

    return NextResponse.json(config)
  } catch (error) {
    console.error('Update store-config error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
