// ─────────────────────────────────────────────────────────
// In-memory sliding-window rate limiter (local memory cache).
// Tidak pakai middleware eksternal (Redis/dll) — sesuai arsitektur app.
//
// Dipakai untuk melindungi API Report & Export dari spam request
// (export streaming itu berat — harus dibatasi per admin).
// ─────────────────────────────────────────────────────────

const buckets = new Map<string, number[]>()

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

/**
 * Sliding-window rate limiter.
 * @param key      identifier unik (mis. `export:<adminId>`)
 * @param limit    maksimum request dalam window
 * @param windowMs panjang window (ms)
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const arr = buckets.get(key) ?? []
  const fresh = arr.filter((ts) => now - ts < windowMs)

  if (fresh.length >= limit) {
    const oldest = fresh[0]
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    }
  }

  fresh.push(now)
  buckets.set(key, fresh)

  // Opportunistic cleanup — cegah kebocoran memori jangka panjang
  if (buckets.size > 500) {
    for (const [k, v] of buckets) {
      const alive = v.filter((ts) => now - ts < windowMs)
      if (alive.length === 0) buckets.delete(k)
      else buckets.set(k, alive)
    }
  }

  return { ok: true, remaining: limit - fresh.length, retryAfterSec: 0 }
}

/** Ambil identitas caller untuk rate-limit key: adminId > IP */
export function rateLimitKey(prefix: string, adminId: string | null | undefined, ip: string | null): string {
  return `${prefix}:${adminId || ip || 'anonymous'}`
}
