import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import { logActivity } from '@/lib/activity-logger'

// ─── Shift Types: bobot shift CONFIGURABLE (P/S/F/O + kode custom) ─────
// Bobot TIDAK di-hardcode — admin bebas mengubah & menambah shift.

function num(v: unknown, fallback = NaN): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const shiftTypes = await db.shiftType.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] })
    return NextResponse.json(shiftTypes)
  } catch (error) {
    console.error('Get shift-types error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

/** Buat kode shift baru */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const code = String(body.code ?? '').trim().toUpperCase()
    const label = String(body.label ?? '').trim()
    const weight = num(body.weight, NaN)
    const sortOrder = num(body.sortOrder, 99)

    if (!code || code.length > 3) {
      return NextResponse.json({ error: 'Kode shift wajib diisi (maks 3 karakter)' }, { status: 400 })
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      return NextResponse.json({ error: 'Bobot shift harus angka 0–100' }, { status: 400 })
    }

    const exists = await db.shiftType.findUnique({ where: { code } })
    if (exists) {
      return NextResponse.json({ error: `Kode shift "${code}" sudah ada` }, { status: 409 })
    }

    const created = await db.shiftType.create({
      data: { code, label: label || code, weight, sortOrder, isActive: true },
    })

    logActivity('CREATE_SHIFT_TYPE', {
      description: `Tambah shift ${created.code} (${created.label}) bobot ${created.weight}`,
      details: { id: created.id, code },
    }).catch(() => {})

    return NextResponse.json(created, { status: 201 })
  } catch (error) {
    console.error('Create shift-type error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

/** Update bobot/label/urut/aktif (bulk by id) */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const body = await request.json()
    const updates: Array<{ id: string; label?: string; weight?: number; sortOrder?: number; isActive?: boolean }> =
      Array.isArray(body.updates) ? body.updates : []

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data update' }, { status: 400 })
    }
    for (const u of updates) {
      if (!u.id) return NextResponse.json({ error: 'id shift wajib ada' }, { status: 400 })
      if (u.weight !== undefined && (!Number.isFinite(Number(u.weight)) || Number(u.weight) < 0 || Number(u.weight) > 100)) {
        return NextResponse.json({ error: 'Bobot shift harus angka 0–100' }, { status: 400 })
      }
    }

    const result = await db.$transaction(
      updates.map(u =>
        db.shiftType.update({
          where: { id: u.id },
          data: {
            ...(u.label !== undefined && { label: String(u.label).trim() || undefined }),
            ...(u.weight !== undefined && { weight: Number(u.weight) }),
            ...(u.sortOrder !== undefined && { sortOrder: Math.round(Number(u.sortOrder)) }),
            ...(u.isActive !== undefined && { isActive: !!u.isActive }),
          },
        }),
      ),
    )

    logActivity('UPDATE_SHIFT_TYPES', {
      description: `Update bobot shift: ${result.map(r => `${r.code}=${r.weight}`).join(', ')}`,
      details: { count: result.length },
    }).catch(() => {})

    return NextResponse.json(result)
  } catch (error) {
    console.error('Update shift-types error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}

/** Nonaktifkan kode shift (tidak menghapus agar jadwal lama tetap terbaca) */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id shift wajib diisi' }, { status: 400 })

    const st = await db.shiftType.update({ where: { id }, data: { isActive: false } })

    logActivity('DEACTIVATE_SHIFT_TYPE', {
      description: `Nonaktifkan shift ${st.code}`,
      details: { id, code: st.code },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Shift tidak ditemukan' }, { status: 404 })
    }
    console.error('Delete shift-type error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan' }, { status: 500 })
  }
}
