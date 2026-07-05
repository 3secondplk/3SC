import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/auth'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_ROWS = 500
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_NAME_LENGTH = 200
const MAX_EMPLOYEE_ID_LENGTH = 50

// Allowed column name aliases (case-insensitive)
const NAME_ALIASES = ['name']
const EMPLOYEE_ID_ALIASES = ['employee_id', 'employeeid', 'nip']
const PHOTO_ALIASES = ['photo']
const GROUP_ALIASES = ['group', 'group_name', 'groupname']

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

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return unauthorized()

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    // ── File validation ──
    if (!file) {
      return NextResponse.json({ error: 'File tidak ditemukan. Silakan upload file CSV atau XLSX.' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Format file tidak didukung. Gunakan file .csv atau .xlsx' }, { status: 400 })
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

    // ── Resolve column headers ──
    const headers = Object.keys(rows[0] || {})
    const nameCol = resolveColumn(headers, NAME_ALIASES)
    const employeeIdCol = resolveColumn(headers, EMPLOYEE_ID_ALIASES)
    const photoCol = resolveColumn(headers, PHOTO_ALIASES)
    const groupCol = resolveColumn(headers, GROUP_ALIASES)

    if (!nameCol) {
      return NextResponse.json({ error: 'Kolom "name" wajib ada dalam file CSV/XLSX' }, { status: 400 })
    }

    // ── Pre-fetch all groups for lookup ──
    const allGroups = await db.group.findMany({ select: { id: true, name: true } })
    const groupMap = new Map<string, string>() // lowercase name → id
    for (const g of allGroups) {
      groupMap.set(g.name.toLowerCase(), g.id)
    }

    // ── Pre-fetch existing crews for duplicate detection ──
    const existingCrews = await db.crew.findMany({ select: { name: true, employeeId: true } })
    const existingSet = new Set<string>()
    for (const c of existingCrews) {
      // Normalize: lowercase name + trim employeeId
      existingSet.add(`${(c.name || '').toLowerCase()}:::${(c.employeeId || '').trim()}`)
    }

    // ── Process rows ──
    let imported = 0
    let skipped = 0
    const errors: string[] = []
    const crews: Array<Record<string, unknown>> = []

    // We need a default group for crews without one
    // If there's at least one group, use the first; otherwise, create a default
    let defaultGroupId: string | null = null
    if (allGroups.length > 0) {
      defaultGroupId = allGroups[0].id
    } else {
      // Create a default group called "Umum"
      const defaultGroup = await db.group.create({
        data: {
          name: 'Umum',
          monthlyTarget: 0,
          week1Target: 0,
          week2Target: 0,
          week3Target: 0,
          week4Target: 0,
          week5Target: 0,
        },
      })
      defaultGroupId = defaultGroup.id
      groupMap.set('umum', defaultGroupId)
    }

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2 // 1-indexed, accounting for header row
      const row = rows[i]
      const rawName = String(row[nameCol] || '').trim()

      // Skip empty name rows
      if (!rawName) {
        errors.push(`Baris ${rowNum}: Nama kosong, dilewati`)
        skipped++
        continue
      }

      // Validate name length
      if (rawName.length > MAX_NAME_LENGTH) {
        errors.push(`Baris ${rowNum}: Nama terlalu panjang (maks ${MAX_NAME_LENGTH} karakter)`)
        skipped++
        continue
      }

      const name = rawName
      const employeeId = employeeIdCol ? String(row[employeeIdCol] || '').trim() : ''

      // Validate employee ID length
      if (employeeId.length > MAX_EMPLOYEE_ID_LENGTH) {
        errors.push(`Baris ${rowNum}: ID Karyawan terlalu panjang (maks ${MAX_EMPLOYEE_ID_LENGTH} karakter)`)
        skipped++
        continue
      }

      // Duplicate detection: same name + employeeId
      const dedupeKey = `${name.toLowerCase()}:::${employeeId}`
      if (existingSet.has(dedupeKey)) {
        skipped++
        continue
      }

      // Resolve group
      let groupId = defaultGroupId!
      if (groupCol) {
        const rawGroup = String(row[groupCol] || '').trim()
        if (rawGroup) {
          const matchedGroupId = groupMap.get(rawGroup.toLowerCase())
          if (matchedGroupId) {
            groupId = matchedGroupId
          } else {
            errors.push(`Baris ${rowNum}: Group '${rawGroup}' tidak ditemukan`)
            // Don't skip — just assign to default group
          }
        }
      }

      // Get photo URL
      const photo = photoCol ? String(row[photoCol] || '').trim() : ''

      // Create crew
      try {
        const crew = await db.crew.create({
          data: {
            name,
            employeeId,
            photo: photo || null,
            groupId,
          },
        })
        imported++
        existingSet.add(dedupeKey) // Add to set to catch duplicates within the same file
        crews.push({
          id: crew.id,
          name: crew.name,
          employeeId: crew.employeeId,
          photo: crew.photo,
          groupId: crew.groupId,
        })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        // Check for unique constraint violation on employeeId
        if (msg.includes('Unique')) {
          errors.push(`Baris ${rowNum}: ID Karyawan '${employeeId}' sudah digunakan`)
          skipped++
        } else {
          errors.push(`Baris ${rowNum}: Gagal membuat crew — ${msg}`)
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
      crews,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import gagal'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
