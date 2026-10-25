import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import type { ExportQuery } from '@/lib/report-schemas'

// ─────────────────────────────────────────────────────────
// Report Export Service — export laporan yang dipakai BERSAMA
// oleh endpoint admin (/api/export) dan endpoint publik
// (/api/public/report/export).
//
// Dua format export:
//   1. CSV streaming  → salesExportResponse()
//   2. XLSX per bulan → salesMonthlyXlsxResponse()  (format=monthly)
//      "Export Semua Crew (Per Bulan)" di halaman Laporan:
//      satu file Excel, SATU SHEET PER BULAN (berdasarkan tanggal
//      penjualan), kolom nominal = SETTLE (identik dengan halaman
//      Laporan), hanya penjualan yang sudah diklaim crew.
//
// Arsitektur export (anti-OOM):
//   • CSV: data dibaca per batch (BATCH = 1000 baris) via offset
//     pagination, langsung ditulis ke ReadableStream → memori
//     server tetap datar walau hasil export jutaan baris.
//   • XLSX: dibaca per batch lalu dikelompokkan per bulan.
//   • "Export Semua Data" = semua record yang cocok dengan filter,
//     BUKAN hanya baris yang tampil di UI (pagination).
//   • Guard MAX_EXPORT_ROWS agar query tidak bisa berjalan
//     tak terkendali.
//
// SEMANTIK NOMINAL (konsistensi dengan halaman Laporan):
//   • Kolom nominal di CSV maupun XLSX berlabel "Settle" dan
//     selalu berisi field Sale.settle — TIDAK netto/hjp.
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

const CSV_HEADER =
  'No,Tanggal,Zoning/Group,Crew,Employee ID,Shift,ID Penjualan,Kode Extend,Brand,Dept,Modul,Qty,Settle,Status,Program,Pembayaran'

/** Nama bulan Indonesia untuk nama sheet XLSX */
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'] as const

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

/** "2026-10" → "Okt 2026" (nama sheet); fallback aman untuk format aneh */
function monthSheetName(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return 'Lainnya'
  const idx = parseInt(m[2], 10) - 1
  return `${MONTHS_ID[idx] ?? m[2]} ${m[1]}`
}

// ─────────────────────────────────────────────────────────
// Filter resolver — SATU sumber kebenaran untuk scope,
// ownership & where clause. Dipakai bersama oleh builder CSV
// dan builder XLSX supaya kedua export SELALU identik.
// ─────────────────────────────────────────────────────────
interface ResolvedFilter {
  where: Record<string, unknown>
  groupLabel: string
  crewLabel: string
  scopeLabel: string
}

type ResolveResult = { ok: true; data: ResolvedFilter } | { ok: false; error: string; status: number }

