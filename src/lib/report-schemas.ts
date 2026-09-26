import { z } from 'zod'

// ─────────────────────────────────────────────────────────
// Zod schemas — validasi query param Report & Export.
// Semua API report/export WAJIB memvalidasi input lewat sini
// sebelum menyentuh database.
// ─────────────────────────────────────────────────────────

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')

const idStr = z
  .string()
  .trim()
  .max(64, 'ID terlalu panjang')
  .regex(/^[a-zA-Z0-9_-]*$/, 'ID mengandung karakter tidak valid')

/** GET /api/management/report */
export const reportQuerySchema = z
  .object({
    crewId: idStr.optional().default(''),
    groupId: idStr.optional().default(''),
    dateFrom: dateStr.optional().default(''),
    dateTo: dateStr.optional().default(''),
    search: z.string().trim().max(100).optional().default(''),
    page: z.coerce.number().int().min(1).max(1_000_000).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  })
  .refine((d) => !d.dateFrom || !d.dateTo || d.dateFrom <= d.dateTo, {
    message: 'Tanggal "Dari" tidak boleh lebih besar dari tanggal "Sampai"',
    path: ['dateFrom'],
  })

export type ReportQuery = z.infer<typeof reportQuerySchema>

/**
 * GET /api/export
 * scope:
 *  - (kosong/legacy) → pakai crewId/groupId apa adanya (kompatibel caller lama)
 *  - 'zoning'        → wajib groupId, crewId diabaikan (semua crew di zoning itu)
 *  - 'crew'          → wajib crewId (groupId opsional, diverifikasi ownership)
 *  - 'all'           → abaikan crewId/groupId, semua data dalam rentang tanggal
 * claimedOnly: '1' → hanya penjualan yang sudah diklaim crew (semantik Report)
 */
export const exportQuerySchema = z
  .object({
    scope: z.enum(['zoning', 'crew', 'all']).optional(),
    crewId: idStr.optional().default(''),
    groupId: idStr.optional().default(''),
    dateFrom: dateStr.optional().default(''),
    dateTo: dateStr.optional().default(''),
    claimedOnly: z.enum(['0', '1']).optional().default('0'),
    format: z.string().max(20).optional().default(''),
    filename: z.string().trim().max(120).optional().default(''),
    // month/year → konteks laporan mingguan utk workbook XLSX multi-sheet
    // (sheet "Laporan Zoning-Grup" & "Laporan Per Dept"). Bila kosong,
    // diambil dari bulan dateFrom, atau bulan WIB berjalan.
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .refine((d) => !d.dateFrom || !d.dateTo || d.dateFrom <= d.dateTo, {
    message: 'Tanggal "Dari" tidak boleh lebih besar dari tanggal "Sampai"',
    path: ['dateFrom'],
  })

export type ExportQuery = z.infer<typeof exportQuerySchema>

/**
 * GET /api/management/report/weekly-matrix
 * Laporan achievement mingguan per crew (QTY/NETTO/TARGET/ACV per Week 1–5)
 * + detail per dept per crew per minggu.
 * groupId kosong = semua zoning. month 1–12 & year opsional (default bulan WIB berjalan).
 */
export const weeklyMatrixQuerySchema = z.object({
  groupId: idStr.optional().default(''),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export type WeeklyMatrixQuery = z.infer<typeof weeklyMatrixQuerySchema>

/** Ambil pesan error pertama dari ZodError (v4: issues) */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message || 'Parameter tidak valid'
}
