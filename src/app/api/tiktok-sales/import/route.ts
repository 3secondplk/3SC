import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logActivity } from '@/lib/activity-logger'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const maxDuration = 120

const MAX_ROWS = 5000
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Allowed column aliases (case-insensitive, normalized)
const TANGGAL_ALIASES = ['tanggal', 'date', 'tgl']
const ID_ORDER_ALIASES = ['idorder', 'id_order', 'orderid', 'order_id', 'no_order']
const STATUS_ALIASES = ['status']
const ARTIKEL_ALIASES = ['artikel', 'product', 'produk', 'item', 'nama_produk']
const SIZE_ALIASES = ['size', 'ukuran']
const QTY_ALIASES = ['qty', 'quantity', 'jumlah', 'pcs']
const REVENUE_ALIASES = ['revenue', 'harga', 'price', 'total']
const SETTLE_ALIASES = ['settle', 'settlement']
const CREW_ALIASES = ['crew', 'nama_crew', 'crew_name']

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function resolveColumn(headers: string[], aliases: string[]): string | null {
  const normalized = headers.map(normalizeHeader)
  for (const alias of aliases) {
    const normalizedAlias = alias.replace(/[\s_-]+/g, '')
    const idx = normalized.indexOf(normalizedAlias)
    if (idx !== -1) return headers[idx]
  }
  return null
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val
  if (val === null || val === undefined || val === '') return 0
  const str = String(val).replace(/[^\d.,\-]/g, '').replace(/,/g, '')
  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}

function parseDate(val: unknown): string {
  if (!val) return ''
  const str = String(val).trim()

  // Already YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0')
    const m = dmyMatch[2].padStart(2, '0')
    return `${dmyMatch[3]}-${m}-${d}`
  }

  // Try to parse as Date
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return ''
}

