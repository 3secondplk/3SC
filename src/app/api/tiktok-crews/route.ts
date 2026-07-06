import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public endpoint — returns crews from TikTok-active groups (no auth required)
export async function GET() {
  try {
    const activeGroups = await db.group.findMany({
      where: { tiktokActive: true },
      select: { id: true },
    })
    const activeGroupIds = activeGroups.map(g => g.id)

    if (activeGroupIds.length === 0) return NextResponse.json([])

    const crews = await db.crew.findMany({
      where: { groupId: { in: activeGroupIds } },
      select: {
        id: true,
        name: true,
        employeeId: true,
        photo: true,
        groupId: true,
        group: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(crews)
  } catch (error) {
    console.error('Get tiktok crews error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}