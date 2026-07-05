import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'

export async function DELETE() {
  try {
    const user = await requireAuth()
    if (!user) return unauthorized()

    // Count before deletion
    const [salesCount, activityLogsCount, crewsCount, groupsCount] = await Promise.all([
      db.sale.count(),
      db.activityLog.count(),
      db.crew.count(),
      db.group.count(),
    ])

    // Delete in order respecting foreign keys: sales → activityLogs → crews → groups
    const deleteSales = db.sale.deleteMany()
    const deleteActivityLogs = db.activityLog.deleteMany()
    const deleteCrews = db.crew.deleteMany()
    const deleteGroups = db.group.deleteMany()

    await db.$transaction([
      deleteSales,
      deleteActivityLogs,
      deleteCrews,
      deleteGroups,
    ])

    // Log the clear action
    await logActivity('CLEAR_ALL_DATA', {
      description: `Semua data dihapus: ${salesCount} sales, ${crewsCount} crew, ${groupsCount} group, ${activityLogsCount} activity logs`,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: 'Semua data berhasil dihapus',
      deleted: { sales: salesCount, activityLogs: activityLogsCount, crews: crewsCount, groups: groupsCount },
    })
  } catch (error) {
    console.error('Clear all error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}
