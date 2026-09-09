import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'
import { parseISODate, daysInMonthOf } from '@/lib/target-engine'

// ─── Crew Shift Schedule: jadwal shift crew per tanggal (roster) ───────
// Ini jadwal operasional — BUKAN snapshot target & BUKAN history.
// Target selalu dihitung realtime dari jadwal aktif ini.

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { searchParams } = new URL(request.url)
    const now = new Date()
    const utc = now.getTime() + now.getTimezoneOffset() * 60000
    const wib = new Date(utc + 7 * 3600000)
    const year = Number(searchParams.get('year')) || wib.getFullYear()
    const month = Number(searchParams.get('month')) || (wib.getMonth() + 1) // 1-based dari client
    const monthIndex = month - 1
    if (monthIndex < 0 || monthIndex > 11) {
      return NextResponse.json({ error: 'Bulan tidak valid' }, { status: 400 })
    }

    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const [shifts, crews, shiftTypes] = await Promise.all([
      db.crewShift.findMany({
        where: { tanggal: { gte: `${prefix}-01`, lte: `${prefix}-31` } },
        select: { crewId: true, tanggal: true, shiftCode: true },
      }),
      db.crew.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, employeeId: true, photo: true, groupId: true, group: { select: { id: true, name: true } } },
      }),
      db.shiftType.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
    ])

    return NextResponse.json({
      year,
      month,
      daysInMonth: daysInMonthOf(year, monthIndex),
      crews,
      shiftTypes,
      shifts: shifts.map(s => ({ crewId: s.crewId, tanggal: s.tanggal, shiftCode: s.shiftCode })),
    })
  } catch (error) {
    console.error('Get schedule error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

/**
 * Simpan jadwal (bulk).
 * Body: { entries: [{ crewId, tanggal, shiftCode }] }
 * shiftCode null/'' → hapus baris jadwal (crew belum dijadwalkan).
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const entries: Array<{ crewId?: unknown; tanggal?: unknown; shiftCode?: unknown }> =
      Array.isArray(body.entries) ? body.entries : []

    if (entries.length === 0) {
      return NextResponse.json({ error: 'Tidak ada entri jadwal' }, { status: 400 })
    }
    if (entries.length > 5000) {
      return NextResponse.json({ error: 'Terlalu banyak entri (maks 5000 per request)' }, { status: 400 })
    }

    // Validasi crew & shift codes
    const crewIds = [...new Set(entries.map(e => String(e.crewId ?? '')))].filter(Boolean)
    const crews = await db.crew.findMany({ where: { id: { in: crewIds } }, select: { id: true } })
    if (crews.length !== crewIds.length) {
      return NextResponse.json({ error: 'Ada crew yang tidak ditemukan' }, { status: 400 })
    }
    const validCodes = new Set(
      (await db.shiftType.findMany({ where: { isActive: true }, select: { code: true } })).map(s => s.code),
    )

    const toUpsert: Array<{ crewId: string; tanggal: string; shiftCode: string }> = []
    const toDelete: Array<{ crewId: string; tanggal: string }> = []
    for (const e of entries) {
      const crewId = String(e.crewId ?? '')
      const parsed = parseISODate(String(e.tanggal ?? ''))
      if (!crewId || !parsed) {
        return NextResponse.json({ error: `Tanggal tidak valid: ${String(e.tanggal)}` }, { status: 400 })
      }
      const code = String(e.shiftCode ?? '').trim().toUpperCase()
      if (!code) {
        toDelete.push({ crewId, tanggal: String(e.tanggal) })
      } else if (validCodes.has(code)) {
        toUpsert.push({ crewId, tanggal: String(e.tanggal), shiftCode: code })
      } else {
        return NextResponse.json({ error: `Kode shift tidak dikenal: "${code}"` }, { status: 400 })
      }
    }

    await db.$transaction([
      ...toUpsert.map(u =>
        db.crewShift.upsert({
          where: { crewId_tanggal: { crewId: u.crewId, tanggal: u.tanggal } },
          create: u,
          update: { shiftCode: u.shiftCode },
        }),
      ),
      ...toDelete.map(d =>
        db.crewShift.deleteMany({ where: { crewId: d.crewId, tanggal: d.tanggal } }),
      ),
    ])

    logActivity('UPDATE_SCHEDULE', {
      description: `Update jadwal shift: ${toUpsert.length} set, ${toDelete.length} hapus`,
      details: { setUpserts: toUpsert.length, deletes: toDelete.length },
    }).catch(() => {})

    return NextResponse.json({ success: true, upserted: toUpsert.length, deleted: toDelete.length })
  } catch (error) {
    console.error('Update schedule error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
