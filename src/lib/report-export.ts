import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import type { ExportQuery } from '@/lib/report-schemas'
import { getWeeklyMatrixData, MONTH_NAMES } from '@/lib/report-service'
import { isoDate, wibNowParts } from '@/lib/target-engine'

// ─────────────────────────────────────────────────────────
// Report Export Service — dipakai BERSAMA oleh endpoint admin
// (/api/export) dan endpoint publik (/api/public/report/export).
//
// Dua bentuk output:
//   1. salesExportResponse()     — CSV streaming (legacy, dipakai
//      ExportTab & tombol export lama). Anti-OOM: dibaca per batch
//      (BATCH=1000) via offset pagination langsung ke ReadableStream.
//   2. reportWorkbookResponse()  — workbook Excel (.xlsx) MULTI-SHEET
//      untuk halaman Laporan (fitur pembaruan export):
//        • Sheet "All Data"            — semua baris laporan penjualan
//          (kolom sama dengan CSV legacy, mengikuti filter/scope).
//        • Sheet "Laporan Zoning-Grup" — Laporan Mingguan per Zoning:
//          per crew × Week 1–5 (Qty|Netto|Target|ACV) + TOTAL + baris
//          TOTAL ZONING (target dari engine, identik dgn halaman).
//        • Sheet "Laporan Per Dept"    — Detail Dept per Crew per
//          Minggu (Qty & Netto per dept, hanya baris bernilai + TOTAL
//          per crew per minggu).
//      month/year workbook = param eksplisit → bulan dateFrom → bulan
//      WIB berjalan. Bila request tanpa rentang tanggal, sheet All Data
//      di-scope ke bulan workbook tsb (konsisten dgn konteks halaman
//      Laporan yang berbasis bulan).
//
// SCOPE (dropdown/button export):
//   scope=zoning → wajib groupId → export 1 zoning (semua crew-nya)
//   scope=crew   → wajib crewId  → export 1 crew saja
//   scope=all    → semua zoning & crew (crewId/groupId diabaikan)
//   (scope kosong = mode legacy: pakai crewId/groupId apa adanya)
//
// claimedOnly=1 → semantik Report (hanya penjualan yang sudah diklaim
// crew). Endpoint publik MEMAKSA claimedOnly=1 agar data yang
// di-export selalu konsisten dengan halaman Laporan publik.
// ─────────────────────────────────────────────────────────

const BATCH = 1000
const MAX_EXPORT_ROWS = 500_000
// Workbook XLSX dibangun di memori (SheetJS) — batas baris lebih ketat
// daripada CSV streaming agar aman di lingkungan serverless (RAM terbatas).
const XLSX_MAX_ROWS = 100_000

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const ALL_DATA_HEADER = [
  'No', 'Tanggal', 'Zoning/Group', 'Crew', 'Employee ID', 'Shift',
  'ID Penjualan', 'Kode Extend', 'Brand', 'Dept', 'Modul', 'Qty',
  'Nominal', 'Status', 'Program', 'Pembayaran',
]

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

/** Format angka gaya Indonesia (pemisah ribuan titik) — server-safe tanpa Intl */
function fmtId(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// ─────────────────────────────────────────────────────────
// Resolusi scope → filter efektif (dipakai CSV & XLSX).
// Seluruh verifikasi ownership (crew ∈ zoning) dilakukan SERVER-SIDE.
// ─────────────────────────────────────────────────────────
type ResolvedFilter =
  | {
      ok: true
      where: Record<string, unknown>
      scopeLabel: string
      groupLabel: string
      crewLabel: string
      filterGroupId: string
      filterCrewId: string
    }
  | { ok: false; response: NextResponse }

async function resolveExportFilter(q: ExportQuery): Promise<ResolvedFilter> {
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
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Pilih zoning/group terlebih dahulu untuk export zoning' },
          { status: 400 },
        ),
      }
    }
    filterCrewId = ''
    scopeLabel = 'zoning'
  } else if (q.scope === 'crew') {
    if (!filterCrewId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Pilih crew terlebih dahulu untuk export crew' },
          { status: 400 },
        ),
      }
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
      return {
        ok: false,
        response: NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 }),
      }
    }
    if (crew.groupId !== filterGroupId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Crew tidak berada di zoning/group yang dipilih' },
          { status: 400 },
        ),
      }
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

  // ─── Label scope utk nama file ───────────────────────────────
  let groupLabel = ''
  let crewLabel = ''
  if (filterGroupId) {
    const g = await db.group.findUnique({ where: { id: filterGroupId }, select: { name: true } })
    if (!g) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Zoning/group tidak ditemukan' }, { status: 404 }),
      }
    }
    groupLabel = g.name
  }
  if (filterCrewId) {
    const c = await db.crew.findUnique({ where: { id: filterCrewId }, select: { name: true } })
    if (!c) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 }),
      }
    }
    crewLabel = c.name
  }

  return {
    ok: true,
    where,
    scopeLabel,
    groupLabel,
    crewLabel,
    filterGroupId,
    filterCrewId,
  }
}

