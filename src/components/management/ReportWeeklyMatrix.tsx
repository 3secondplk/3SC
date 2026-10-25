'use client'

// ─────────────────────────────────────────────────────────
// ReportWeeklyMatrix — Laporan mingguan per Zoning/Group &
// Crew, mengikuti format sheet toko:
//
//   Tabel 1 (MATRIX): per crew × Week 1–5 → QTY | NETTO | TARGET | ACV
//                     + TOTAL + baris TOTAL ZONING.
//   Tabel 2 (DEPT)  : grid tabel per crew per minggu → DEPT | QTY | NETTO.
//
// Read/query layer murni — data dari
// /api/management/report/weekly-matrix (penjualan terklaim + engine target).
// ─────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { FileBarChart, RefreshCw, AlertTriangle, CalendarDays, Layers } from 'lucide-react'
import { fmtNum, monthNames, getWIBToday, safeFetch, fadeIn } from '@/lib/cms-utils'
import { motion } from 'framer-motion'

// ─── Types (sesuai response API weekly-matrix) ───────────
interface WeekCell { qty: number; netto: number; target: number; acv: number }

interface MatrixCrew {
  crewId: string
  name: string
  employeeId: string
  weeks: WeekCell[]
  total: WeekCell
}

interface MatrixGroup {
  groupId: string
  groupName: string
  crewCount: number
  monthlyTarget: number
  crews: MatrixCrew[]
  totalRow: { weeks: WeekCell[]; total: WeekCell }
  deptList: string[]
  deptDetails: Array<{
    crewId: string
    name: string
    weeks: Array<{ week: number; rows: Array<{ dept: string; qty: number; netto: number }> }>
  }>
}

interface MatrixData {
  year: number
  month: number
  monthName: string
  engineActive: boolean
  currentWeek: number | null
  weeks: Array<{ week: number; dateFrom: string; dateTo: string; label: string; days: number }>
  groups: MatrixGroup[]
}

// ─── ACV color (tanpa biru/indigo — palet brand) ─────────
function acvClass(acv: number): string {
  if (acv >= 100) return 'text-emerald-600 dark:text-emerald-400 font-bold'
  if (acv >= 70) return 'text-amber-600 dark:text-amber-400 font-semibold'
  if (acv > 0) return 'text-red-500 dark:text-red-400 font-semibold'
  return 'text-muted-foreground'
}

interface ReportWeeklyMatrixProps {
  /** Base URL API weekly-matrix — default '/api/management/report/weekly-matrix' (admin).
   *  Halaman Laporan publik memakai '/api/public/report/weekly-matrix'. */
  apiBase?: string
}

