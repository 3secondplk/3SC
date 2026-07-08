import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const { saleIds } = body as { saleIds: string[] }

    if (!Array.isArray(saleIds) || saleIds.length === 0) {
      return NextResponse.json({ error: 'Pilih minimal 1 penjualan' }, { status: 400 })
    }
    if (saleIds.length > 500) {
      return NextResponse.json({ error: 'Maksimal 500 penjualan sekaligus' }, { status: 400 })
    }

    // Only unclaim sales that are actually claimed
    const result = await db.sale.updateMany({
      where: {
        id: { in: saleIds },
        crewId: { not: null },
      },
      data: {
        crewId: null,
        claimedAt: null,
      },
    })

    if (result.count === 0) {
      return NextResponse.json({ message: 'Tidak ada penjualan yang di-unclaim', success: true, updated: 0 })
    }

    logActivity('BULK_UNCLAIM_SALE', {
      description: `Bulk unclaim ${result.count} penjualan`,
      details: { saleIds },
    }).catch(() => {})

    return NextResponse.json({ success: true, updated: result.count })
  } catch (error) {
    console.error('Bulk unclaim error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}