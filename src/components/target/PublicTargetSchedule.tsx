'use client'

// ─── Halaman Publik: Target & Jadwal (read-only, tanpa login) ───────────
// Menampilkan hasil breakdown Toko → Minggu → Hari → Zoning → Crew beserta
// roster jadwal shift. PENGATURAN tetap di Management → Target & Jadwal.
// Sumber data: /api/public/target-schedule (publik, read-only).

import { Fragment, useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Store, Layers, CalendarDays, ClipboardCheck, RefreshCw, CheckCircle2,
  XCircle, Info, CalendarOff, ShieldCheck,
} from 'lucide-react'
import { fmtRp, fmtNum, fadeIn, safeFetch, getWIBToday, getWIBDate, monthNames } from '@/lib/cms-utils'
import { shiftBadgeClass } from '@/components/management/TargetBreakdownPanel'
import type { BreakdownData, ScheduleData } from '@/lib/cms-types'
import { cn } from '@/lib/utils'

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

const scrollbarCls =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25'

const pad2 = (n: number) => String(n).padStart(2, '0')

function errMessage(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error?: unknown }).error
    if (typeof e === 'string' && e) return e
  }
  return 'Terjadi kesalahan'
}

type PublicPayload = { breakdown: BreakdownData; schedule: ScheduleData }

function VerifBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Seimbang
    </Badge>
  ) : (
    <Badge className="border-transparent bg-destructive text-white">
      <XCircle className="h-3 w-3" /> Selisih
    </Badge>
  )
}

function VerifRow({ label, value, equal }: { label: string; value: number; equal: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="font-semibold tabular-nums">{fmtRp(value)}</span>
        {equal ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        ) : (
          <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )}
      </span>
    </div>
  )
}

