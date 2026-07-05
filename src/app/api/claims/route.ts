import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'
import { logActivity } from '@/lib/activity-logger'

// ─────────────────────────────────────────────
// POST /api/claims — Upload Excel & Import as unclaimed sales
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File harus diisi' }, { status: 400 })
    }

    // File type validation
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    if (!validTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json(
        { error: 'Format file tidak didukung. Gunakan file Excel (.xlsx atau .xls)' },
        { status: 400 },
      )
    }

    // SEC-07: File size limit (Vercel Hobby has 4.5MB body limit)
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File terlalu besar (maksimal 4MB untuk Vercel free tier)' },
        { status: 400 },
      )
    }

    // Parse Excel — supports two formats:
    // Format A: Row 1 = title "Laporan Penjualan", Row 2 = headers, Row 3+ = data
    // Format B: Row 1 = headers, Row 2+ = data (no title row)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })

    if (jsonData.length === 0) {
      return NextResponse.json({ error: 'File kosong atau tidak dapat dibaca' }, { status: 400 })
    }

    // Validate required columns from first row (headers or first data row)
    const requiredColumns = ['Tanggal', 'Kode Extend', 'Settle', 'Qty']
    const missingColumns = requiredColumns.filter((col) => !(col in jsonData[0]))
    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Format file tidak valid. Pastikan file memiliki kolom: Tanggal, Kode Extend, Settle, Qty` },
        { status: 400 },
      )
    }

    // ── Smart title row detection (BUGFIX: was always slicing row 0) ──
    // sheet_to_json uses Excel Row 1 as column headers automatically.
    // If the original Excel has a title row "Laporan Penjualan" BEFORE the headers,
    // that title row is already stripped by sheet_to_json and jsonData starts with data.
    // If the original Excel has NO title row (headers = Row 1), same behavior.
    // So jsonData is ALWAYS pure data rows — NEVER slice.
    const dataRows = jsonData

    const uniqueProducts = new Set<string>()
    let totalQty = 0
    let totalSettle = 0

    // Build insert payloads — all 20 Excel columns
    const salesData: {
      tanggal: string; idPenjualan: string; statusRetention: string; retentionCode: string
      kodeExtend: string; brand: string; dept: string; modul: string; ukuran: string
      qty: number; hjp: number; netto: number; diskon: number; diskonRp: number
      potongan: number; potonganV: number; settle: number
      pembayaran: string; program: string; channelStock: string
    }[] = []

    for (const row of dataRows) {
      const tanggal = String(row['Tanggal'] || '')
      const idPenjualan = String(row['ID Penjualan'] || '')
      const statusRetention = String(row['Status Retention'] || '')
      const retentionCode = String(row['Retention Code'] || '')
      const kodeExtend = String(row['Kode Extend'] || '')
      const brand = String(row['Brand'] || '')
      const dept = String(row['Dept'] || '')
      const modul = String(row['Modul'] || '')
      const ukuran = String(row['Ukuran'] || '')
      const qty = Number(row['Qty']) || 0
      const hjp = Number(row['HJP']) || Number(row['Hjp']) || Number(row['hjp']) || 0
      const netto = Number(row['Netto']) || 0
      const diskon = Number(row['Diskon']) || 0
      const diskonRp = Number(row['Diskon Rp']) || 0
      const potongan = Number(row['Potongan,']) || Number(row['Potongan']) || 0
      const potonganV = Number(row['Potongan V']) || 0
      const settle = Number(row['Settle']) || 0
      const pembayaran = String(row['Pembayaran'] || '')
      const program = String(row['Program'] || '')
      const channelStock = String(row['Channel Stock'] || '')

      // Skip completely empty rows
      if (!tanggal && !kodeExtend) continue

      // Skip rows where Settle is 0 or empty
      if (!settle || settle <= 0) continue

      salesData.push({ tanggal, idPenjualan, statusRetention, retentionCode, kodeExtend, brand, dept, modul, ukuran, qty, hjp, netto, diskon, diskonRp, potongan, potonganV, settle, pembayaran, program, channelStock })
      if (kodeExtend) uniqueProducts.add(kodeExtend)
      totalQty += qty
      totalSettle += settle
    }

    if (salesData.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data penjualan valid dalam file (Settle harus > 0)' },
        { status: 400 },
      )
    }

    // ── Cross-DB deduplication (DEDUP v6 — Row-level) ──
    // Unique key = (tanggal, idPenjualan, kodeExtend) per individual row
    // This handles: same product bought multiple times, partial deletes, re-imports
    // Algorithm: count each unique key in import vs DB → only import the excess
    let newSalesData: typeof salesData = []
    let duplicateCount = 0

    // Step 1: Count occurrences of each unique key in the import file
    const importCounts = new Map<string, number>()
    for (const s of salesData) {
      const key = `${s.tanggal}|||${s.idPenjualan || ''}|||${s.kodeExtend}`
      importCounts.set(key, (importCounts.get(key) || 0) + 1)
    }

    // Step 2: Get DB counts for each unique key
    const uniqueKeys = [...importCounts.keys()]
    const dbCounts = new Map<string, number>()

    // Query in chunks to avoid too many DB calls
    const CHUNK_SIZE = 50
    for (let i = 0; i < uniqueKeys.length; i += CHUNK_SIZE) {
      const chunk = uniqueKeys.slice(i, i + CHUNK_SIZE)
      await Promise.all(chunk.map(async (key) => {
        const [tanggal, idPenjualan, kodeExtend] = key.split('|||')
        const whereClause: Record<string, unknown> = { tanggal, kodeExtend }
        if (idPenjualan) {
          whereClause.idPenjualan = idPenjualan
        } else {
          whereClause.idPenjualan = null
        }
        const count = await db.sale.count({ where: whereClause })
        dbCounts.set(key, count)
      }))
    }

    // Step 3: Build rows to keep — for each unique key, import (importCount - dbCount) rows
    const keyUsageCount = new Map<string, number>()
    for (const s of salesData) {
      const key = `${s.tanggal}|||${s.idPenjualan || ''}|||${s.kodeExtend}`
      const importCount = importCounts.get(key) || 0
      const dbCount = dbCounts.get(key) || 0
      const used = keyUsageCount.get(key) || 0

      if (used < Math.max(0, importCount - dbCount)) {
        newSalesData.push(s)
        keyUsageCount.set(key, used + 1)
      } else {
        duplicateCount++
      }
    }

    // Recalculate stats for only the new (non-duplicate) rows
    let newTotalQty = 0
    let newTotalSettle = 0
    const newProducts = new Set<string>()
    for (const item of newSalesData) {
      newTotalQty += item.qty
      newTotalSettle += item.settle
      if (item.kodeExtend) newProducts.add(item.kodeExtend)
    }

    // If all rows are duplicates, return early with info
    if (newSalesData.length === 0) {
      return NextResponse.json({
        success: true,
        message: `Semua ${duplicateCount} data sudah ada di database — tidak ada data baru yang diimpor`,
        summary: {
          totalRows: 0,
          duplicateRows: duplicateCount,
          totalQty: 0,
          totalSettle: 0,
          uniqueProducts: 0,
        },
      })
    }

    // Insert only new (non-duplicate) rows as unclaimed (crewId = null)
    const created = await db.sale.createMany({
      data: newSalesData.map((item) => ({
        tanggal: item.tanggal,
        idPenjualan: item.idPenjualan || null,
        statusRetention: item.statusRetention || null,
        retentionCode: item.retentionCode || null,
        kodeExtend: item.kodeExtend,
        brand: item.brand || null,
        dept: item.dept || null,
        modul: item.modul || null,
        ukuran: item.ukuran || null,
        qty: item.qty,
        hjp: item.hjp,
        netto: item.netto,
        diskon: item.diskon,
        diskonRp: item.diskonRp,
        potongan: item.potongan,
        potonganV: item.potonganV,
        settle: item.settle,
        pembayaran: item.pembayaran || null,
        program: item.program || null,
        channelStock: item.channelStock || null,
        crewId: null,
      })),
    })

    // Log import activity (fire-and-forget)
    logActivity('IMPORT_SALES', {
      description: `Import ${created.count} data penjualan`,
      details: { totalRows: created.count, totalSettle: newTotalSettle },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: duplicateCount > 0
        ? `Berhasil mengimpor ${created.count} data baru (${duplicateCount} duplikat dilewati)`
        : `Berhasil mengimpor ${created.count} data penjualan`,
      summary: {
        totalRows: created.count,
        duplicateRows: duplicateCount,
        totalQty: newTotalQty,
        totalSettle: newTotalSettle,
        uniqueProducts: newProducts.size,
      },
    })
  } catch (error) {
    console.error('Upload & import claim error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat memproses file' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────
// GET /api/claims — List sales with filters & pagination
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50'))) // PERF-06: cap at 100
    const search = searchParams.get('search') || ''
    const dateFrom = searchParams.get('dateFrom') || ''
    const dateTo = searchParams.get('dateTo') || ''
    const program = searchParams.get('program') || ''
    const claimed = searchParams.get('claimed') || ''
    const crewId = searchParams.get('crewId') || ''

    // Build Prisma where clause
    const where: Record<string, any> = {}

    // Claimed filter: "true" → claimed only, "false" → unclaimed only, omit → all
    if (claimed === 'true') {
      where.crewId = crewId ? crewId : { not: null }
    } else if (claimed === 'false') {
      where.crewId = { equals: null }
    } else if (crewId) {
      where.crewId = crewId
    }

    // Search across kodeExtend, brand, dept, and crew name (case-insensitive)
    if (search) {
      const searchConditions: Record<string, any>[] = [
        { kodeExtend: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { dept: { contains: search, mode: 'insensitive' } },
      ]
      // Only add crew name search if there might be a crew relation
      if (claimed !== 'false') {
        searchConditions.push({ crew: { name: { contains: search, mode: 'insensitive' } } })
      }
      where.OR = searchConditions
    }

    // Date range filter on tanggal
    // BUGFIX: tanggal can contain timestamps like "2026-05-03 09:00"
    // Using lte with bare date "2026-05-03" fails because "2026-05-03 09:00" > "2026-05-03"
    // Fix: use lt with next day to include all timestamps on the target date
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

    // Program filter
    if (program) {
      where.program = program
    }

    const [sales, total, summary, strukGroups] = await Promise.all([
      db.sale.findMany({
        where,
        include: {
          crew: {
            select: { id: true, name: true, employeeId: true, photo: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.sale.count({ where }),
      // PERF-01: Use aggregation instead of loading all rows into memory
      db.sale.aggregate({
        _sum: { qty: true, settle: true, hjp: true },
        where,
      }),
      // Struk count based on UNIQUE idPenjualan (transaction/receipt ID)
      // One struk (receipt) can have multiple item rows with same idPenjualan
      db.sale.groupBy({
        by: ['idPenjualan'],
        where: { ...where, idPenjualan: { not: null } },
      }),
    ])

    const totalPages = Math.max(1, Math.ceil(total / limit))

    // Calculate summary stats from aggregation result
    const totalQty = summary._sum.qty ?? 0
    const totalSettle = summary._sum.settle ?? 0
    // totalStruk = unique idPenjualan count (number of distinct transactions/receipts)
    const totalStruk = strukGroups.length
    // Basket Size = average items per transaction
    const basketSize = totalStruk > 0 ? totalQty / totalStruk : 0
    // Price Point = average price per item
    const pricePoint = totalQty > 0 ? totalSettle / totalQty : 0

    return NextResponse.json({
      sales,
      total,
      page,
      totalPages,
      summary: {
        totalQty,
        totalSettle,
        totalStruk,
        basketSize,
        pricePoint,
      },
    })
  } catch (error) {
    console.error('Get claims error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// PUT /api/claims — Claim sales (assign crew to sales)
// Uses ATOMIC conditional update: WHERE crewId = null
// This prevents race conditions when multiple devices claim the same rows
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { saleIds, crewId } = body as { saleIds?: string[]; crewId?: string }

    if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
      return NextResponse.json(
        { error: 'saleIds harus berupa array yang tidak kosong' },
        { status: 400 },
      )
    }

    // SEC-05: Cap array size to prevent abuse
    if (saleIds.length > 500) {
      return NextResponse.json(
        { error: 'Maksimal 500 item per request' },
        { status: 400 },
      )
    }

    if (!crewId) {
      return NextResponse.json({ error: 'crewId harus diisi' }, { status: 400 })
    }

    // Verify crew exists
    const crew = await db.crew.findUnique({ where: { id: crewId } })
    if (!crew) {
      return NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 })
    }

    // ━━━ ATOMIC CLAIM: single updateMany with WHERE crewId = null ━━━
    // This is the critical fix for race condition.
    // The database guarantees that only ONE request can set crewId on a row
    // where crewId was previously null. If another device claimed it first,
    // the WHERE clause won't match and that row won't be updated.
    const now = new Date()
    const result = await db.sale.updateMany({
      where: {
        id: { in: saleIds },
        crewId: null, // ← Atomic check: only update rows that are still unclaimed
      },
      data: {
        crewId,
        claimedAt: now,
      },
    })

    // ── Analyze results ──
    const requestedCount = saleIds.length
    const claimedCount = result.count
    const conflictCount = requestedCount - claimedCount

    // If nothing was claimed, check why
    if (claimedCount === 0) {
      // Check if sales exist at all
      const existingCount = await db.sale.count({
        where: { id: { in: saleIds } },
      })
      if (existingCount === 0) {
        return NextResponse.json(
          { error: 'Data penjualan tidak ditemukan', code: 'NOT_FOUND' },
          { status: 404 },
        )
      }
      // Sales exist but already claimed by someone else
      // Fetch who claimed them
      const alreadyClaimed = await db.sale.findMany({
        where: { id: { in: saleIds } },
        select: { id: true, crew: { select: { name: true } }, claimedAt: true },
      })
      return NextResponse.json({
        success: false,
        error: 'Semua data sudah di-claim oleh crew lain',
        code: 'ALL_CONFLICT',
        claimedCount: 0,
        conflictCount: requestedCount,
        conflictDetails: alreadyClaimed.map(s => ({
          saleId: s.id,
          claimedBy: s.crew?.name || 'Unknown',
          claimedAt: s.claimedAt,
        })),
        crewId,
        crewName: crew.name,
      }, { status: 409 })
    }

    // Partial success: some claimed, some conflicted
    if (conflictCount > 0) {
      // Fetch details of conflicted sales (who claimed them)
      const claimedSaleIds = await db.sale.findMany({
        where: { id: { in: saleIds }, crewId },
        select: { id: true, settle: true },
      })
      const totalSettle = claimedSaleIds.reduce((sum, s) => sum + s.settle, 0)

      const conflictedSales = await db.sale.findMany({
        where: { id: { in: saleIds }, crewId: { not: crewId } },
        select: { id: true, crew: { select: { name: true } }, claimedAt: true },
      })

      return NextResponse.json({
        success: true,
        message: `${claimedCount} data berhasil di-claim, ${conflictCount} data sudah di-claim crew lain`,
        code: 'PARTIAL_CONFLICT',
        claimedCount,
        conflictCount,
        totalSettle,
        conflictDetails: conflictedSales.map(s => ({
          saleId: s.id,
          claimedBy: s.crew?.name || 'Unknown',
          claimedAt: s.claimedAt,
        })),
        crewId,
        crewName: crew.name,
      })
    }

    // Full success: all claimed
    const claimedSales = await db.sale.findMany({
      where: { id: { in: saleIds }, crewId },
      select: { id: true, settle: true },
    })
    const totalSettle = claimedSales.reduce((sum, s) => sum + s.settle, 0)

    // Log claim activity (fire-and-forget)
    logActivity('CLAIM_SALES', {
      description: `Claim ${claimedCount} penjualan untuk ${crew.name}`,
      crewName: crew.name,
      details: { count: claimedCount, crewId, totalSettle },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: `Berhasil meng-claim ${claimedCount} data penjualan untuk ${crew.name}`,
      code: 'SUCCESS',
      claimedCount,
      totalSettle,
      crewId,
      crewName: crew.name,
    })
  } catch (error) {
    console.error('Claim sales error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat meng-claim' },
      { status: 500 },
    )
  }
}

// ─────────────────────────────────────────────
// PATCH /api/claims — Edit a sale record (admin)
// Allows: change crew assignment, edit qty/settle/dept/brand/tanggal
// ─────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, crewId, tanggal, kodeExtend, qty, settle, dept, brand, modul, pembayaran, program } = body as Record<string, unknown>

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'ID harus diisi' }, { status: 400 })
    }

    const sale = await db.sale.findUnique({ where: { id } })
    if (!sale) {
      return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 })
    }

    // Build update data object
    const data: Record<string, unknown> = {}

    // Crew reassignment
    if (crewId !== undefined) {
      if (crewId === null || crewId === '') {
        data.crewId = null
        data.claimedAt = null
      } else {
        // Verify crew exists
        const crew = await db.crew.findUnique({ where: { id: crewId as string } })
        if (!crew) {
          return NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 })
        }
        data.crewId = crewId
        // Set claimedAt if transitioning from unclaimed to claimed
        if (!sale.crewId) {
          data.claimedAt = new Date()
        }
      }
    }

    // Editable fields — only update if provided and different
    if (tanggal !== undefined && typeof tanggal === 'string') data.tanggal = tanggal
    if (kodeExtend !== undefined && typeof kodeExtend === 'string') data.kodeExtend = kodeExtend
    if (qty !== undefined && typeof qty === 'number') data.qty = Number.isFinite(qty) ? Math.max(0, qty) : 0
    if (settle !== undefined && typeof settle === 'number') data.settle = Number.isFinite(settle) ? Math.max(0, settle) : 0
    if (dept !== undefined) data.dept = dept === '' ? null : dept
    if (brand !== undefined) data.brand = brand === '' ? null : brand
    if (modul !== undefined) data.modul = modul === '' ? null : modul
    if (pembayaran !== undefined) data.pembayaran = pembayaran === '' ? null : pembayaran
    if (program !== undefined) data.program = program === '' ? null : program

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Tidak ada data yang diubah' }, { status: 400 })
    }

    const updated = await db.sale.update({
      where: { id },
      data,
      include: {
        crew: { select: { id: true, name: true, employeeId: true, photo: true } },
      },
    })

    return NextResponse.json({ success: true, message: 'Data berhasil diperbarui', sale: updated })
  } catch (error) {
    console.error('Edit claim error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengubah data' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────
// DELETE /api/claims — Delete a sale record
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID harus diisi' }, { status: 400 })
    }

    const sale = await db.sale.findUnique({ where: { id } })
    if (!sale) {
      return NextResponse.json({ error: 'Data tidak ditemukan' }, { status: 404 })
    }

    // Log delete activity (fire-and-forget)
    logActivity('DELETE_SALE', {
      description: `Hapus penjualan: ${sale.kodeExtend}`,
      saleId: sale.id,
      details: { saleId: sale.id },
    }).catch(() => {})

    await db.sale.delete({ where: { id } })

    return NextResponse.json({ success: true, message: 'Data penjualan berhasil dihapus' })
  } catch (error) {
    console.error('Delete claim error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat menghapus' },
      { status: 500 },
    )
  }
}
