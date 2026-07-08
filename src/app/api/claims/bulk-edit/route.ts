import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'
import { Prisma } from '@prisma/client'

// Editable fields for bulk update
const EDITABLE_FIELDS = ['tanggal', 'kodeExtend', 'qty', 'settle', 'dept', 'brand', 'modul', 'pembayaran', 'program', 'crewId'] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const { saleIds, updates } = body as {
      saleIds: string[]
      updates: Partial<Record<EditableField, string | number | null>>
    }

    // Validation
    if (!Array.isArray(saleIds) || saleIds.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal 1 penjualan' }, { status: 400 })
    }
    if (saleIds.length > 500) {
      return NextResponse.json({ error: 'Maksimal 500 penjualan sekaligus' }, { status: 400 })
    }
    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Tidak ada field yang diubah' }, { status: 400 })
    }

    // Validate field names
    const invalidFields = Object.keys(updates).filter(f => !EDITABLE_FIELDS.includes(f as EditableField))
    if (invalidFields.length > 0) {
      return NextResponse.json({ error: `Field tidak valid: ${invalidFields.join(', ')}` }, { status: 400 })
    }

    // Build Prisma update data
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue

      if (key === 'qty' || key === 'settle') {
        const num = Number(value)
        if (!Number.isFinite(num) || num < 0) {
          return NextResponse.json({ error: `${key} harus berupa angka non-negatif` }, { status: 400 })
        }
        data[key] = num
      } else if (key === 'crewId') {
        // null/empty = unclaim
        if (value === null || value === '' || value === undefined) {
          data.crewId = null
          data.claimedAt = null
        } else {
          // Validate crew exists
          const crew = await db.crew.findUnique({ where: { id: value as string } })
          if (!crew) {
            return NextResponse.json({ error: 'Crew tidak ditemukan' }, { status: 404 })
          }
          data.crewId = value
          // Only set claimedAt if transitioning from unclaimed
          const unclaimedCount = await db.sale.count({
            where: { id: { in: saleIds }, crewId: null },
          })
          if (unclaimedCount > 0) {
            data.claimedAt = new Date()
          }
        }
      } else if (key === 'tanggal') {
        data.tanggal = String(value)
      } else {
        // String fields — empty string → null
        data[key] = value === '' ? null : String(value)
      }
    }

    // Check how many exist
    const existingCount = await db.sale.count({
      where: { id: { in: saleIds } },
    })
    if (existingCount === 0) {
      return NextResponse.json({ error: 'Penjualan tidak ditemukan' }, { status: 404 })
    }

    // Perform bulk update
    const result = await db.sale.updateMany({
      where: { id: { in: saleIds } },
      data,
    })

    // Log activity
    const fieldNames = Object.keys(updates).join(', ')
    logActivity('BULK_EDIT_SALE', {
      description: `Bulk edit ${result.count} penjualan: ${fieldNames}`,
      details: { saleIds, updates },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      updated: result.count,
      notFound: saleIds.length - existingCount,
    })
  } catch (error) {
    console.error('Bulk edit sales error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}