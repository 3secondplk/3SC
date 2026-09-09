import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import * as crypto from 'crypto'

// ─── Shared JWT utility extracted from auth/route.ts ───
const JWT_SECRET = process.env.NEXT_AUTH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'cms-crew-dev-secret-local-only')

export interface JWTPayload {
  adminId: string
  username: string
  name: string
  iat: number
  exp: number
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

/**
 * Ambil token dari Authorization header (Bearer) ATAU cookie admin_token.
 *
 * PENTING: cookie saja TIDAK cukup — saat app di-embed dalam iframe
 * lintas-site (preview panel), browser memblokir third-party cookies,
 * sehingga login berhasil tapi cookie tidak pernah terkirim (401 terus).
 * Karena itu client menyimpan token di localStorage dan mengirimnya via
 * header Authorization pada setiap request (fallback: cookie).
 */
export async function getAuthenticatedUser(): Promise<JWTPayload | null> {
  try {
    // 1) Authorization: Bearer <token> (utama — aman di iframe/proxy)
    try {
      const h = await headers()
      const authz = h.get('authorization')
      if (authz && authz.toLowerCase().startsWith('bearer ')) {
        const token = authz.slice(7).trim()
        if (token) {
          const payload = verifyJWT(token)
          if (payload) return payload
        }
      }
    } catch { /* headers() tidak tersedia — lanjut ke cookie */ }

    // 2) Fallback: cookie admin_token
    const cookieStore = await cookies()
    const token = cookieStore.get('admin_token')
    if (!token || !token.value) return null
    return verifyJWT(token.value)
  } catch {
    return null
  }
}

/**
 * Require authentication — returns payload or null.
 * Usage:
 *   const user = await requireAuth()
 *   if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
 */
export async function requireAuth(): Promise<JWTPayload | null> {
  return getAuthenticatedUser()
}

/** Helper: return a 401 response */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