// ─── Selectclause baris penjualan (dipakai CSV & XLSX) ───────
const SALE_SELECT = {
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
} as const

type SaleRow = {
  id: string
  tanggal: string
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
  crew: {
    name: string
    employeeId: string
    group: { name: string } | null
  } | null
}

/** Ambil shift code roster CrewShift utk kumpulan (crewId, tanggal) */
async function loadShiftMap(sales: SaleRow[]): Promise<Map<string, string>> {
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
  return shiftMap
}

/** Ubah 1 baris Sale → array kolom sheet All Data (urutan = ALL_DATA_HEADER) */
function saleToRow(no: number, s: SaleRow, shiftMap: Map<string, string>): (string | number)[] {
  return [
    no,
    s.tanggal,
    s.crew?.group?.name || '',
    s.crew?.name || '',
    s.crew?.employeeId || '',
    s.crewId ? shiftMap.get(`${s.crewId}|${s.tanggal}`) || '' : '',
    s.idPenjualan || '',
    s.kodeExtend,
    s.brand || '',
    s.dept || '',
    s.modul || '',
    s.qty,
    s.settle,
    s.statusRetention || '',
    s.program || '',
    s.pembayaran || '',
  ]
}

/**
 * Build a streaming CSV response for the given (already Zod-validated) export query.
 * Seluruh verifikasi ownership (crew ∈ zoning) dilakukan SERVER-SIDE dari DB.
 */