async function resolveExportFilter(q: ExportQuery): Promise<ResolveResult> {
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
      return { ok: false, error: 'Pilih zoning/group terlebih dahulu untuk export zoning', status: 400 }
    }
    filterCrewId = ''
    scopeLabel = 'zoning'
  } else if (q.scope === 'crew') {
    if (!filterCrewId) {
      return { ok: false, error: 'Pilih crew terlebih dahulu untuk export crew', status: 400 }
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
      return { ok: false, error: 'Crew tidak ditemukan', status: 404 }
    }
    if (crew.groupId !== filterGroupId) {
      return { ok: false, error: 'Crew tidak berada di zoning/group yang dipilih', status: 400 }
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

  // ─── Label scope untuk nama file ─────────────────────────────
  let groupLabel = ''
  let crewLabel = ''
  if (filterGroupId) {
    const g = await db.group.findUnique({ where: { id: filterGroupId }, select: { name: true } })
    if (!g) return { ok: false, error: 'Zoning/group tidak ditemukan', status: 404 }
    groupLabel = g.name
  }
  if (filterCrewId) {
    const c = await db.crew.findUnique({ where: { id: filterCrewId }, select: { name: true } })
    if (!c) return { ok: false, error: 'Crew tidak ditemukan', status: 404 }
    crewLabel = c.name
  }

  return { ok: true, data: { where, groupLabel, crewLabel, scopeLabel } }
}

/** Nama file standar berbasis scope + periode */
function buildFilename(ext: 'csv' | 'xlsx', scopeLabel: string, groupLabel: string, crewLabel: string, q: ExportQuery, explicitFilename?: string): string {
  if (explicitFilename) return explicitFilename
  const periode = [q.dateFrom || 'awal', q.dateTo || 'kini'].join('_sd_')
  return (
    [
      'laporan',
      scopeLabel,
      groupLabel ? slugify(groupLabel) : '',
      crewLabel ? slugify(crewLabel) : '',
      periode,
    ]
      .filter(Boolean)
      .join('-') + `.${ext}`
  )
}

/**
 * Build a streaming CSV response for the given (already Zod-validated) export query.
 * Seluruh verifikasi ownership (crew ∈ zoning) dilakukan SERVER-SIDE dari DB.
 */
export async function salesExportResponse(q: ExportQuery): Promise<NextResponse> {
  try {
    const resolved = await resolveExportFilter(q)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { where, groupLabel, crewLabel, scopeLabel } = resolved.data

    const totalRows = await db.sale.count({ where })
    if (totalRows === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor' }, { status: 404 })
    }

    const baseName = buildFilename('csv', scopeLabel, groupLabel, crewLabel, q, q.filename || undefined)

    // ─── STREAMING CSV ───────────────────────────────────────────
    const encoder = new TextEncoder()

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          // BOM UTF-8 agar Excel membaca karakter dengan benar
          controller.enqueue(encoder.encode('\uFEFF' + CSV_HEADER + '\n'))

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

// ─────────────────────────────────────────────────────────
// XLSX PER BULAN — "Export Semua Crew (Per Bulan)"
//
// Satu file Excel; setiap BULAN penjualan menjadi satu sheet
// tersendiri ("Okt 2026", "Nov 2026", ...). Semantik data
// identik dengan export CSV Laporan:
//   • hanya penjualan ber-claim (claimedOnly di-handle caller)
//   • kolom nominal berlabel "Settle" berisi Sale.settle
// ─────────────────────────────────────────────────────────

interface MonthlyRow {
  tanggal: string
  createdAt: Date
  id: string
  idPenjualan: string | null
  kodeExtend: string
  brand: string | null
  dept: string | null
  modul: string | null
  qty: number
  settle: number
  statusRetention: string | null
  program: string | null
  pembayaran: string | null
  crewId: string | null
  crewName: string
  employeeId: string
  groupName: string
}

export async function salesMonthlyXlsxResponse(q: ExportQuery): Promise<NextResponse> {
  try {
    const resolved = await resolveExportFilter(q)
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    }
    const { where, groupLabel, crewLabel, scopeLabel } = resolved.data

    const totalRows = await db.sale.count({ where })
    if (totalRows === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor' }, { status: 404 })
    }

    // ─── Baca per batch → kelompokkan per bulan (yyyy-mm) ────────
    const months = new Map<string, MonthlyRow[]>()
    let fetched = 0
    let skip = 0
    let truncated = false

    while (true) {
      const sales = await db.sale.findMany({
        where,
        orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: BATCH,
        select: {
          id: true,
          createdAt: true,
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

      for (const s of sales) {
        const key = /^\d{4}-\d{2}/.test(s.tanggal) ? s.tanggal.slice(0, 7) : 'lain'
        let bucket = months.get(key)
        if (!bucket) {
          bucket = []
          months.set(key, bucket)
        }
        bucket.push({
          tanggal: s.tanggal,
          createdAt: s.createdAt,
          id: s.id,
          idPenjualan: s.idPenjualan,
          kodeExtend: s.kodeExtend,
          brand: s.brand,
          dept: s.dept,
          modul: s.modul,
          qty: s.qty,
          settle: s.settle,
          statusRetention: s.statusRetention,
          program: s.program,
          pembayaran: s.pembayaran,
          crewId: s.crewId,
          crewName: s.crew?.name || '',
          employeeId: s.crew?.employeeId || '',
          groupName: s.crew?.group?.name || '',
        })
      }

      fetched += sales.length
      skip += BATCH
      if (fetched >= MAX_EXPORT_ROWS) {
        truncated = true
        break
      }
      if (sales.length < BATCH) break
    }

    // ─── Shift map global (roster CrewShift) untuk semua baris ───
    const shiftMap = new Map<string, string>()
    const allCrewIds = new Set<string>()
    const allDates = new Set<string>()
    for (const rows of months.values()) {
      for (const r of rows) {
        if (r.crewId) {
          allCrewIds.add(r.crewId)
          allDates.add(r.tanggal)
        }
      }
    }
    if (allCrewIds.size > 0 && allDates.size > 0) {
      const crewIdArr = [...allCrewIds]
      const dateArr = [...allDates]
      const CHUNK = 300
      for (let i = 0; i < crewIdArr.length; i += CHUNK) {
        for (let j = 0; j < dateArr.length; j += CHUNK * 2) {
          const shifts = await db.crewShift.findMany({
            where: {
              crewId: { in: crewIdArr.slice(i, i + CHUNK) },
              tanggal: { in: dateArr.slice(j, j + CHUNK * 2) },
            },
            select: { crewId: true, tanggal: true, shiftCode: true },
          })
          for (const sh of shifts) {
            shiftMap.set(`${sh.crewId}|${sh.tanggal}`, sh.shiftCode)
          }
        }
      }
    }

    // ─── Build workbook: 1 sheet per bulan (urut kronologis) ─────
    const XLSX_HEADER = [
      'No', 'Tanggal', 'Zoning/Group', 'Crew', 'Employee ID', 'Shift',
      'ID Penjualan', 'Kode Extend', 'Brand', 'Dept', 'Modul', 'Qty',
      'Settle', 'Status', 'Program', 'Pembayaran',
    ]
    const COL_WIDTHS = [5, 12, 14, 20, 12, 7, 16, 14, 10, 16, 10, 6, 13, 12, 14, 13]

    const wb = XLSX.utils.book_new()
    const monthKeys = [...months.keys()].sort()
    let sheetCount = 0

    for (const key of monthKeys) {
      const rows = months.get(key) as MonthlyRow[]
      const aoa: (string | number)[][] = [XLSX_HEADER]
      let monthQty = 0
      let monthSettle = 0

      rows.forEach((r, i) => {
        monthQty += r.qty
        monthSettle += r.settle
        aoa.push([
          i + 1,
          r.tanggal,
          r.groupName,
          r.crewName,
          r.employeeId,
          r.crewId ? shiftMap.get(`${r.crewId}|${r.tanggal}`) || '' : '',
          r.idPenjualan || '',
          r.kodeExtend,
          r.brand || '',
          r.dept || '',
          r.modul || '',
          r.qty,
          r.settle,
          r.statusRetention || '',
          r.program || '',
          r.pembayaran || '',
        ])
      })

      // Baris TOTAL per sheet
      aoa.push(['', '', '', `TOTAL ${monthSheetName(key)}`, '', '', '', '', '', '', '', monthQty, monthSettle, '', '', ''])

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = COL_WIDTHS.map((wch) => ({ wch }))
      // Format ribuan untuk kolom Settle (M) + baris total
      for (let R = 1; R < aoa.length; R++) {
        const settleCell = ws[XLSX.utils.encode_cell({ r: R, c: 12 })]
        if (settleCell && typeof settleCell.v === 'number') settleCell.z = '#,##0'
        const qtyCell = ws[XLSX.utils.encode_cell({ r: R, c: 11 })]
        if (qtyCell && typeof qtyCell.v === 'number') qtyCell.z = '#,##0'
      }
      // AutoFilter di baris header
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: XLSX_HEADER.length - 1 } }) }

      XLSX.utils.book_append_sheet(wb, ws, monthSheetName(key))
      sheetCount++
    }

    // Sheet catatan bila data terpotong
    if (truncated) {
      const note = XLSX.utils.aoa_to_sheet([
        ['CATATAN'],
        [`Export dihentikan pada ${MAX_EXPORT_ROWS} baris (batas aman server).`],
        ['Persempit filter tanggal untuk mendapatkan data lengkap.'],
      ])
      note['!cols'] = [{ wch: 80 }]
      XLSX.utils.book_append_sheet(wb, note, 'Catatan')
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    const filename = buildFilename('xlsx', scopeLabel, groupLabel, crewLabel, q)

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Total-Rows': String(totalRows),
        'X-Sheet-Count': String(sheetCount),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Monthly XLSX export error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor data' }, { status: 500 })
  }
}
