import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'
import { applyDerivedGroupTargets, parseDailyPctsJson } from '@/lib/target-service'
import { wibNowParts, daysInMonthOf, weekRange } from '@/lib/target-engine'

// ─── Store Config: Target Bulanan Toko + Distribusi Mingguan & Harian (%) ──
// Singleton — sumber utama seluruh hierarki target.
//
// DISTRIBUSI HARIAN = PER TANGGAL (mode tunggal, menggantikan bobot per
// hari-minggu): body.dailyPcts = array 31 slot (index 0 = tgl 1), % dari
// target bulanan. INVARIANT WAJIB (tidak boleh kurang atau lebih):
//   Σ slot tanggal dalam Week-w PERSIS = weekPcts[w-1] (toleransi 1e-4)
// diverifikasi terhadap kalender bulan berjalan (WIB) — W1=1–7 … W5=29+.

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
            id: config.id,
            monthlyTarget: config.monthlyTarget,
            week1Pct: config.week1Pct,
            week2Pct: config.week2Pct,
            week3Pct: config.week3Pct,
            week4Pct: config.week4Pct,
            week5Pct: config.week5Pct,
            dailyPcts: parseDailyPctsJson(config.dailyPctsJson),
            updatedAt: config.updatedAt,
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
    // Distribusi harian PER TANGGAL — 31 slot (index 0 = tgl 1).
    // Tidak dikirim / tidak valid → semua 0 (UI wajib mengatur sebelum simpan).
    const dailyPcts: number[] = new Array(31).fill(0)
    if (Array.isArray(body.dailyPcts)) {
      for (let i = 0; i < Math.min(31, body.dailyPcts.length); i++) {
        dailyPcts[i] = num(body.dailyPcts[i], NaN)
      }
    }
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
    if (dailyPcts.some(p => !Number.isFinite(p) || p < 0 || p > 100)) {
      return NextResponse.json({ error: 'Persentase harian per tanggal harus angka 0–100' }, { status: 400 })
    }
    const weekSum = weekPcts.reduce((s, p) => s + p, 0)
    if (Math.abs(weekSum - 100) > 0.001) {
      return NextResponse.json(
        { error: `Total distribusi mingguan harus 100% (saat ini: ${Number(weekSum.toFixed(4))}%)` },
        { status: 400 },
      )
    }

    // ── INVARIANT: Σ harian per Week = mingguan (PERSIS, toleransi 1e-4) ──
    // Diverifikasi terhadap kalender bulan berjalan (WIB): W1=1–7 … W5=29+.
    const nowParts = wibNowParts()
    const dim = daysInMonthOf(nowParts.year, nowParts.monthIndex)
    const weekErrors: string[] = []
    for (let w = 1; w <= 5; w++) {
      const [from, to] = weekRange(w, dim)
      const days: number[] = []
      for (let d = from; d <= Math.min(to, dim); d++) days.push(d)
      if (days.length === 0) continue // minggu tanpa tanggal (mis. W5 Feb) → dilewati
      const sum = days.reduce((s, d) => s + dailyPcts[d - 1], 0)
      const target = weekPcts[w - 1]
      if (Math.abs(sum - target) > 0.0001) {
        weekErrors.push(
          `Week ${w} (tgl ${from}–${to}): Σ harian ${Number(sum.toFixed(4))}% ≠ mingguan ${Number(target.toFixed(4))}%`,
        )
      }
    }
    if (weekErrors.length > 0) {
      return NextResponse.json(
        {
          error:
            'Distribusi harian per tanggal harus mengikuti distribusi mingguan (tidak boleh kurang atau lebih) — ' +
          weekErrors.join(' · '),
        },
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
      dailyPctsJson: JSON.stringify(dailyPcts),
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
      description: `Update target toko: Rp${monthlyTarget.toLocaleString('id-ID')} (minggu ${weekPcts.map(p => `${p}%`).join('/')}; harian per tanggal — Σ tiap minggu = mingguan)`,
      details: { monthlyTarget, weekPcts, dailyPcts },
    }).catch(() => {})

    return NextResponse.json(config)
  } catch (error) {
    console.error('Update store-config error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