const VALID_STATUSES = new Set(['Pengiriman', 'Selesai', 'Retur', 'Batal'])

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    // ── File validation ──
    if (!file) {
      return NextResponse.json({ error: 'File tidak ditemukan. Upload file CSV atau XLSX.' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      return NextResponse.json({ error: 'Format file tidak didukung. Gunakan .csv, .xlsx, atau .xls' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Ukuran file terlalu besar. Maksimal ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 400 })
    }

    // ── Parse file ──
    const buffer = Buffer.from(await file.arrayBuffer())
    let workbook: XLSX.WorkBook

    try {
      workbook = XLSX.read(buffer, { type: 'buffer' })
    } catch {
      return NextResponse.json({ error: 'Gagal membaca file. Pastikan file tidak rusak.' }, { status: 400 })
    }

    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      return NextResponse.json({ error: 'File kosong atau tidak memiliki sheet' }, { status: 400 })
    }

    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File tidak memiliki data baris' }, { status: 400 })
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Jumlah baris melebihi batas. Maksimal ${MAX_ROWS} baris, file memiliki ${rows.length} baris.` }, { status: 400 })
    }

    // ── Resolve columns ──
    const headers = Object.keys(rows[0] || {})
    const tanggalCol = resolveColumn(headers, TANGGAL_ALIASES)
    const idOrderCol = resolveColumn(headers, ID_ORDER_ALIASES)
    const statusCol = resolveColumn(headers, STATUS_ALIASES)
    const artikelCol = resolveColumn(headers, ARTIKEL_ALIASES)
    const sizeCol = resolveColumn(headers, SIZE_ALIASES)
    const qtyCol = resolveColumn(headers, QTY_ALIASES)
    const revenueCol = resolveColumn(headers, REVENUE_ALIASES)
    const settleCol = resolveColumn(headers, SETTLE_ALIASES)
    const crewCol = resolveColumn(headers, CREW_ALIASES)

    // Validate required columns
    const missing: string[] = []
    if (!tanggalCol) missing.push('Tanggal')
    if (!idOrderCol) missing.push('ID Order')
    if (!artikelCol) missing.push('Artikel')

    if (missing.length > 0) {
      return NextResponse.json({
        error: `Kolom wajib tidak ditemukan: ${missing.join(', ')}`,
        hint: `Kolom yang tersedia: ${headers.join(', ')}`,
      }, { status: 400 })
    }

    // ── Pre-fetch crews for lookup (name → id) ──
    const allCrews = await db.crew.findMany({
      select: { id: true, name: true },
    })
    const crewMap = new Map<string, string>() // lowercase name → id
    for (const c of allCrews) {
      crewMap.set(c.name.toLowerCase().trim(), c.id)
    }

    // ── Pre-fetch existing for dedup ──
    const existingOrders = await db.tikTokSale.findMany({
      select: { tanggal: true, idOrder: true },
    })
    const existingSet = new Set<string>()
    for (const e of existingOrders) {
      existingSet.add(`${e.tanggal}::${e.idOrder.toLowerCase().trim()}`)
    }

    // ── Process rows ──
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // Collect all rows to create, then batch insert
    const toCreate: Array<{
      tanggal: string
      idOrder: string
      status: string
      artikel: string
      size: string | null
      qty: number
      revenue: number
      settle: number
      crewId: string | null
    }> = []

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2 // 1-indexed with header
      const row = rows[i]

      // Parse fields
      const tanggal = parseDate(row[tanggalCol!])
      const idOrder = String(row[idOrderCol!] || '').trim()
      const rawStatus = String(row[statusCol!] || 'Pengiriman').trim()
      const artikel = String(row[artikelCol!] || '').trim()
      const size = sizeCol ? String(row[sizeCol] || '').trim() : null
      const qty = qtyCol ? parseNumber(row[qtyCol]) : 1
      const revenue = revenueCol ? parseNumber(row[revenueCol]) : 0
      const settle = settleCol ? parseNumber(row[settleCol]) : 0
      const crewName = crewCol ? String(row[crewCol] || '').trim() : ''

      // Validate
      if (!tanggal) {
        errors.push(`Baris ${rowNum}: Tanggal tidak valid (${row[tanggalCol!]})`)
        skipped++
        continue
      }
      if (!idOrder) {
        errors.push(`Baris ${rowNum}: ID Order kosong`)
        skipped++
        continue
      }
      if (!artikel) {
        errors.push(`Baris ${rowNum}: Artikel kosong`)
        skipped++
        continue
      }

      // Dedup check
      const dedupeKey = `${tanggal}::${idOrder.toLowerCase()}`
      if (existingSet.has(dedupeKey)) {
        skipped++
        continue
      }

      // Normalize status
      const status = VALID_STATUSES.has(rawStatus) ? rawStatus : 'Pengiriman'

      // Resolve crew
      let crewId: string | null = null
      if (crewName) {
        crewId = crewMap.get(crewName.toLowerCase()) ?? null
      }

      toCreate.push({
        tanggal,
        idOrder,
        status,
        artikel,
        size: size || null,
        qty: Math.max(1, Math.round(qty)),
        revenue: Math.max(0, revenue),
        settle: Math.max(0, settle),
        crewId,
      })

      // Mark as existing to prevent duplicates within same import
      existingSet.add(dedupeKey)
    }

    // Batch create in chunks
    const CHUNK_SIZE = 200
    for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
      const chunk = toCreate.slice(i, i + CHUNK_SIZE)
      await db.tikTokSale.createMany({ data: chunk })
      imported += chunk.length
    }

    await logActivity('TikTok Sales Imported', {
      description: `${imported} baris diimpor, ${skipped} dilewati`,
      details: {
        filename: file.name,
        total: rows.length,
        imported,
        skipped,
        errors: errors.length,
      },
    })

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.slice(0, 20), // Max 20 error lines
      errorCount: errors.length,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('TikTok import error:', msg)
    return NextResponse.json({ error: 'Terjadi kesalahan saat mengimpor', detail: msg }, { status: 500 })
  }
}