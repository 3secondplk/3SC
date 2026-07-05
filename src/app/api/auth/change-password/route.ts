import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized } from '@/lib/auth'
import * as crypto from 'crypto'
import { logActivity } from '@/lib/activity-logger'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    if (!user) return unauthorized()

    const { currentPassword, newPassword } = await request.json()

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Password lama dan baru harus diisi' }, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'Password baru minimal 6 karakter' }, { status: 400 })
    }

    // Get current admin from DB
    const admin = await db.admin.findUnique({ where: { id: user.adminId } })
    if (!admin) {
      return NextResponse.json({ error: 'Admin tidak ditemukan' }, { status: 404 })
    }

    // Validate current password
    const hashedCurrent = crypto.createHash('sha256').update(currentPassword).digest('hex')
    if (admin.password !== hashedCurrent) {
      return NextResponse.json({ error: 'Password lama salah' }, { status: 401 })
    }

    // Hash new password and update
    const hashedNew = crypto.createHash('sha256').update(newPassword).digest('hex')
    await db.admin.update({
      where: { id: user.adminId },
      data: { password: hashedNew },
    })

    // Log password change activity
    await logActivity('CHANGE_PASSWORD', { description: 'Password berhasil diubah' }).catch(() => {})

    return NextResponse.json({ success: true, message: 'Password berhasil diubah' })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}
