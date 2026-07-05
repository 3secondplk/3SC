import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'

// ─────────────────────────────────────────────
// GET /api/activity-log — Fetch recent activity logs
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { searchParams } = new URL(request.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))

    const logs = await db.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    // Parse metadata JSON and shape the response
    const shaped = logs.map(log => {
      let metadata: Record<string, unknown> = {}
      try {
        metadata = log.metadata ? JSON.parse(log.metadata) : {}
      } catch {
        // Ignore malformed JSON
      }

      return {
        id: log.id,
        action: log.action,
        description: log.description,
        crewName: log.crewName,
        saleId: log.saleId,
        adminName: (metadata.adminName as string) || 'Sistem',
        details: metadata,
        createdAt: log.createdAt,
      }
    })

    return NextResponse.json(shaped)
  } catch (error) {
    console.error('Get activity log error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
