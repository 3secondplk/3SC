import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { ExportQuery } from '@/lib/report-schemas'

// ─────────────────────────────────────────────────────────
// Report Export Service — streaming CSV export yang dipakai
// BERSAMA oleh endpoint admin (/api/export) dan endpoint publik
// (/api/public/report/export).
//
// Arsitektur export (anti-OOM):
//   • Data TIDAK dimuat sekaligus ke memori. Dibaca per batch
//     (BATCH = 1000 baris) via offset pagination, langsung
//     ditulis ke ReadableStream → memori server tetap datar
//     walau hasil export jutaan baris.
//   • "Export Semua Data" = semua record yang cocok dengan filter,
//     BUKAN hanya baris yang tampil di UI (pagination).
//   • Guard tambahan MAX_EXPORT_ROWS agar query tidak bisa berjalan
//     tak terkendali; export tetap streaming, tidak pernah build
//     satu string CSV raksasa (penyebab OOM versi lama).
//
// SCOPE (dropdown Export Data di Report):
//   scope=zoning → wajib groupId → export 1 zoning (semua crew-nya)
//   scope=crew   → wajib crewId  → export 1 crew saja
//   scope=all    → semua zoning & crew (crewId/groupId diabaikan)
//   (scope kosong = mode legacy untuk caller lama: pakai
//    crewId/groupId apa adanya — kompatibel ExportTab existing)
//
// claimedOnly=1 → semantik Report (hanya penjualan yang sudah
// diklaim crew). Endpoint publik MEMAKSA claimedOnly=1 agar data
// yang di-export selalu konsisten dengan halaman Laporan publik.
// ─────────────────────────────────────────────────────────

const BATCH = 1000
const MAX_EXPORT_ROWS = 500_000

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'data'
  )
}

/**
 * Build a streaming CSV response for the given (already Zod-validated) export query.
 * Seluruh verifikasi ownership (crew ∈ zoning) dilakukan SERVER-SIDE dari DB.
 */