const ReportWeeklyMatrix = React.memo(function ReportWeeklyMatrix({ apiBase = '/api/management/report/weekly-matrix' }: ReportWeeklyMatrixProps = {}) {
  const today = getWIBToday() // yyyy-mm-dd (WIB)

  // ─── Filter state (auto-fetch saat berubah) ───
  const [groupId, setGroupId] = useState('') // '' = semua zoning
  const [month, setMonth] = useState(Number(today.slice(5, 7))) // 1–12
  const [year, setYear] = useState(Number(today.slice(0, 4)))

  // ─── Data state ───
  const [data, setData] = useState<MatrixData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ─── Filter tabel dept ───
  const [deptCrewId, setDeptCrewId] = useState('') // '' = semua crew
  const [deptWeek, setDeptWeek] = useState(0) // 0 = semua minggu

  // ─── Fetch ───
  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (groupId) params.set('groupId', groupId)
      params.set('month', String(month))
      params.set('year', String(year))
      const res = await safeFetch(`${apiBase}?${params.toString()}`)
      if (res.ok) {
        setData(await res.json())
      } else {
        let msg = 'Gagal memuat laporan mingguan'
        try {
          const d = await res.json()
          if (d?.error) msg = d.error
        } catch { /* ignore */ }
        setError(msg)
        setData(null)
      }
    } catch (err) {
      console.error('Failed to fetch weekly matrix:', err)
      setError('Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [apiBase, groupId, month, year])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset filter dept saat scope bulan/zoning berubah
  useEffect(() => {
    setDeptCrewId('')
    setDeptWeek(0)
  }, [groupId, month, year])

  const yearOptions = useMemo(() => {
    const list: number[] = []
    for (let y = year + 1; y >= year - 3; y--) list.push(y)
    return list
  }, [year])

  // Opsi crew untuk filter tabel dept (dari data aktif)
  const deptCrewOptions = useMemo(() => {
    if (!data) return []
    const out: Array<{ id: string; name: string }> = []
    for (const g of data.groups) {
      for (const c of g.crews) out.push({ id: c.crewId, name: c.name })
    }
    return out
  }, [data])

  // Daftar tabel dept setelah filter crew/minggu
  const deptTables = useMemo(() => {
    if (!data) return []
    const out: Array<{
      key: string; crewName: string; week: number; weekLabel: string
      groupName: string; rows: Array<{ dept: string; qty: number; netto: number }>
    }> = []
    for (const g of data.groups) {
      for (const c of g.deptDetails) {
        if (deptCrewId && c.crewId !== deptCrewId) continue
        for (const w of c.weeks) {
          if (deptWeek && w.week !== deptWeek) continue
          const wm = data.weeks.find(x => x.week === w.week)
          out.push({
            key: `${g.groupId}|${c.crewId}|${w.week}`,
            crewName: c.name,
            week: w.week,
            weekLabel: wm?.label || `Minggu ${w.week}`,
            groupName: g.groupName,
            rows: w.rows,
          })
        }
      }
    }
    return out
  }, [data, deptCrewId, deptWeek])

  const hasAnyCrew = (data?.groups ?? []).some(g => g.crews.length > 0)

  return (
    <motion.div {...fadeIn} className="space-y-4">
      {/* ═══ HEADER + FILTER ═══ */}
      <Card className="glass-stat border-border/40">
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E14227] to-[#D4956B] shadow-lg shadow-[#E14227]/20 flex items-center justify-center shrink-0">
                <FileBarChart className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg tracking-tight">Laporan Mingguan per Zoning</h3>
                <p className="text-xs text-muted-foreground">
                  Achievement QTY · NETTO · TARGET · ACV per crew — Week 1–5 + detail dept
                </p>
              </div>
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={fetchData} aria-label="Refresh laporan mingguan">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Zoning */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Zoning / Group</label>
              <Select value={groupId || '__all__'} onValueChange={(v) => setGroupId(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-10 w-full" aria-label="Pilih zoning">
                  <SelectValue placeholder="Semua Zoning" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Semua Zoning</SelectItem>
                  {(data?.groups ?? []).map(g => (
                    <SelectItem key={g.groupId} value={g.groupId}>{g.groupName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Bulan */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Bulan</label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-10 w-full" aria-label="Pilih bulan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Tahun */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Tahun</label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-10 w-full" aria-label="Pilih tahun">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0">
              ACV = NETTO ÷ TARGET
            </Badge>
            {data?.currentWeek && (
              <Badge className="text-[9px] font-mono px-1.5 py-0 bg-[#E14227]/10 text-[#E14227] border-[#E14227]/30" variant="outline">
                Minggu berjalan: W{data.currentWeek}
              </Badge>
            )}
            {data?.engineActive && (
              <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                Target: engine realtime
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ═══ LOADING / ERROR / EMPTY ═══ */}
      {loading && (
        <Card className="glass-stat border-border/40">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      )}

      {!loading && error && (
        <Card className="glass-stat border-destructive/40">
          <CardContent className="p-6 text-center space-y-3">
            <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive font-medium">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Coba Lagi
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && data.groups.length === 0 && (
        <Card className="glass-stat border-border/40">
          <CardContent className="p-8 text-center">
            <Layers className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada Zoning/Group terdaftar.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && data && data.groups.length > 0 && !hasAnyCrew && (
        <Card className="glass-stat border-border/40">
          <CardContent className="p-8 text-center">
            <CalendarDays className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Belum ada crew di zoning yang dipilih.</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ TABEL 1 — MATRIX ACHIEVEMENT PER ZONING ═══ */}
      {!loading && !error && data && data.groups.map((g) => (
        <Card key={g.groupId} className="glass-stat border-border/40 overflow-hidden">
          <CardContent className="p-4 sm:p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge className="bg-[#E14227] text-white font-bold tracking-wide">ZONING</Badge>
                <h4 className="font-bold text-sm sm:text-base truncate">{g.groupName}</h4>
                <span className="text-xs text-muted-foreground">· {data.monthName} {data.year} · {g.crewCount} crew</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Target Zoning: <span className="font-semibold text-foreground tabular-nums">Rp{fmtNum(g.monthlyTarget)}</span>
              </span>
            </div>

            {g.crews.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">Belum ada crew di zoning ini.</p>
            ) : (
              <div className="overflow-x-auto -mx-1 px-1 pb-1">
                <Table className="min-w-[860px] text-xs">
                  <TableHeader>
                    {/* Baris 1: NAMA + grup kolom WEEK + TOTAL */}
                    <TableRow className="hover:bg-transparent">
                      <TableHead rowSpan={2} className="align-middle bg-muted/70 border border-border/60 text-center font-bold uppercase tracking-wider min-w-[130px]">
                        Nama
                      </TableHead>
                      {data.weeks.map((wm) => (
                        <TableHead
                          key={`wh-${wm.week}`}
                          colSpan={4}
                          className={`text-center font-bold uppercase tracking-wider border border-border/60 ${
                            data.currentWeek === wm.week ? 'bg-[#E14227]/15 text-[#E14227]' : 'bg-muted/70'
                          }`}
                        >
                          Week {wm.week} <span className="font-normal normal-case opacity-70">({wm.label})</span>
                        </TableHead>
                      ))}
                      <TableHead colSpan={3} className="text-center font-bold uppercase tracking-wider bg-muted/70 border border-border/60">
                        Total
                      </TableHead>
                    </TableRow>
                    {/* Baris 2: sub-kolom */}
                    <TableRow className="hover:bg-transparent">
                      {data.weeks.map((wm) => (
                        <React.Fragment key={`sh-${wm.week}`}>
                          <TableHead className="text-right border border-border/60 bg-muted/40 px-2">Qty</TableHead>
                          <TableHead className="text-right border border-border/60 bg-muted/40 px-2">Netto</TableHead>
                          <TableHead className="text-right border border-border/60 bg-muted/40 px-2">Target</TableHead>
                          <TableHead className="text-right border border-border/60 bg-muted/40 px-2">ACV</TableHead>
                        </React.Fragment>
                      ))}
                      <TableHead className="text-right border border-border/60 bg-muted/40 px-2">Qty</TableHead>
                      <TableHead className="text-right border border-border/60 bg-muted/40 px-2">Netto</TableHead>
                      <TableHead className="text-right border border-border/60 bg-muted/40 px-2">ACV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.crews.map((c) => (
                      <TableRow key={c.crewId}>
                        <TableCell className="border border-border/40 font-semibold sticky left-0 bg-card min-w-[130px]">
                          <div className="truncate">{c.name}</div>
                          <div className="text-[9px] text-muted-foreground font-normal">{c.employeeId}</div>
                        </TableCell>
                        {c.weeks.map((w, i) => (
                          <React.Fragment key={`${c.crewId}-w${i}`}>
                            <TableCell className={`border border-border/40 text-right tabular-nums px-2 ${data.currentWeek === i + 1 ? 'bg-[#E14227]/[0.04]' : ''}`}>
                              {fmtNum(w.qty)}
                            </TableCell>
                            <TableCell className={`border border-border/40 text-right tabular-nums px-2 ${data.currentWeek === i + 1 ? 'bg-[#E14227]/[0.04]' : ''}`}>
                              {fmtNum(w.netto)}
                            </TableCell>
                            <TableCell className={`border border-border/40 text-right tabular-nums px-2 text-muted-foreground ${data.currentWeek === i + 1 ? 'bg-[#E14227]/[0.04]' : ''}`}>
                              {fmtNum(w.target)}
                            </TableCell>
                            <TableCell className={`border border-border/40 text-right tabular-nums px-2 ${acvClass(w.acv)} ${data.currentWeek === i + 1 ? 'bg-[#E14227]/[0.04]' : ''}`}>
                              {w.acv}%
                            </TableCell>
                          </React.Fragment>
                        ))}
                        <TableCell className="border border-border/40 text-right tabular-nums font-semibold px-2">{fmtNum(c.total.qty)}</TableCell>
                        <TableCell className="border border-border/40 text-right tabular-nums font-semibold px-2">{fmtNum(c.total.netto)}</TableCell>
                        <TableCell className={`border border-border/40 text-right tabular-nums px-2 ${acvClass(c.total.acv)}`}>{c.total.acv}%</TableCell>
                      </TableRow>
                    ))}
                    {/* TOTAL ZONING */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell className="border border-border/60 uppercase text-[10px] tracking-wider sticky left-0 bg-muted/50 min-w-[130px]">
                        Total {g.groupName}
                      </TableCell>
                      {g.totalRow.weeks.map((w, i) => (
                        <React.Fragment key={`tz-${i}`}>
                          <TableCell className="border border-border/60 text-right tabular-nums px-2">{fmtNum(w.qty)}</TableCell>
                          <TableCell className="border border-border/60 text-right tabular-nums px-2">{fmtNum(w.netto)}</TableCell>
                          <TableCell className="border border-border/60 text-right tabular-nums px-2 text-muted-foreground">{fmtNum(w.target)}</TableCell>
                          <TableCell className={`border border-border/60 text-right tabular-nums px-2 ${acvClass(w.acv)}`}>{w.acv}%</TableCell>
                        </React.Fragment>
                      ))}
                      <TableCell className="border border-border/60 text-right tabular-nums px-2">{fmtNum(g.totalRow.total.qty)}</TableCell>
                      <TableCell className="border border-border/60 text-right tabular-nums px-2">{fmtNum(g.totalRow.total.netto)}</TableCell>
                      <TableCell className={`border border-border/60 text-right tabular-nums px-2 ${acvClass(g.totalRow.total.acv)}`}>{g.totalRow.total.acv}%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* ═══ TABEL 2 — DETAIL DEPT PER CREW PER MINGGU ═══ */}
      {!loading && !error && data && hasAnyCrew && (
        <Card className="glass-stat border-border/40">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-sm sm:text-base tracking-tight">Detail Dept per Crew per Minggu</h4>
                <p className="text-xs text-muted-foreground">
                  QTY &amp; NETTO per kategori dept — {data.monthName} {data.year}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={deptCrewId || '__all__'}
                  onValueChange={(v) => setDeptCrewId(v === '__all__' ? '' : v)}
                >
                  <SelectTrigger className="h-9 w-[170px] text-xs" aria-label="Filter crew detail dept">
                    <SelectValue placeholder="Semua Crew" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua Crew</SelectItem>
                    {deptCrewOptions.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={String(deptWeek || '__all__')}
                  onValueChange={(v) => setDeptWeek(v === '__all__' ? 0 : Number(v))}
                >
                  <SelectTrigger className="h-9 w-[140px] text-xs" aria-label="Filter minggu detail dept">
                    <SelectValue placeholder="Semua Minggu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua Minggu</SelectItem>
                    {data.weeks.map(wm => (
                      <SelectItem key={wm.week} value={String(wm.week)}>Week {wm.week}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {deptTables.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Tidak ada data untuk filter crew/minggu ini.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {deptTables.map((t) => {
                  const hasData = t.rows.some(r => r.qty > 0 || r.netto > 0)
                  return (
                    <div key={t.key} className={`rounded-xl border border-border/50 overflow-hidden ${hasData ? '' : 'opacity-60'}`}>
                      <div className="bg-muted/70 px-3 py-2 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#E14227]">Week {t.week}</p>
                        <p className="text-xs font-semibold truncate">{t.crewName}</p>
                        <p className="text-[9px] text-muted-foreground">{t.groupName} · {t.weekLabel}</p>
                      </div>
                      <div className="max-h-[380px] overflow-y-auto">
                        <Table className="text-[11px]">
                          <TableHeader className="sticky top-0 z-10">
                            <TableRow className="hover:bg-transparent bg-card">
                              <TableHead className="h-7 py-1 text-[9px] uppercase tracking-wider">Dept</TableHead>
                              <TableHead className="h-7 py-1 text-[9px] uppercase tracking-wider text-right">Qty</TableHead>
                              <TableHead className="h-7 py-1 text-[9px] uppercase tracking-wider text-right">Netto</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {t.rows.map((r) => (
                              <TableRow key={`${t.key}-${r.dept}`} className={r.qty > 0 || r.netto > 0 ? '' : 'text-muted-foreground/60'}>
                                <TableCell className="py-1 font-medium truncate max-w-[130px]">{r.dept}</TableCell>
                                <TableCell className="py-1 text-right tabular-nums">{fmtNum(r.qty)}</TableCell>
                                <TableCell className="py-1 text-right tabular-nums">{fmtNum(r.netto)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
})

export default ReportWeeklyMatrix