export async function salesExportResponse(q: ExportQuery): Promise<NextResponse> {
  try {
    const f = await resolveExportFilter(q)
    if (!f.ok) return f.response
    const { where } = f

    const totalRows = await db.sale.count({ where })
    if (totalRows === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor' }, { status: 404 })
    }

    const periode = [q.dateFrom || 'awal', q.dateTo || 'kini'].join('_sd_')
    const baseName =
      q.filename ||
      [
        'laporan',
        f.scopeLabel,
        f.groupLabel ? slugify(f.groupLabel) : '',
        f.crewLabel ? slugify(f.crewLabel) : '',
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
            const sales = (await db.sale.findMany({
              where,
              orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
              skip,
              take: BATCH,
              select: SALE_SELECT,
            })) as unknown as SaleRow[]

            if (sales.length === 0) break

            const shiftMap = await loadShiftMap(sales)

            let chunk = ''
            for (const s of sales) {
              no++
              chunk += saleToRow(no, s, shiftMap).map((v, i) => (i === 0 || i === 11 || i === 12 ? v : escapeCsv(String(v)))).join(',') + '\n'
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
// WORKBOOK XLSX MULTI-SHEET (fitur pembaruan export laporan)
// ─────────────────────────────────────────────────────────

// Bentuk payload weekly-matrix yang dipakai builder sheet 2 & 3
interface WbWeekCell { qty: number; netto: number; target: number; acv: number }
interface WbMatrixPayload {
  year: number
  month: number
  monthName: string
  weeks: Array<{ week: number; dateFrom: string; dateTo: string; label: string; days: number }>
  groups: Array<{
    groupId: string
    groupName: string
    monthlyTarget: number
    crews: Array<{
      crewId: string
      name: string
      employeeId: string
      weeks: WbWeekCell[]
      total: WbWeekCell
    }>
    totalRow: { weeks: WbWeekCell[]; total: WbWeekCell }
    deptList: string[]
    deptDetails: Array<{
      crewId: string
      name: string
      weeks: Array<{ week: number; rows: Array<{ dept: string; qty: number; netto: number }> }>
    }>
  }>
}

/**
 * Build workbook Excel multi-sheet untuk Laporan:
 *   Sheet 1 "All Data"            — semua laporan penjualan (filter scope)
 *   Sheet 2 "Laporan Zoning-Grup" — Laporan Mingguan per Zoning (matrix ACV)
 *   Sheet 3 "Laporan Per Dept"    — Detail Dept per Crew per Minggu
 */
export async function reportWorkbookResponse(q: ExportQuery): Promise<NextResponse> {
  try {
    const f = await resolveExportFilter(q)
    if (!f.ok) return f.response
    const where: Record<string, unknown> = { ...f.where }

    // ─── Resolusi bulan workbook ─────────────────────────────────
    // prioritas: param month/year → bulan dateFrom → bulan WIB berjalan
    const nowWib = wibNowParts()
    const fromMonth = q.dateFrom ? Number(q.dateFrom.slice(5, 7)) : NaN
    const fromYear = q.dateFrom ? Number(q.dateFrom.slice(0, 4)) : NaN
    let month = q.month ?? (Number.isInteger(fromMonth) ? fromMonth : nowWib.monthIndex + 1)
    let year = q.year ?? (Number.isInteger(fromYear) ? fromYear : nowWib.year)
    if (!(month >= 1 && month <= 12)) month = nowWib.monthIndex + 1
    if (!(year >= 2000 && year <= 2100)) year = nowWib.year

    // Request tanpa rentang tanggal → sheet All Data di-scope ke bulan workbook
    // (konsisten dgn konteks halaman Laporan yang berbasis bulan & matrix).
    const explicitDates = !!(q.dateFrom || q.dateTo)
    if (!explicitDates) {
      const first = isoDate(year, month - 1, 1)
      const nextFirst = month === 12 ? isoDate(year + 1, 0, 1) : isoDate(year, month, 1)
      where.tanggal = { gte: first, lt: nextFirst }
    }

    // ─── Data sheet 1 (All Data) — batched, capped ───────────────
    const totalRows = await db.sale.count({ where })
    const rows: (string | number)[][] = []
    let skip = 0
    let no = 0
    let truncated = false
    while (true) {
      const sales = (await db.sale.findMany({
        where,
        orderBy: [{ tanggal: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip,
        take: BATCH,
        select: SALE_SELECT,
      })) as unknown as SaleRow[]
      if (sales.length === 0) break
      const shiftMap = await loadShiftMap(sales)
      for (const s of sales) {
        no++
        if (no > XLSX_MAX_ROWS) { truncated = true; break }
        rows.push(saleToRow(no, s, shiftMap))
      }
      if (truncated || sales.length < BATCH) break
      skip += BATCH
    }

    // ─── Data sheet 2 & 3 (matrix mingguan dari service bersama) ─
    // Scope matrix = zoning filter; bila hanya crew yg difilter, pakai
    // zoning dari crew tsb (laporan mingguan memang level zoning).
    let matrixGroupId = f.filterGroupId
    if (!matrixGroupId && f.filterCrewId) {
      const c = await db.crew.findUnique({
        where: { id: f.filterCrewId },
        select: { groupId: true },
      })
      matrixGroupId = c?.groupId || ''
    }
    const matrix = await getWeeklyMatrixData({ groupId: matrixGroupId, month, year })
    const payload = (matrix.ok ? matrix.data : null) as WbMatrixPayload | null
    const mGroups = payload?.groups ?? []

    // Tidak ada apa-apa sama sekali → 404 seperti perilaku lama
    if (totalRows === 0 && mGroups.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data untuk diekspor' }, { status: 404 })
    }

    const monthName = MONTH_NAMES[month - 1]
    const periodeLabel = explicitDates
      ? [q.dateFrom || 'awal', q.dateTo || 'kini'].join('_sd_')
      : `${year}-${String(month).padStart(2, '0')}`

    // ─── SHEET 1: All Data ───────────────────────────────────────
    const aoaAll: (string | number)[][] = [ALL_DATA_HEADER]
    if (rows.length === 0) aoaAll.push(['(Tidak ada data sesuai filter)'])
    else aoaAll.push(...rows)
    if (truncated) {
      aoaAll.push([`Export dibatasi ${XLSX_MAX_ROWS} baris — persempit filter untuk data lengkap.`])
    }
    const wsAll = XLSX.utils.aoa_to_sheet(aoaAll)
    wsAll['!cols'] = [
      { wch: 5 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 7 },
      { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 6 },
      { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    ]
    wsAll['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: 0, c: ALL_DATA_HEADER.length - 1 }) }

    // ─── SHEET 2: Laporan Zoning-Grup (matrix mingguan) ──────────
    const aoaMatrix: (string | number)[][] = []
    const merges: XLSX.Range[] = []
    const weeks = payload?.weeks ?? []
    const nCols = 1 + weeks.length * 4 + 3

    if (mGroups.length === 0) {
      aoaMatrix.push([`LAPORAN MINGGUAN PER ZONING — ${monthName} ${year}`])
      aoaMatrix.push(['(Belum ada data laporan mingguan untuk periode ini)'])
    } else {
      for (const g of mGroups) {
        // Baris judul section zoning
        const titleRow = aoaMatrix.length
        aoaMatrix.push([
          `${g.groupName} — ${monthName} ${year} · Target Zoning: Rp ${fmtId(g.monthlyTarget)}`,
        ])
        merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: nCols - 1 } })

        // Header baris 1: NAMA | Week n (label) ×4 | TOTAL ×3
        const h1 = aoaMatrix.length
        const h1row: (string | number)[] = ['NAMA']
        for (const wm of weeks) {
          h1row.push(`Week ${wm.week} (${wm.label})`, '', '', '')
        }
        h1row.push('TOTAL', '', '')
        aoaMatrix.push(h1row)
        merges.push({ s: { r: h1, c: 0 }, e: { r: h1 + 1, c: 0 } })
        weeks.forEach((_, i) => {
          merges.push({ s: { r: h1, c: 1 + i * 4 }, e: { r: h1, c: 4 + i * 4 } })
        })
        merges.push({ s: { r: h1, c: 1 + weeks.length * 4 }, e: { r: h1, c: 3 + weeks.length * 4 } })

        // Header baris 2: sub-kolom
        const h2row: (string | number)[] = ['']
        for (let i = 0; i < weeks.length; i++) h2row.push('Qty', 'Netto', 'Target', 'ACV (%)')
        h2row.push('Qty', 'Netto', 'ACV (%)')
        aoaMatrix.push(h2row)

        // Baris crew
        for (const c of g.crews) {
          const row: (string | number)[] = [c.name]
          for (const w of c.weeks) row.push(w.qty, w.netto, w.target, w.acv)
          row.push(c.total.qty, c.total.netto, c.total.acv)
          aoaMatrix.push(row)
        }

        // Baris TOTAL ZONING
        const tz: (string | number)[] = [`TOTAL ${g.groupName}`]
        for (const w of g.totalRow.weeks) tz.push(w.qty, w.netto, w.target, w.acv)
        tz.push(g.totalRow.total.qty, g.totalRow.total.netto, g.totalRow.total.acv)
        aoaMatrix.push(tz)

        // Baris kosong antar section
        aoaMatrix.push([])
      }
      // hapus baris kosong terakhir
      aoaMatrix.pop()
    }

    const wsMatrix = XLSX.utils.aoa_to_sheet(aoaMatrix)
    const matrixCols: XLSX.ColInfo[] = [{ wch: 26 }]
    for (let i = 0; i < weeks.length; i++) {
      matrixCols.push({ wch: 7 }, { wch: 11 }, { wch: 11 }, { wch: 8 })
    }
    matrixCols.push({ wch: 8 }, { wch: 12 }, { wch: 8 })
    wsMatrix['!cols'] = matrixCols
    if (merges.length > 0) wsMatrix['!merges'] = merges

    // ─── SHEET 3: Laporan Per Dept ───────────────────────────────
    const aoaDept: (string | number)[][] = [
      [`DETAIL DEPT PER CREW PER MINGGU — ${monthName} ${year}`],
      ['Zoning', 'Crew', 'Minggu', 'Dept', 'Qty', 'Netto'],
    ]
    if (mGroups.length === 0) {
      aoaDept.push(['(Belum ada data laporan dept untuk periode ini)'])
    } else {
      for (const g of mGroups) {
        for (const c of g.deptDetails) {
          for (const w of c.weeks) {
            const wm = weeks.find((x) => x.week === w.week)
            const weekLabel = `Week ${w.week}${wm ? ` (${wm.label})` : ''}`
            let sumQ = 0
            let sumN = 0
            let pushed = 0
            for (const r of w.rows) {
              if (r.qty === 0 && r.netto === 0) continue
              aoaDept.push([g.groupName, c.name, weekLabel, r.dept, r.qty, r.netto])
              sumQ += r.qty
              sumN += r.netto
              pushed++
            }
            if (pushed > 0) {
              aoaDept.push([g.groupName, c.name, weekLabel, 'TOTAL', sumQ, sumN])
            }
          }
        }
      }
      if (aoaDept.length <= 2) {
        aoaDept.push(['(Tidak ada penjualan dept pada periode ini)'])
      }
    }
    const wsDept = XLSX.utils.aoa_to_sheet(aoaDept)
    wsDept['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 20 }, { wch: 7 }, { wch: 12 }]

    // ─── Rakit workbook & kirim ──────────────────────────────────
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsAll, 'All Data')
    XLSX.utils.book_append_sheet(wb, wsMatrix, 'Laporan Zoning-Grup')
    XLSX.utils.book_append_sheet(wb, wsDept, 'Laporan Per Dept')

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer

    const baseName =
      (q.filename
        ? q.filename.replace(/\.(csv|xlsx)$/i, '')
        : [
            'laporan',
            f.scopeLabel,
            f.groupLabel ? slugify(f.groupLabel) : '',
            f.crewLabel ? slugify(f.crewLabel) : '',
            periodeLabel,
          ]
            .filter(Boolean)
            .join('-')) + '.xlsx'

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${baseName}"`,
        'X-Total-Rows': String(totalRows),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Export workbook error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengekspor data' }, { status: 500 })
  }
}
