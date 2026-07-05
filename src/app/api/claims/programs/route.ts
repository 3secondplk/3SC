import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ─────────────────────────────────────────────
// GET /api/claims/programs — List unique program values
// ─────────────────────────────────────────────
export async function GET() {
  try {
    const programs = await db.sale.findMany({
      where: {
        program: { not: null },
      },
      select: { program: true },
      distinct: ['program'],
      orderBy: { program: 'asc' },
    })

    const programList = programs
      .map((p) => p.program)
      .filter((p): p is string => p !== null && p.trim() !== '')

    return NextResponse.json({ programs: programList })
  } catch (error) {
    console.error('Get programs error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
