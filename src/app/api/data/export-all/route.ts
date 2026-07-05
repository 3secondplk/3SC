import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'

function serializeDates<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, value) => {
    if (value instanceof Date) return value.toISOString()
    return value
  }))
}

export async function GET() {
  try {
    const user = await requireAuth()
    if (!user) return unauthorized()

    const [admins, groups, crews, sales, activityLogs] = await Promise.all([
      db.admin.findMany({
        select: { id: true, username: true, name: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.group.findMany({
        include: {
          crews: {
            select: { id: true, name: true, employeeId: true, photo: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.crew.findMany({
        include: {
          group: { select: { id: true, name: true } },
          sales: { select: { id: true, settle: true, qty: true, tanggal: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.sale.findMany({
        include: {
          crew: { select: { id: true, name: true, employeeId: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.activityLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ])

    const data = serializeDates({ admins, groups, crews, sales, activityLogs })

    return NextResponse.json(data)
  } catch (error) {
    console.error('Export all error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}
