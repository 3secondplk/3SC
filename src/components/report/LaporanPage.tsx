'use client'

// ─────────────────────────────────────────────────────────
// LaporanPage — HALAMAN LAPORAN SENDIRI (top-level tab, AKSES PUBLIK)
//
// Halaman mandiri yang bisa dibuka siapa saja TANPA login. Sesuai
// pembaruan tampilan, halaman ini cukup menampilkan:
//
//   1. Laporan Mingguan per Zoning (matrix crew × Week 1–5 ACV)
//   2. Detail Dept per Crew per Minggu
//
// Aturan tampil (pembaruan):
//   • Data TIDAK dimuat semuanya sekaligus — user WAJIB memilih
//     Zoning terlebih dahulu (requireZoning), baru laporan tampil.
//   • Filter crew bersifat OPSIONAL (bisa difilter per crew).
//   • Export Excel multi-sheet (All Data / Laporan Zoning-Grup /
//     Laporan Per Dept) via tombol "Export Excel".
//
// Sumber data (semua PUBLIK, read-only, rate-limit per IP):
//   GET /api/public/report/meta            — daftar zoning (opsi filter)
//   GET /api/public/report/weekly-matrix   — laporan mingguan
//   GET /api/public/report/export          — export XLSX 3 sheet (claimedOnly dipaksa 1)
//
// Data sensitif (penjualan belum diklaim, target internal admin,
// migrasi data, log aktivitas) TETAP hanya bisa diakses admin.
// ─────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FileBarChart, Globe, AlertTriangle, RefreshCw } from 'lucide-react'
import { safeFetch, fadeIn, stagger } from '@/lib/cms-utils'
import type { Group } from '@/lib/cms-types'
import ReportWeeklyMatrix from '@/components/management/ReportWeeklyMatrix'

interface PublicMeta {
  groups: Array<{ id: string; name: string }>
  crews: Array<{ id: string; name: string; employeeId: string; photo: string | null; groupId: string }>
}

const LaporanPage = React.memo(function LaporanPage() {
  const [metaLoading, setMetaLoading] = useState(true)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [groups, setGroups] = useState<Group[]>([])

  // ─── Fetch daftar zoning (publik) — opsi dropdown wajib pilih zoning ───
  const fetchMeta = useCallback(async () => {
    setMetaLoading(true)
    setMetaError(null)
    try {
      const res = await safeFetch('/api/public/report/meta')
      if (!res.ok) {
        let msg = 'Gagal memuat data filter'
        try {
          const d = await res.json()
          if (d?.error) msg = d.error
        } catch { /* ignore parse error */ }
        setMetaError(msg)
        return
      }
      const data: PublicMeta = await res.json()
      // Map ke tipe Group minimal yang dipakai komponen report
      setGroups((data.groups || []).map(g => ({
        id: g.id,
        name: g.name,
        logo: null,
        monthlyTarget: 0,
        week1Target: 0, week2Target: 0, week3Target: 0, week4Target: 0, week5Target: 0,
        tiktokActive: false,
        crewCount: 0,
        crews: [],
      })))
    } catch {
      setMetaError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.')
    } finally {
      setMetaLoading(false)
    }
  }, [])

  useEffect(() => { fetchMeta() }, [fetchMeta])

  return (
    <TabsContent value="laporan" className="mt-4 sm:mt-6 pb-24 md:pb-8">
      {/* ═══ PAGE HEADER — halaman sendiri, akses publik ═══ */}
      <motion.div {...fadeIn} className="mb-4">
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-[#E14227] via-[#B8321E] to-[#7E95B3] p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center shadow-lg shrink-0">
                <FileBarChart className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-bold text-white leading-tight">Laporan Mingguan per Zoning</h2>
                  <Badge className="border-transparent bg-white/20 text-white text-[9px] px-1.5 py-0 gap-1">
                    <Globe className="w-2.5 h-2.5" /> Akses Publik
                  </Badge>
                </div>
                <p className="text-[11px] sm:text-xs text-white/80 mt-0.5">
                  Laporan Mingguan per Zoning &amp; Detail Dept per Crew per Minggu — pilih zoning, lalu akses &amp; export tanpa login
                </p>
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ═══ CONTENT — hanya Laporan Mingguan + Detail Dept ═══ */}
      {metaLoading ? (
        <motion.div {...stagger} className="space-y-5">
          <Card className="border-0 shadow-lg glass-card">
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg glass-card">
            <CardContent className="p-4">
              <div className="space-y-2">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <Skeleton key={i} className="h-10 w-full rounded" />
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : metaError ? (
        <motion.div {...fadeIn}>
          <Card className="border-0 shadow-lg bg-destructive/5 dark:bg-destructive/10">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-destructive/15 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-destructive">Gagal memuat halaman laporan</p>
                    <p className="text-[11px] text-muted-foreground truncate">{metaError}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { toast.promise(fetchMeta(), { loading: 'Memuat ulang...', success: 'Berhasil dimuat', error: 'Gagal memuat' }) }}
                  className="text-xs shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Coba Lagi
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <ReportWeeklyMatrix
          apiBase="/api/public/report/weekly-matrix"
          exportBase="/api/public/report/export"
          requireZoning
          zoningOptions={groups.map(g => ({ id: g.id, name: g.name }))}
        />
      )}
    </TabsContent>
  )
})

export default LaporanPage