export async function salesExportResponse(q: ExportQuery): Promise<NextResponse> {
  try {
    const crewIdRaw = q.crewId
    const groupIdRaw = q.groupId

    // ─── Resolusi scope → filter efektif ─────────────────────────
    let filterCrewId = crewIdRaw
    let filterGroupId = groupIdRaw
    let scopeLabel = 'semua'

    if (q.scope === 'all') {
      filterCrewId = ''
      filterGroupId = ''
    } else if (q.scope === 'zoning') {
      if (!filterGroupId) {
        return NextResponse.json(
          { error: 'Pilih zoning/group terlebih dahulu untuk export zoning' },
          { status: 400 },
        )
      }
      filterCrewId = ''
      scopeLabel = 'zoning'
    } else if (q.scope === 'crew') {
      if (!filterCrewId) {
        return NextResponse.json(
          { error: 'Pilih crew terlebih dahulu untuk export crew' },
          { status: 400 },
        )
      }
      scopeLabel = 'crew'
    }
    // scope kosong → legacy: pakai crewId/groupId apa adanya

    // ─── Ownership check via DB (client tidak dipercaya) ─────────
    if (filterCrewId && filterGroupId) {
      const crew = await db.crew.findUnique({
        where: { id: filterCrewId },
        select: { groupId: true },
      })
      if (!crew) {
        return NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 })
      }
      if (crew.groupId !== filterGroupId) {
        return NextResponse.json(
          { error: 'Crew tidak berada di zoning/group yang dipilih' },
          { status: 400 },
        )
      }
    }

    // Resolusi anggota zoning server-side
    let groupCrewIds: string[] | null = null
    if (filterGroupId && !filterCrewId) {
      const members = await db.crew.findMany({
        where: { groupId: filterGroupId },
        select: { id: true },
      })
      groupCrewIds = members.map((c) => c.id)
    }

    // ─── Where clause ────────────────────────────────────────────
    const where: Record<string, unknown> = {}
    if (filterCrewId) {
      where.crewId = filterCrewId
    } else if (groupCrewIds) {
      where.crewId = { in: groupCrewIds }
    } else if (q.claimedOnly === '1') {
      // Semantik Report: hanya penjualan ber-claim crew
      where.crewId = { not: null }
    }

    if (q.dateFrom || q.dateTo) {
      const tanggalFilter: Record<string, unknown> = {}
      if (q.dateFrom) tanggalFilter.gte = q.dateFrom
      if (q.dateTo) {
        // use lt:nextDay to handle timestamps like "2026-05-03 09:00"
        const [y, m, d] = q.dateTo.split('-').map(Number)
        const nextDay = new Date(y, m - 1, d + 1)
        const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`
        tanggalFilter.lt = nextDayStr
      }
      where.tanggal = tanggalFilter
    }

    const totalRows = await db.sale.count({ where })
    if (totalRows === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor' }, { status: 404 })
    }

    // ─── Nama file dari scope + periode ──────────────────────────
    let groupLabel = ''
    let crewLabel = ''
    if (filterGroupId) {
      const g = await db.group.findUnique({ where: { id: filterGroupId }, select: { name: true } })
      if (!g) return NextResponse.json({ error: 'Zoning/group tidak ditemukan' }, { status: 404 })
      groupLabel = g.name
    }
    if (filterCrewId) {
      const c = await db.crew.findUnique({ where: { id: filterCrewId }, select: { name: true } })
      if (!c) return NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 })
      crewLabel = c.name
    }

    const periode = [q.dateFrom || 'awal', q.dateTo || 'kini'].join('_sd_')
    const baseName =
      q.filename ||
      [
        'laporan',
        scopeLabel,
        groupLabel ? slugify(groupLabel) : '',
        crewLabel ? slugify(crewLabel) : '',
        periode,
      ]
        .filter(Boolean)
        .join('-') + '.csv'

    // ─── STREAMING CSV ───────────────────────────────────────────
    const header =
      'No,Tanggal,Zoning/Group,Crew,Employee ID,Shift,ID Penjualan,Kode Extend,Brand,Dept,Modul,Qty,Nominal,Status,Program,Pembayaran'
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // BOM UTF-8 agar Excel membaca karakter dengan benar
          controller.enqueue(encoder.encode('\uFEFF' + header + '\n'))

          let skip = 0
          let no = 0
          let truncated = false

          while (true) {
            const sales = await db.sale.findMany({
              where,
              orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              skip,
              take: BATCH,
              select: {
                id: true,
                tanggal: true,
                idPenjualan: true,
                kodeExtend: true,
                brand: true,
                dept: true,
                modul: true,
                qty: true,
                settle: true,
                statusRetention: true,
                program: true,
                pembayaran: true,
                crewId: true,
                crew: {
                  select: {
                    name: true,
                    employeeId: true,
                    group: { select: { name: true } },
                  },
                },
              },
            })

            if (sales.length === 0) break

            // ─── Shift map untuk batch ini (roster CrewShift existing) ───
            const batchCrewIds = [...new Set(sales.filter((s) => s.crewId).map((s) => s.crewId as string))]
            const batchDates = [...new Set(sales.filter((s) => s.crewId).map((s) => s.tanggal))]
            const shiftMap = new Map<string, string>()
            if (batchCrewIds.length > 0 && batchDates.length > 0) {
              const shifts = await db.crewShift.findMany({
                where: { crewId: { in: batchCrewIds }, tanggal: { in: batchDates } },
                select: { crewId: true, tanggal: true, shiftCode: true },
              })
              for (const sh of shifts) {
                shiftMap.set(`${sh.crewId}|${sh.tanggal}`, sh.shiftCode)
              }
            }

            let chunk = ''
            for (const s of sales) {
              no++
              chunk += [
                no,
                escapeCsv(s.tanggal),
                escapeCsv(s.crew?.group?.name || ''),
                escapeCsv(s.crew?.name || ''),
                escapeCsv(s.crew?.employeeId || ''),
                escapeCsv(s.crewId ? shiftMap.get(`${s.crewId}|${s.tanggal}`) || '' : ''),
                escapeCsv(s.idPenjualan || ''),
                escapeCsv(s.kodeExtend),
                escapeCsv(s.brand || ''),
                escapeCsv(s.dept || ''),
                escapeCsv(s.modul || ''),
                s.qty,
                s.settle,
                escapeCsv(s.statusRetention || ''),
                escapeCsv(s.program || ''),
                escapeCsv(s.pembayaran || ''),
              ].join(',') + '\n'
            }

            controller.enqueue(encoder.encode(chunk))
            skip += BATCH

            if (no >= MAX_EXPORT_ROWS) {
              truncated = true
              break
            }
            if (sales.length < BATCH) break
          }

          if (truncated) {
            controller.enqueue(
              encoder.encode(
                `# Peringatan: export dihentikan pada ${MAX_EXPORT_ROWS} baris (batas aman server). Persempit filter tanggal untuk data lengkap.\n`,
              ),
            )
          }

          controller.close()
        } catch (err) {
          console.error('Export stream error:', err)
          controller.error(err)
        }
      },
    })

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseName}"`,
        'X-Total-Rows': String(totalRows),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Export sales error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor data' }, { status: 500 })
  }
}
