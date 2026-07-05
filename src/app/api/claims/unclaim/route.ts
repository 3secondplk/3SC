import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'

// ─────────────────────────────────────────────
// PUT /api/claims/unclaim — Unclaim sales (remove crew assignment)
// ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const { saleIds } = body as { saleIds?: string[] }

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

    // Verify all saleIds exist and are currently claimed
    const existingSales = await db.sale.findMany({
      where: {
        id: { in: saleIds },
        crewId: { not: null },
      },
    })

    if (existingSales.length === 0) {
      return NextResponse.json(
        { error: 'Tidak ada data penjualan yang sedang di-claim' },
        { status: 400 },
      )
    }

    const validIds = existingSales.map((s) => s.id)
    const skippedCount = saleIds.length - validIds.length

    // Unclaim: set crewId to null and claimedAt to null
    const result = await db.sale.updateMany({
      where: { id: { in: validIds } },
      data: {
        crewId: null,
        claimedAt: null,
      },
    })

    // Log unclaim activity (fire-and-forget)
    logActivity('UNCLAIM_SALE', {
      description: `Unclaim ${result.count} penjualan`,
      saleId: validIds[0],
      details: { saleId: validIds[0] },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: `Berhasil melepas claim dari ${result.count} data penjualan`,
      unclaimedCount: result.count,
      skippedCount: skippedCount > 0 ? skippedCount : undefined,
    })
  } catch (error) {
    console.error('Unclaim sales error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat melepas claim' },
      { status: 500 },
    )
  }
}
