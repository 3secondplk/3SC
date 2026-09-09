import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as crypto from 'crypto'
import { headers } from 'next/headers'
import { logActivity } from '@/lib/activity-logger'

// ─── Stateless JWT for serverless (Vercel) compatibility ───
// SEC-02: No fallback — NEXT_AUTH_SECRET must be set in production
const JWT_SECRET = process.env.NEXT_AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'cms-crew-dev-secret-local-only')
const JWT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface JWTPayload {
  adminId: string
  username: string
  name: string
  iat: number
  exp: number
}

function createJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const now = Date.now()
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + JWT_EXPIRY_MS })).toString('base64url')
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function verifyJWT(token: string): JWTPayload | null {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
    if (signature !== expectedSig) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JWTPayload
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json()

    if (!username || !password) {
      return NextResponse.json({ error: 'Username dan password harus diisi' }, { status: 400 })
    }

    // SEC-02: Block login if NEXT_AUTH_SECRET not configured in production
    if (!JWT_SECRET) {
      return NextResponse.json({ error: 'Server configuration error: NEXT_AUTH_SECRET not set' }, { status: 500 })
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex')

    // AUTO-SETUP: Jika tabel Admin kosong, buat admin pertama kali
    const adminCount = await db.admin.count()
    if (adminCount === 0) {
      const defaultHash = crypto.createHash('sha256').update('admin123').digest('hex')
      if (hashedPassword === defaultHash) {
        await db.admin.create({
          data: {
            username: 'admin',
            password: defaultHash,
            name: 'Administrator',
          },
        })
      }
    }

    const admin = await db.admin.findUnique({
      where: { username },
    })

    if (!admin || admin.password !== hashedPassword) {
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 })
    }

    const token = createJWT({ adminId: admin.id, username: admin.username, name: admin.name })

    // Secure flag hanya bila request benar-benar https (via proxy/gateway).
    // Jangan pakai NODE_ENV — app sering diakses via http di sandbox/iframe,
    // dan cookie Secure di http akan DITOLAK browser → 401 terus.
    let isHttps = false
    try {
      const h = await headers()
      isHttps = (h.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https'
    } catch { /* ignore */ }

    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    cookieStore.set('admin_token', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    // Log login activity (fire-and-forget)
    logActivity('LOGIN', { description: 'Login berhasil' }).catch(() => {})

    // Token JUGA dikembalikan di body → client simpan di localStorage dan
    // kirim via header Authorization (cookie bisa diblokir di iframe lintas-site).
    return NextResponse.json({
      success: true,
      token,
      admin: { id: admin.id, username: admin.username, name: admin.name },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')

    if (!token || !token.value) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyJWT(token.value)
    if (!payload) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      authenticated: true,
      admin: { id: payload.adminId, username: payload.username, name: payload.name },
    })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    // Log logout activity before clearing cookie
    await logActivity('LOGOUT', { description: 'Logout berhasil' })

    const { cookies } = await import('next/headers')
    const cookieStore = await cookies()
    cookieStore.delete('admin_token')

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan server' }, { status: 500 })
  }
}