export default function PublicTargetSchedule() {
  const [loading, setLoading] = useState(true)
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null)
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)

  const d0 = getWIBDate()
  const [year, setYear] = useState(d0.getFullYear())
  const [month, setMonth] = useState(d0.getMonth() + 1) // 1-based
  const [focusDate, setFocusDate] = useState(getWIBToday())

  const load = useCallback(async (y: number, m: number, date: string) => {
    try {
      const res = await safeFetch(`/api/public/target-schedule?year=${y}&month=${m}&date=${date}`)
      const data: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(errMessage(data))
        return
      }
      const payload = data as PublicPayload
      setBreakdown(payload.breakdown)
      setSchedule(payload.schedule)
    } catch {
      toast.error('Koneksi bermasalah, coba lagi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const y = year
      const m = month
      const date = focusDate
      try {
        const res = await safeFetch(`/api/public/target-schedule?year=${y}&month=${m}&date=${date}`)
        const data: unknown = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok) {
          toast.error(errMessage(data))
          return
        }
        const payload = data as PublicPayload
        setBreakdown(payload.breakdown)
        setSchedule(payload.schedule)
      } catch {
        if (!cancelled) toast.error('Koneksi bermasalah, coba lagi')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [year, month, focusDate])

  const refreshAll = () => {
    setLoading(true)
    void (async () => {
      try {
        const res = await safeFetch(`/api/public/target-schedule?year=${year}&month=${month}&date=${focusDate}`)
        const data: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          toast.error(errMessage(data))
          return
        }
        const payload = data as PublicPayload
        setBreakdown(payload.breakdown)
        setSchedule(payload.schedule)
      } catch {
        toast.error('Koneksi bermasalah, coba lagi')
      } finally {
        setLoading(false)
      }
    })()
  }

  // ── Derived ──
  const bd = breakdown
  const engineActive = !!bd?.engineActive
  const weeksPcts = bd?.config?.weekPcts ?? [0, 0, 0, 0, 0]
  const dayPcts = bd?.config?.dayPcts && bd.config.dayPcts.length === 7 ? bd.config.dayPcts : []
  const currentWeek = bd?.focusWeek ?? 1

  // Crew tanpa satu pun shift di bulan terpilih
  const crewsWithoutShift = useMemo(() => {
    if (!schedule) return []
    const anyShift = new Set<string>()
    for (const s of schedule.shifts) {
      if (s.shiftCode) anyShift.add(s.crewId)
    }
    return schedule.crews.filter(c => !anyShift.has(c.id)).map(c => c.name)
  }, [schedule])

  // Grid jadwal: crew dikelompokkan per zoning
  const gridGroups = useMemo(() => {
    if (!schedule) return []
    const map = new Map<string, { id: string; name: string; crews: ScheduleData['crews'] }>()
    for (const c of schedule.crews) {
      if (!map.has(c.groupId)) map.set(c.groupId, { id: c.group.id, name: c.group.name, crews: [] })
      map.get(c.groupId)!.crews.push(c)
    }
    return Array.from(map.values())
  }, [schedule])

  const baseShiftMap = useMemo(() => {
    const m = new Map<string, string>()
    if (schedule) for (const s of schedule.shifts) m.set(`${s.crewId}|${s.tanggal}`, s.shiftCode || '')
    return m
  }, [schedule])

  const shiftLabelByCode = useMemo(() => {
    const m = new Map<string, string>()
    for (const st of bd?.shiftTypes ?? []) m.set(st.code, st.label)
    return m
  }, [bd?.shiftTypes])

  const dateOfDay = (day: number) => `${schedule?.year ?? year}-${pad2(schedule?.month ?? month)}-${pad2(day)}`

  return (
    <TabsContent value="target" className="mt-4 sm:mt-6 pb-24 md:pb-8">
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ── */}
      <motion.div {...fadeIn} transition={{ duration: 0.35 }}>
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                <CalendarDays className="h-5 w-5 text-[#E14227]" />
                Target &amp; Jadwal Crew
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> Publik
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                Breakdown target toko per minggu, hari, zoning &amp; crew beserta jadwal shift — diperbarui
                realtime, tanpa perlu login. Pengaturan hanya oleh admin di menu Management.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshAll}
              disabled={loading}
              className="h-11 w-full sm:h-9 sm:w-auto"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>

          {/* Filter bulan + tanggal fokus */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bulan</Label>
              <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
                <SelectTrigger className="h-11 sm:h-9" aria-label="Pilih bulan">
                  <SelectValue placeholder="Bulan" />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tahun</Label>
              <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="h-11 sm:h-9" aria-label="Pilih tahun">
                  <SelectValue placeholder="Tahun" />
                </SelectTrigger>
                <SelectContent>
                  {[year - 2, year - 1, year, year + 1, year + 2].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-focus" className="text-xs font-semibold">Lihat target tanggal</Label>
              <Input
                id="pub-focus"
                type="date"
                value={focusDate}
                onChange={e => setFocusDate(e.target.value)}
                className="h-11 sm:h-9"
              />
            </div>
          </div>
        </Card>
      </motion.div>

      {loading && !bd ? (
        <Card className="p-4 sm:p-6">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
            <Skeleton className="h-32 w-full" />
          </div>
        </Card>
      ) : !engineActive ? (
        <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.05 }}>
          <Card className="p-4 sm:p-6">
            <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <Info className="h-4 w-4" />
              <AlertTitle className="text-sm font-bold">Target belum dikonfigurasi</AlertTitle>
              <AlertDescription className="text-xs">
                {bd?.message ?? 'Admin belum mengatur target bulanan toko.'} Jadwal shift crew tetap bisa
                dilihat di bawah.
              </AlertDescription>
            </Alert>
          </Card>
        </motion.div>
      ) : null}

      {/* ── Ringkasan target ── */}
      {engineActive && bd?.store && bd.config && (
        <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.05 }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Store className="h-3.5 w-3.5 text-[#E14227]" /> Target Bulanan Toko
              </p>
              <p className="mt-1 text-xl font-black tabular-nums">{fmtRp(bd.store.monthlyTarget)}</p>
              <p className="text-[10px] text-muted-foreground">{monthNames[(bd.month - 1) % 12]} {bd.year}</p>
            </Card>
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-[#E14227]" /> Target {bd.focusDate} (M{bd.focusWeek})
              </p>
              <p className="mt-1 text-xl font-black tabular-nums">{fmtRp(bd.store.todayTarget)}</p>
              <p className="text-[10px] text-muted-foreground">Tanggal fokus · minggu ke-{bd.focusWeek}</p>
            </Card>
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3.5 w-3.5 text-[#E14227]" /> Target Minggu ke-{bd.focusWeek}
              </p>
              <p className="mt-1 text-xl font-black tabular-nums">{fmtRp(bd.store.weeklyTargets[bd.focusWeek - 1] ?? 0)}</p>
              <p className="text-[10px] text-muted-foreground">
                {bd.config.weekPcts[bd.focusWeek - 1] ?? 0}% dari target bulanan
              </p>
            </Card>
          </div>
        </motion.div>
      )}

      {/* ── Distribusi mingguan & harian ── */}
      {engineActive && bd?.config && (
        <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.1 }}>
          <Card className="p-4 sm:p-6">
            <CardHeader className="p-0 pb-3">
              <CardTitle className="text-base font-bold">Distribusi Target</CardTitle>
              <CardDescription>
                Persentase pembagian target bulanan ke tiap minggu dan bobot tiap hari (dinormalisasi otomatis
                per minggu — Σ target harian = target mingguan, 0 selisih).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
              <div>
                <p className="mb-1.5 text-xs font-semibold">Per Minggu</p>
                <div className="flex flex-wrap gap-1.5">
                  {bd.config.weekPcts.map((p, i) => (
                    <Badge
                      key={i}
                      variant={i + 1 === bd.focusWeek ? 'default' : 'secondary'}
                      className={cn('text-[11px] tabular-nums', i + 1 === bd.focusWeek && 'bg-[#E14227] text-white hover:bg-[#c93a21]')}
                      title={`Minggu ke-${i + 1}`}
                    >
                      M{i + 1}: {fmtNum(p)}% · {fmtRp(bd.store?.weeklyTargets[i] ?? 0)}
                    </Badge>
                  ))}
                </div>
              </div>
              {dayPcts.length === 7 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold">Bobot Per Hari (Senin–Minggu)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_NAMES.map((n, i) => (
                      <Badge key={n} variant="outline" className="text-[11px] tabular-nums">
                        {n.slice(0, 3)}: {fmtNum(dayPcts[i])}%
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Alokasi Zoning + Target crew hari fokus ── */}
      {engineActive && bd && bd.groups.length > 0 && (
        <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.15 }}>
          <Card className="p-4 sm:p-6">
            <CardHeader className="p-0 pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
                <Layers className="h-5 w-5 text-[#E14227]" />
                Target per Zoning &amp; Crew
              </CardTitle>
              <CardDescription>
                Target tanggal {bd.focusDate} (minggu ke-{bd.focusWeek}). Target harian crew mengikuti bobot
                shift — crew Off / belum dijadwalkan mendapat Rp0 hari itu dan porsinya dialihkan ke crew
                yang ber-shift. Target <b>mingguan &amp; bulanan crew = target zoning ÷ jumlah crew</b> (sama rata).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-0">
              {bd.groups.map(g => (
                <div key={g.id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{g.name}</span>
                      <Badge variant="secondary" className="text-[10px] tabular-nums">
                        Alokasi {fmtNum(g.allocationPct)}%
                      </Badge>
                      {g.unassignedToday > 0 && (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <CalendarOff className="h-3 w-3" /> {fmtRp(g.unassignedToday)} tak terdistribusi
                        </Badge>
                      )}
                    </div>
                    <div className="text-right text-[11px] leading-tight">
                      <p>Hari: <b className="tabular-nums">{fmtRp(g.todayTarget)}</b></p>
                      <p className="text-muted-foreground">Bulan: <span className="tabular-nums">{fmtRp(g.monthlyTarget)}</span></p>
                    </div>
                  </div>
                  <div className="divide-y">
                    {g.crews.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">Belum ada crew di zoning ini.</p>
                    ) : (
                      g.crews.map(c => (
                        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                          <div className="min-w-0 flex-1 basis-40">
                            <p className="truncate text-sm font-semibold">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{c.employeeId}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {c.shiftCode ? (
                              <Badge className={cn('border-transparent text-[10px] font-bold', shiftBadgeClass(c.shiftCode))}>
                                {c.shiftCode}{c.shiftLabel ? ` · ${c.shiftLabel}` : ''}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">– belum dijadwalkan</Badge>
                            )}
                            {c.shiftCode && (
                              <span className="text-[10px] tabular-nums text-muted-foreground">×{fmtNum(c.shiftWeight)}</span>
                            )}
                          </div>
                          <div className="ml-auto text-right text-[11px] leading-tight">
                            <p>Hari: <b className="tabular-nums">{fmtRp(c.todayTarget)}</b></p>
                            <p className="text-muted-foreground">
                              Minggu: <span className="tabular-nums">{fmtRp(c.weeklyTarget)}</span> · Bulan:{' '}
                              <span className="tabular-nums">{fmtRp(c.monthlyTarget)}</span>
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}

              {/* Verifikasi Σ */}
              {bd.checks && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold">
                      <ClipboardCheck className="h-4 w-4 text-[#E14227]" /> Verifikasi Σ (Σ Crew = Σ Zoning = Toko)
                    </p>
                    <div className="flex gap-1.5">
                      <VerifBadge ok={bd.checks.today.balanced} />
                      <VerifBadge ok={bd.checks.monthly.balanced} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Per tanggal {bd.focusDate}</p>
                      <VerifRow label="Σ Target Crew" value={bd.checks.today.sumCrew} equal={bd.checks.today.balanced} />
                      <VerifRow label="Σ Target Zoning" value={bd.checks.today.sumGroup} equal={bd.checks.today.balanced} />
                      <VerifRow label="Target Toko" value={bd.checks.today.store} equal={bd.checks.today.balanced} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Per bulan</p>
                      <VerifRow label="Σ Target Crew" value={bd.checks.monthly.sumCrew} equal={bd.checks.monthly.balanced} />
                      <VerifRow label="Σ Target Zoning" value={bd.checks.monthly.sumGroup} equal={bd.checks.monthly.balanced} />
                      <VerifRow label="Target Toko" value={bd.checks.monthly.store} equal={bd.checks.monthly.balanced} />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Jadwal shift bulan ini (read-only) ── */}
      <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.2 }}>
        <Card className="p-4 sm:p-6">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base font-bold">
              <CalendarDays className="h-5 w-5 text-[#E14227]" />
              Jadwal Shift Crew — {monthNames[(month - 1) % 12]} {year}
            </CardTitle>
            <CardDescription>
              Roster shift operasional. Ganti bulan/tahun di kartu atas untuk melihat periode lain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            {/* Legend */}
            {(bd?.shiftTypes ?? []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Kode:</span>
                {(bd?.shiftTypes ?? []).filter(st => st.isActive).map(st => (
                  <Badge key={st.code} className={cn('border-transparent text-[10px] font-bold', shiftBadgeClass(st.code))}>
                    {st.code} · {st.label} (×{fmtNum(st.weight)})
                  </Badge>
                ))}
                <Badge variant="outline" className="text-[10px] text-muted-foreground">– kosong</Badge>
              </div>
            )}

            {!schedule || schedule.crews.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                Belum ada crew terdaftar.
              </p>
            ) : (
              <div className={cn('max-h-[28rem] overflow-auto rounded-lg border', scrollbarCls)}>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 min-w-[130px] border-b bg-background px-2 py-2 text-left font-bold">
                        Crew
                      </th>
                      <th className="sticky left-[130px] z-20 min-w-[86px] border-b bg-background px-2 py-2 text-left font-bold">
                        Zoning
                      </th>
                      {Array.from({ length: schedule.daysInMonth }, (_, i) => (
                        <th key={i + 1} className="min-w-[32px] border-b bg-background px-1 py-2 text-center font-semibold text-muted-foreground">
                          {i + 1}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gridGroups.map(g => (
                      <Fragment key={g.id}>
                        {g.crews.map((c, ci) => (
                          <tr key={c.id} className="border-b last:border-b-0">
                            <td className={cn('sticky left-0 z-10 bg-background px-2 py-1.5', ci === 0 && 'border-t')}>
                              <p className="max-w-[120px] truncate text-[11px] font-semibold">{c.name}</p>
                              <p className="text-[9px] text-muted-foreground">{c.employeeId}</p>
                            </td>
                            <td className={cn('sticky left-[130px] z-10 bg-background px-2 py-1.5', ci === 0 && 'border-t')}>
                              <Badge variant="secondary" className="max-w-[80px] truncate text-[9px]">{g.name}</Badge>
                            </td>
                            {Array.from({ length: schedule.daysInMonth }, (_, i) => {
                              const day = i + 1
                              const code = baseShiftMap.get(`${c.id}|${dateOfDay(day)}`) || ''
                              return (
                                <td key={day} className={cn('px-0.5 py-1.5 text-center', ci === 0 && 'border-t')}>
                                  {code ? (
                                    <span
                                      className={cn('inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold', shiftBadgeClass(code))}
                                      title={shiftLabelByCode.get(code) ?? code}
                                    >
                                      {code}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40">–</span>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {crewsWithoutShift.length > 0 && (
              <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <CalendarOff className="h-4 w-4" />
                <AlertTitle className="text-sm font-bold">Crew tanpa jadwal bulan ini</AlertTitle>
                <AlertDescription className="text-xs">
                  {crewsWithoutShift.join(', ')} — belum punya satu pun shift di {monthNames[(month - 1) % 12]}.
                  Target harian crew ini Rp0 setiap hari (porsinya dialihkan ke crew yang terjadwal sesuai
                  bobot), namun target <b>mingguan &amp; bulanan tetap sama rata</b> dengan crew lain di
                  zoning-nya (target zoning ÷ jumlah crew). Atur jadwal di Management → Target &amp; Jadwal.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
    </TabsContent>
  )
}
