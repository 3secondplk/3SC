'use client'

// ─── Target Breakdown Panel (Toko → Zoning → Shift → Crew) ─────────────
// Panel konfigurasi + roster + preview realtime untuk engine target 3SC.
// Semua fetch via safeFetch; hasil diverifikasi Σ Crew = Σ Group = Toko.

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Store, Layers, Scale, CalendarDays, ClipboardCheck, Save, Loader2,
  Plus, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Info, Eraser, ListChecks,
} from 'lucide-react'
import { fmtRp, fmtNum, fadeIn, safeFetch, getWIBDate, getWIBToday, monthNames } from '@/lib/cms-utils'
import { allocateByWeights } from '@/lib/target-engine'
import type {
  BreakdownData, GroupAllocationItem, ScheduleData, ShiftTypeItem, StoreConfigData,
} from '@/lib/cms-types'
import { cn } from '@/lib/utils'

// ─── Constants & small helpers ──────────────────────────────────────────

const SESSION_MSG = 'Sesi berakhir, silakan login ulang'

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const DEFAULT_DAY_PCTS = [3, 3, 3, 3, 3, 4.5, 4.5]

// Config default saat install baru (tabel StoreConfig masih kosong — mis. deploy
// Vercel tanpa seed): form tetap terisi dan tombol Simpan langsung aktif.
// PUT /api/store-config otomatis CREATE row saat belum ada — jadi aman disimpan.
const FALLBACK_CONFIG: StoreConfigData = {
  id: '__new__',
  monthlyTarget: 0,
  week1Pct: 25,
  week2Pct: 21,
  week3Pct: 23,
  week4Pct: 26,
  week5Pct: 5,
  dayPcts: DEFAULT_DAY_PCTS,
}

const scrollbarCls =
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/25'

const pad2 = (n: number) => String(n).padStart(2, '0')
const parseNum = (s: string): number => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
const sumText = (v: number) => fmtNum(Number(v.toFixed(4)))

function errMessage(data: unknown): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error?: unknown }).error
    if (typeof e === 'string' && e) return e
  }
  return 'Terjadi kesalahan'
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await safeFetch(url)
    if (res.status === 401) return { ok: false, status: 401, error: SESSION_MSG }
    const data: unknown = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, status: res.status, error: errMessage(data) }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, status: 0, error: 'Koneksi bermasalah, coba lagi' }
  }
}

async function apiSend<T>(
  url: string,
  method: 'PUT' | 'POST',
  body: unknown,
): Promise<ApiResult<T>> {
  try {
    const res = await safeFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 401) return { ok: false, status: 401, error: SESSION_MSG }
    const data: unknown = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, status: res.status, error: errMessage(data) }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, status: 0, error: 'Koneksi bermasalah, coba lagi' }
  }
}

// ─── Shift color mapping (exported — dipakai section 4 & 5) ─────────────

export function shiftBadgeClass(code: string | null): string {
  switch ((code || '').toUpperCase()) {
    case 'P':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    case 'S':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    case 'F':
      return 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
    case 'O':
      return 'bg-muted text-muted-foreground'
    default:
      return ''
  }
}

// ─── Tiny presentational helpers ────────────────────────────────────────

function ShiftBadge({ code, label }: { code: string | null; label?: string | null }) {
  const text = label ? `${code} · ${label}` : code
  if (!code) {
    return (
      <Badge variant="outline" className="border-dashed text-muted-foreground">
        –
      </Badge>
    )
  }
  const cls = shiftBadgeClass(code)
  return cls ? (
    <Badge className={cn('border-transparent', cls)}>{text}</Badge>
  ) : (
    <Badge variant="secondary">{text}</Badge>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-sm font-bold tabular-nums sm:text-base', accent && 'text-[#E14227]')}>
        {value}
      </p>
    </div>
  )
}

function CheckBadge({ ok }: { ok: boolean }) {
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

function ConfigSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
      <Skeleton className="h-9 w-36" />
    </div>
  )
}

// ─── Main component ─────────────────────────────────────────────────────

export default function TargetBreakdownPanel({ onChanged }: { onChanged?: () => void }) {
  // ── Store config (Sections 1–2) ──
  const [configLoading, setConfigLoading] = useState(true)
  const [config, setConfig] = useState<StoreConfigData | null>(null)
  // true saat server belum punya StoreConfig (install baru / deploy tanpa seed)
  const [configIsNew, setConfigIsNew] = useState(false)
  const [allocations, setAllocations] = useState<GroupAllocationItem[]>([])
  const [shiftTypes, setShiftTypes] = useState<ShiftTypeItem[]>([])
  const [savingConfig, setSavingConfig] = useState(false)

  // Overlay edits (null = pakai nilai server) → refetch tidak menghapus edit user
  const [targetOverlay, setTargetOverlay] = useState<string | null>(null)
  const [weekOverlay, setWeekOverlay] = useState<(string | null)[]>([null, null, null, null, null])
  const [dayOverlay, setDayOverlay] = useState<(string | null)[]>([null, null, null, null, null, null, null])
  const [allocOverlay, setAllocOverlay] = useState<Record<string, string>>({})

  // ── Shift types (Section 3) ──
  const [shiftEdits, setShiftEdits] = useState<Record<string, { label: string; weight: string }>>({})
  const [savingShifts, setSavingShifts] = useState(false)
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false)
  const [newShiftCode, setNewShiftCode] = useState('')
  const [newShiftLabel, setNewShiftLabel] = useState('')
  const [newShiftWeight, setNewShiftWeight] = useState('1')
  const [addingShift, setAddingShift] = useState(false)

  // ── Schedule roster (Section 4) ──
  const [schedYear, setSchedYear] = useState(0)
  const [schedMonth, setSchedMonth] = useState(0) // 1-based
  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null)
  const [schedLoading, setSchedLoading] = useState(true)
  const [dirtyMap, setDirtyMap] = useState<Map<string, string>>(new Map())
  const [savingSchedule, setSavingSchedule] = useState(false)

  // ── Breakdown preview (Section 5) ──
  const [focusDate, setFocusDate] = useState('')
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null)
  const [bdLoading, setBdLoading] = useState(true)

  // ─── Data loaders ─────────────────────────────────────────────────────

  const loadStoreConfig = useCallback(async () => {
    try {
      const res = await apiGet<{
        config: StoreConfigData | null
        allocations: GroupAllocationItem[]
        allocationSum: number
        shiftTypes: ShiftTypeItem[]
      }>('/api/store-config')
      if (!res.ok) {
        toast.error(res.error)
        // Form tetap terisi default (jangan matikan UI) — percobaan simpan akan
        // memicu toast auth/koneksi yang jelas.
        setConfig(prev => prev ?? FALLBACK_CONFIG)
        setConfigIsNew(true)
        return
      }
      setConfig(res.data.config ?? FALLBACK_CONFIG)
      setConfigIsNew(!res.data.config)
      setAllocations(res.data.allocations)
      setShiftTypes(res.data.shiftTypes)
    } finally {
      setConfigLoading(false)
    }
  }, [])

  const refetchShiftTypes = useCallback(async () => {
    const res = await apiGet<ShiftTypeItem[]>('/api/shift-types')
    if (res.ok) setShiftTypes(res.data)
  }, [])

  const loadSchedule = useCallback(async (year: number, month: number) => {
    try {
      const res = await apiGet<ScheduleData>(`/api/schedule?year=${year}&month=${month}`)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setScheduleData(res.data)
      setDirtyMap(new Map())
    } finally {
      setSchedLoading(false)
    }
  }, [])

  const loadBreakdown = useCallback(async (date: string) => {
    try {
      const res = await apiGet<BreakdownData>(`/api/targets/breakdown?date=${date}`)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setBreakdown(res.data)
    } finally {
      setBdLoading(false)
    }
  }, [])

  // ─── Mount: load config + set WIB defaults ────────────────────────────

  useEffect(() => {
    void loadStoreConfig()
    const d = getWIBDate()
    setSchedYear(d.getFullYear())
    setSchedMonth(d.getMonth() + 1)
    setFocusDate(getWIBToday())
  }, [loadStoreConfig])

  useEffect(() => {
    if (!schedYear || !schedMonth) return
    void loadSchedule(schedYear, schedMonth)
  }, [schedYear, schedMonth, loadSchedule])

  useEffect(() => {
    if (!focusDate) return
    void loadBreakdown(focusDate)
  }, [focusDate, loadBreakdown])

  // ─── Derived: config & alokasi (live preview) ─────────────────────────

  const configWeekPcts = config
    ? [config.week1Pct, config.week2Pct, config.week3Pct, config.week4Pct, config.week5Pct]
    : [0, 0, 0, 0, 0]
  const weekEff = configWeekPcts.map((p, i) => weekOverlay[i] ?? String(p))
  const monthlyTargetEff = targetOverlay ?? (config ? String(config.monthlyTarget) : '')
  const monthlyTargetNum = parseNum(monthlyTargetEff)

  const weekSum = weekEff.reduce((s, v) => s + parseNum(v), 0)
  const weekOk = Math.abs(weekSum - 100) < 0.001

  // ── Distribusi harian (Senin..Minggu) — bobot relatif, dinormalisasi per minggu ──
  const configDayPcts = config?.dayPcts && config.dayPcts.length === 7 ? config.dayPcts : DEFAULT_DAY_PCTS
  const dayEff = configDayPcts.map((p, i) => dayOverlay[i] ?? String(p))
  const dayWeights = dayEff.map(v => parseNum(v))
  const dayWeightSum = dayWeights.reduce((s, w) => s + w, 0)
  const dayOk = dayWeights.every(w => w >= 0 && w <= 100)

  // Preview target harian per hari: pakai target minggu penuh (W1) sbg contoh
  const weekNums = weekEff.map(v => parseNum(v))
  const w1Amount = allocateByWeights(monthlyTargetNum, weekNums)[0] ?? 0
  const dayPreview = allocateByWeights(w1Amount, dayWeights)

  const allocEff = (a: GroupAllocationItem) => allocOverlay[a.id] ?? String(a.allocationPct)
  const allocWeights = allocations.map(a => parseNum(allocEff(a)))
  const allocSum = allocWeights.reduce((s, w) => s + w, 0)
  const allocOk = allocations.length === 0 || Math.abs(allocSum - 100) < 0.001
  const derivedMonthly = allocateByWeights(monthlyTargetNum, allocWeights)

  // Alasan kenapa config belum valid — ditampilkan saat user KLIK simpan
  // (tombol tidak pernah mati diam-diam; klik selalu memberi feedback).
  const configIssues: string[] = []
  if (monthlyTargetEff.trim() === '' || monthlyTargetNum < 0 || !Number.isFinite(monthlyTargetNum)) {
    configIssues.push('Target bulanan belum diisi')
  }
  if (!weekOk) configIssues.push(`Σ distribusi mingguan harus 100% (saat ini ${sumText(weekSum)}%)`)
  if (!dayOk) configIssues.push('Persentase harian harus angka 0–100')
  if (!allocOk) configIssues.push(`Σ alokasi zoning harus 100% (saat ini ${sumText(allocSum)}%)`)

  const saveConfig = async () => {
    if (savingConfig || configLoading) return
    if (configIssues.length > 0) {
      toast.error(configIssues.join(' · '))
      return
    }
    setSavingConfig(true)
    const res = await apiSend<StoreConfigData>('/api/store-config', 'PUT', {
      monthlyTarget: Math.round(monthlyTargetNum),
      week1Pct: parseNum(weekEff[0]),
      week2Pct: parseNum(weekEff[1]),
      week3Pct: parseNum(weekEff[2]),
      week4Pct: parseNum(weekEff[3]),
      week5Pct: parseNum(weekEff[4]),
      dayPcts: dayWeights,
      allocations:
        allocations.length > 0
          ? allocations.map(a => ({ groupId: a.id, allocationPct: parseNum(allocEff(a)) }))
          : undefined,
    })
    setSavingConfig(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Target toko, distribusi mingguan & harian tersimpan')
    setConfigLoading(true)
    await loadStoreConfig()
    if (focusDate) await loadBreakdown(focusDate)
    onChanged?.()
  }

  const refreshAll = async () => {
    setConfigLoading(true)
    setBdLoading(true)
    await loadStoreConfig()
    if (focusDate) await loadBreakdown(focusDate)
  }

  // ─── Derived: shift types edits ───────────────────────────────────────

  const shiftLabelEff = (st: ShiftTypeItem) => shiftEdits[st.id]?.label ?? st.label
  const shiftWeightEff = (st: ShiftTypeItem) => shiftEdits[st.id]?.weight ?? String(st.weight)
  const activeShiftTypes = useMemo(() => shiftTypes.filter(s => s.isActive), [shiftTypes])

  const saveShifts = async () => {
    if (activeShiftTypes.length === 0) return
    setSavingShifts(true)
    const res = await apiSend<ShiftTypeItem[]>('/api/shift-types', 'PUT', {
      updates: activeShiftTypes.map(st => ({
        id: st.id,
        label: shiftLabelEff(st).trim() || st.code,
        weight: parseNum(shiftWeightEff(st)),
      })),
    })
    setSavingShifts(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success('Bobot shift tersimpan')
    setShiftEdits({})
    await refetchShiftTypes()
    if (focusDate) void loadBreakdown(focusDate)
    onChanged?.()
  }

  const addShift = async () => {
    const code = newShiftCode.trim().toUpperCase()
    const weight = parseNum(newShiftWeight)
    if (!code || code.length > 3) {
      toast.error('Kode shift wajib diisi (maks 3 karakter)')
      return
    }
    if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
      toast.error('Bobot shift harus angka 0–100')
      return
    }
    setAddingShift(true)
    const maxSort = shiftTypes.reduce((m, s) => Math.max(m, s.sortOrder), 0)
    const res = await apiSend<ShiftTypeItem>('/api/shift-types', 'POST', {
      code,
      label: newShiftLabel.trim() || code,
      weight,
      sortOrder: maxSort + 1,
    })
    setAddingShift(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`Shift ${code} ditambahkan`)
    setShiftDialogOpen(false)
    setNewShiftCode('')
    setNewShiftLabel('')
    setNewShiftWeight('1')
    await refetchShiftTypes()
    if (schedYear && schedMonth) void loadSchedule(schedYear, schedMonth)
    onChanged?.()
  }

  // ─── Derived: roster grid ─────────────────────────────────────────────

  const groupedCrews = useMemo(() => {
    if (!scheduleData) return []
    const map = new Map<string, { id: string; name: string; crews: ScheduleData['crews'] }>()
    for (const c of scheduleData.crews) {
      if (!map.has(c.groupId)) map.set(c.groupId, { id: c.group.id, name: c.group.name, crews: [] })
      map.get(c.groupId)!.crews.push(c)
    }
    return Array.from(map.values())
  }, [scheduleData])

  // Daftar crew rapi: dikelompokkan per zoning (group) lalu urut nama masuk
  const flatCrews = useMemo(() => groupedCrews.flatMap(g => g.crews), [groupedCrews])

  const baseShiftMap = useMemo(() => {
    const m = new Map<string, string>()
    if (scheduleData) {
      for (const s of scheduleData.shifts) m.set(`${s.crewId}|${s.tanggal}`, s.shiftCode || '')
    }
    return m
  }, [scheduleData])

  const daysInMonth = scheduleData?.daysInMonth ?? 0

  const dateOfDay = (day: number) =>
    `${scheduleData?.year ?? schedYear}-${pad2(scheduleData?.month ?? schedMonth)}-${pad2(day)}`

  const getCell = (crewId: string, day: number): string => {
    const key = `${crewId}|${dateOfDay(day)}`
    const dirty = dirtyMap.get(key)
    if (dirty !== undefined) return dirty
    return baseShiftMap.get(key) || ''
  }

  const setDirty = (crewId: string, day: number, code: string) => {
    const key = `${crewId}|${dateOfDay(day)}`
    setDirtyMap(prev => {
      const m = new Map(prev)
      m.set(key, code)
      return m
    })
  }

  const bulkFill = (crewId: string, code: string) => {
    setDirtyMap(prev => {
      const m = new Map(prev)
      for (let d = 1; d <= daysInMonth; d++) m.set(`${crewId}|${dateOfDay(d)}`, code)
      return m
    })
  }

  const clearCrewEdits = (crewId: string) => {
    setDirtyMap(prev => {
      const m = new Map(prev)
      for (const key of Array.from(m.keys())) {
        if (key.startsWith(`${crewId}|`)) m.delete(key)
      }
      return m
    })
  }

  const saveSchedule = async () => {
    if (dirtyMap.size === 0) return
    const entries = Array.from(dirtyMap.entries()).map(([key, code]) => {
      const [crewId, tanggal] = key.split('|')
      return { crewId, tanggal, shiftCode: code }
    })
    setSavingSchedule(true)
    const res = await apiSend<{ upserted: number; deleted: number }>('/api/schedule', 'PUT', { entries })
    setSavingSchedule(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    toast.success(`Jadwal tersimpan (${res.data.upserted} diatur, ${res.data.deleted} dihapus)`)
    setDirtyMap(new Map())
    if (schedYear && schedMonth) void loadSchedule(schedYear, schedMonth)
    void loadBreakdown(focusDate || getWIBToday())
    onChanged?.()
  }

  // Crew tanpa satu pun shift di bulan tsb → warning amber
  const crewsWithoutShift = useMemo(() => {
    if (!scheduleData || daysInMonth === 0) return []
    const y = scheduleData.year
    const m = scheduleData.month
    const counts = new Map<string, number>()
    for (const c of scheduleData.crews) counts.set(c.id, 0)
    for (const c of scheduleData.crews) {
      for (let d = 1; d <= daysInMonth; d++) {
        const key = `${c.id}|${y}-${pad2(m)}-${pad2(d)}`
        const code = dirtyMap.has(key) ? dirtyMap.get(key) ?? '' : baseShiftMap.get(key) || ''
        if (code !== '') counts.set(c.id, (counts.get(c.id) || 0) + 1)
      }
    }
    return scheduleData.crews.filter(c => (counts.get(c.id) || 0) === 0).map(c => c.name)
  }, [scheduleData, dirtyMap, baseShiftMap, daysInMonth])

  // ─── Derived: breakdown preview ───────────────────────────────────────

  const bdStore = breakdown?.engineActive ? breakdown.store : null
  const bdGroups = breakdown?.groups ?? []
  const unassignedGroups = bdGroups.filter(g => g.unassignedToday > 0)
  const legacyGroups = bdGroups.filter(g => g.legacyEqualSplitToday)

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Section 1: Target Bulanan Toko ── */}
      <motion.div {...fadeIn} transition={{ duration: 0.35 }}>
        <Card className="p-4 sm:p-6">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Store className="h-5 w-5 text-[#E14227]" />
              Target Bulanan Toko
            </CardTitle>
            <CardDescription>
              Sumber utama seluruh hierarki target. Distribusi mingguan harus berjumlah 100%.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            {configLoading && !config ? (
              <ConfigSkeleton />
            ) : (
              <>
                {configIsNew && (
                  <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    <Info className="h-4 w-4" />
                    <AlertTitle className="text-sm font-bold">Konfigurasi belum ada — install baru terdeteksi</AlertTitle>
                    <AlertDescription className="text-xs">
                      Nilai default sudah diisi otomatis (minggu 25/21/23/26/5 % · harian 3/3/3/3/3/4,5/4,5 %).
                      Isi <b>Target Bulanan</b>, sesuaikan <b>Alokasi Zoning</b> di kartu berikutnya (Σ = 100%),
                      lalu klik Simpan. Klik simpan kapan saja untuk melihat pesan validasi bila ada yang kurang.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="tb-monthly" className="text-xs font-semibold">
                    Target Bulanan (Rp)
                  </Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                      Rp
                    </span>
                    <Input
                      id="tb-monthly"
                      inputMode="numeric"
                      min={0}
                      placeholder="670017363"
                      value={monthlyTargetEff}
                      onChange={e => setTargetOverlay(e.target.value)}
                      className="h-11 pl-10 text-base font-bold tabular-nums sm:h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-semibold">Distribusi Mingguan (%)</Label>
                    {weekOk ? (
                      <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        <CheckCircle2 className="h-3 w-3" /> 100%
                      </Badge>
                    ) : (
                      <Badge className="border-transparent bg-destructive text-white">
                        <XCircle className="h-3 w-3" /> Σ {sumText(weekSum)}%
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                      ['W1 (tgl 1–7)'],
                      ['W2 (tgl 8–14)'],
                      ['W3 (tgl 15–21)'],
                      ['W4 (tgl 22–28)'],
                      ['W5 (tgl 29+)'],
                    ].map(([lbl], i) => (
                      <div key={lbl} className="space-y-1">
                        <Label htmlFor={`tb-w${i + 1}`} className="text-[11px] text-muted-foreground">
                          {lbl}
                        </Label>
                        <Input
                          id={`tb-w${i + 1}`}
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min={0}
                          max={100}
                          value={weekEff[i]}
                          onChange={e =>
                            setWeekOverlay(prev => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                          }
                          className="h-11 text-center tabular-nums sm:h-9"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-semibold">Distribusi Harian per Hari (%)</Label>
                    <Badge variant="secondary" className="text-[10px] tabular-nums">
                      Σ minggu penuh: {sumText(dayWeightSum)}%
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {DAY_NAMES.map((lbl, i) => (
                      <div key={lbl} className="space-y-1">
                        <Label htmlFor={`tb-d${i}`} className="text-[11px] text-muted-foreground">
                          {lbl}
                        </Label>
                        <Input
                          id={`tb-d${i}`}
                          type="number"
                          inputMode="decimal"
                          step="0.5"
                          min={0}
                          max={100}
                          value={dayEff[i]}
                          onChange={e =>
                            setDayOverlay(prev => prev.map((v, idx) => (idx === i ? e.target.value : v)))
                          }
                          className="h-11 text-center tabular-nums sm:h-9"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Bobot relatif per hari — otomatis dinormalisasi dalam tiap minggu (Σ target harian =
                    target mingguan, tetap 0 selisih). Contoh: Senin 3% &amp; Sabtu 4,5% → Sabtu mendapat
                    porsi 1,5× hari kerja.
                  </p>
                  {monthlyTargetNum > 0 && dayWeightSum > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Target hari (contoh minggu penuh):
                      </span>
                      {DAY_NAMES.map((n, i) => (
                        <Badge
                          key={n}
                          variant="secondary"
                          className="text-[10px] font-semibold tabular-nums"
                          title={`Target harian ${n} (minggu penuh)`}
                        >
                          {n.slice(0, 3)} ≈ {fmtRp(dayPreview[i] ?? 0)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    Tersimpan atomik bersama Alokasi Zoning di kartu berikutnya (satu tombol Simpan).
                  </p>
                  <Button
                    onClick={saveConfig}
                    disabled={savingConfig || configLoading}
                    className="h-11 w-full bg-[#E14227] text-white hover:bg-[#c93a21] sm:h-9 sm:w-auto"
                  >
                    {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Simpan Target &amp; Alokasi
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 2: Alokasi Zoning ── */}
      <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.05 }}>
        <Card className="p-4 sm:p-6">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Layers className="h-5 w-5 text-[#E14227]" />
              Alokasi Zoning (Group)
            </CardTitle>
            <CardDescription>
              Persentase target toko per zoning. Preview di kanan adalah hasil split largest-remainder
              yang persis sama dengan engine.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            {configLoading && allocations.length === 0 ? (
              <ConfigSkeleton />
            ) : allocations.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                Belum ada zoning/group — buat group terlebih dahulu di tab Management.
              </p>
            ) : (
              <>
                <div className="mb-1 flex items-center justify-end">
                  {allocOk ? (
                    <Badge className="border-transparent bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Σ 100%
                    </Badge>
                  ) : (
                    <Badge className="border-transparent bg-destructive text-white">
                      <XCircle className="h-3 w-3" /> Σ {sumText(allocSum)}%
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  {allocations.map((a, i) => (
                    <div
                      key={a.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-2.5"
                    >
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-sm font-semibold">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">{a.crewCount} crew</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min={0}
                          max={100}
                          aria-label={`Alokasi ${a.name} (%)`}
                          value={allocEff(a)}
                          onChange={e =>
                            setAllocOverlay(prev => ({ ...prev, [a.id]: e.target.value }))
                          }
                          className="h-11 w-24 text-center tabular-nums sm:h-9"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      <div className="min-w-32 text-right">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Target bulanan
                        </p>
                        <p className="text-sm font-bold tabular-nums text-[#E14227]">
                          ≈ {fmtRp(derivedMonthly[i] ?? 0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Σ Alokasi harus 100%. Perubahan di kartu ini tersimpan bersama Target Bulanan Toko
                  (satu tombol Simpan di atas).
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 3: Bobot Shift ── */}
      <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.1 }}>
        <Card className="p-4 sm:p-6">
          <CardHeader className="p-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Scale className="h-5 w-5 text-[#E14227]" />
              Bobot Shift (Configurable)
            </CardTitle>
            <CardDescription>
              Bobot menentukan porsi target harian crew sesuai shift pada jadwal. Bobot tidak
              di-hardcode — ubah sesuai kebutuhan toko.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            <div className="overflow-x-auto rounded-lg border">
              <Table className="min-w-max text-xs">
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-20">Kode</TableHead>
                    <TableHead className="min-w-40">Label</TableHead>
                    <TableHead className="w-28 text-center">Bobot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeShiftTypes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        Belum ada shift aktif.
                      </TableCell>
                    </TableRow>
                  ) : (
                    activeShiftTypes.map(st => {
                      const cls = shiftBadgeClass(st.code)
                      return (
                        <TableRow key={st.id}>
                          <TableCell>
                            {cls ? (
                              <Badge className={cn('border-transparent', cls)}>{st.code}</Badge>
                            ) : (
                              <Badge variant="secondary">{st.code}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              aria-label={`Label shift ${st.code}`}
                              value={shiftLabelEff(st)}
                              onChange={e =>
                                setShiftEdits(prev => ({
                                  ...prev,
                                  [st.id]: {
                                    label: e.target.value,
                                    weight: shiftWeightEff(st),
                                  },
                                }))
                              }
                              className="h-11 sm:h-9"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.5"
                              min={0}
                              max={100}
                              aria-label={`Bobot shift ${st.code}`}
                              value={shiftWeightEff(st)}
                              onChange={e =>
                                setShiftEdits(prev => ({
                                  ...prev,
                                  [st.id]: { label: shiftLabelEff(st), weight: e.target.value },
                                }))
                              }
                              className="h-11 text-center tabular-nums sm:h-9"
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Contoh: P=1, S=1, F=2, O=0. Bobot O = 0 berarti crew Off tidak mendapat target.
            </p>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setShiftDialogOpen(true)}
                className="h-11 sm:h-9"
              >
                <Plus className="h-4 w-4" /> Tambah Shift
              </Button>
              <Button
                onClick={saveShifts}
                disabled={activeShiftTypes.length === 0 || savingShifts}
                className="h-11 w-full bg-[#E14227] text-white hover:bg-[#c93a21] sm:h-9 sm:w-auto"
              >
                {savingShifts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan Bobot Shift
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 4: Jadwal Shift Crew (roster grid) ── */}
      <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.15 }}>
        <Card className="p-4 sm:p-6">
          <CardHeader className="p-0 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <CalendarDays className="h-5 w-5 text-[#E14227]" />
                Jadwal Shift Crew
              </CardTitle>
              <div className="flex items-center gap-2">
                {dirtyMap.size > 0 && (
                  <Badge className="border-transparent bg-[#E14227]/15 text-[#E14227]">
                    {dirtyMap.size} perubahan
                  </Badge>
                )}
                <Button
                  onClick={saveSchedule}
                  disabled={dirtyMap.size === 0 || savingSchedule || !scheduleData}
                  className="h-11 bg-[#E14227] text-white hover:bg-[#c93a21] sm:h-9"
                >
                  {savingSchedule ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Simpan Jadwal{dirtyMap.size > 0 ? ` (${dirtyMap.size})` : ''}
                </Button>
              </div>
            </div>
            <CardDescription>
              Pilih shift (P/S/F/O) dari dropdown pada tiap tanggal. Kolom Zoning mengikuti group
              aktif crew — target dihitung realtime dari jadwal ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-0">
            {/* Bulan & tahun */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={schedMonth ? String(schedMonth) : undefined}
                onValueChange={v => {
                  setSchedLoading(true)
                  setSchedMonth(Number(v))
                }}
              >
                <SelectTrigger className="h-11 w-[150px] sm:h-9" aria-label="Pilih bulan">
                  <SelectValue placeholder="Bulan" />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={2000}
                max={2100}
                aria-label="Tahun"
                value={schedYear || ''}
                onChange={e => {
                  const v = Number(e.target.value)
                  setSchedLoading(true)
                  setSchedYear(Number.isFinite(v) && v >= 2000 && v <= 2100 ? Math.round(v) : 0)
                }}
                className="h-11 w-24 tabular-nums sm:h-9"
              />
              {schedMonth > 0 && schedYear > 0 && (
                <span className="text-xs text-muted-foreground">
                  {monthNames[schedMonth - 1]} {schedYear}
                </span>
              )}
            </div>

            {schedLoading && !scheduleData ? (
              <Skeleton className="h-64 w-full" />
            ) : !scheduleData || scheduleData.crews.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                Belum ada crew. Tambahkan crew terlebih dahulu di tab Management.
              </p>
            ) : (
              <>
                {/* Legend */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">Legenda:</span>
                  {activeShiftTypes.map(st => {
                    const cls = shiftBadgeClass(st.code)
                    return cls ? (
                      <Badge key={st.id} className={cn('border-transparent', cls)}>
                        {st.code} · {st.label}
                      </Badge>
                    ) : (
                      <Badge key={st.id} variant="secondary">
                        {st.code} · {st.label}
                      </Badge>
                    )
                  })}
                  <Badge variant="outline" className="border-dashed text-muted-foreground">
                    – · kosong
                  </Badge>
                  <span>Ubah shift lewat dropdown per tanggal; tombol di kolom “Isi cepat” mengisi seluruh bulan</span>
                </div>

                {/* Grid roster — Crew | Zoning | Isi cepat | 1..31 (dropdown shift) */}
                <div className={cn('max-h-[32rem] overflow-auto rounded-lg border', scrollbarCls)}>
                  <Table className="min-w-max text-xs">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="sticky left-0 top-0 z-30 w-40 min-w-40 bg-background px-2 py-2 text-left">
                          Crew
                        </TableHead>
                        <TableHead className="sticky left-40 top-0 z-30 w-28 min-w-28 border-r bg-background px-2 py-2 text-left">
                          Zoning
                        </TableHead>
                        <TableHead className="sticky top-0 z-20 bg-background px-1 py-2 text-center text-[10px]">
                          Isi cepat
                        </TableHead>
                        {Array.from({ length: daysInMonth }).map((_, i) => (
                          <TableHead
                            key={i}
                            className="sticky top-0 z-20 bg-background px-0.5 py-2 text-center text-[10px] font-semibold text-muted-foreground"
                          >
                            {i + 1}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flatCrews.map(crew => (
                        <TableRow key={crew.id} className="group/row hover:bg-muted/30">
                          {/* Crew (sticky) */}
                          <TableCell className="sticky left-0 z-10 border-r bg-background px-2 py-1.5">
                            <p className="max-w-40 truncate text-xs font-semibold leading-tight">
                              {crew.name}
                            </p>
                            <p className="text-[10px] leading-tight text-muted-foreground">
                              {crew.employeeId}
                            </p>
                          </TableCell>
                          {/* Zoning (sticky) */}
                          <TableCell className="sticky left-40 z-10 border-r bg-background px-2 py-1.5">
                            <Badge
                              variant="secondary"
                              className="max-w-24 truncate text-[10px] font-semibold"
                              title={`Zoning: ${crew.group.name}`}
                            >
                              {crew.group.name}
                            </Badge>
                          </TableCell>
                          {/* Isi cepat (bulk fill) */}
                          <TableCell className="border-r px-1 py-1.5">
                            <div className="flex items-center gap-0.5">
                              {activeShiftTypes.map(st => {
                                const cls = shiftBadgeClass(st.code)
                                return (
                                  <button
                                    key={st.id}
                                    type="button"
                                    title={`Isi semua hari dengan ${st.code} (${st.label})`}
                                    onClick={() => bulkFill(crew.id, st.code)}
                                    className={cn(
                                      'inline-flex h-7 w-6 shrink-0 items-center justify-center rounded border text-[10px] font-bold transition-transform active:scale-90 sm:h-6',
                                      cls || 'bg-secondary text-secondary-foreground',
                                      'border-transparent hover:opacity-80',
                                    )}
                                  >
                                    {st.code}
                                  </button>
                                )
                              })}
                              <button
                                type="button"
                                title="Kosongkan semua hari (hapus jadwal crew ini)"
                                onClick={() => bulkFill(crew.id, '')}
                                className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded border border-dashed text-[10px] font-bold text-muted-foreground transition-transform active:scale-90 hover:bg-muted sm:h-6"
                              >
                                –
                              </button>
                              <button
                                type="button"
                                title="Bersihkan: kembalikan edit lokal crew ini ke data tersimpan"
                                onClick={() => clearCrewEdits(crew.id)}
                                className="inline-flex h-7 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform active:scale-90 hover:bg-muted sm:h-6"
                              >
                                <Eraser className="h-3 w-3" />
                              </button>
                            </div>
                          </TableCell>
                          {/* Dropdown shift per tanggal */}
                          {Array.from({ length: daysInMonth }).map((_, di) => {
                            const day = di + 1
                            const cell = getCell(crew.id, day)
                            const cls = cell ? shiftBadgeClass(cell) : ''
                            return (
                              <TableCell key={day} className="px-0.5 py-0.5">
                                <select
                                  aria-label={`Shift ${crew.name} tanggal ${day}`}
                                  title={`${crew.name} • ${day} ${monthNames[(scheduleData?.month ?? 1) - 1]} ${scheduleData?.year ?? ''}`}
                                  value={cell}
                                  onChange={e => setDirty(crew.id, day, e.target.value)}
                                  className={cn(
                                    'h-11 w-11 cursor-pointer rounded-md border text-center text-[11px] font-bold tabular-nums outline-none transition-colors focus:ring-1 focus:ring-[#E14227] sm:h-7 sm:w-8 sm:text-[10px]',
                                    cell
                                      ? cn('border-transparent', cls)
                                      : 'border-dashed bg-background text-muted-foreground/60',
                                  )}
                                >
                                  <option value="">–</option>
                                  {activeShiftTypes.map(st => (
                                    <option key={st.id} value={st.code} title={st.label}>
                                      {st.code}
                                    </option>
                                  ))}
                                </select>
                              </TableCell>
                            )
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {crewsWithoutShift.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>
                      Crew tanpa satu pun shift bulan ini:{' '}
                      <span className="font-semibold">{crewsWithoutShift.join(', ')}</span> — crew
                      tersebut belum mendapat target dari jadwal.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Section 5: Preview Breakdown (Realtime) ── */}
      <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.2 }}>
        <Card className="p-4 sm:p-6">
          <CardHeader className="p-0 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <ClipboardCheck className="h-5 w-5 text-[#E14227]" />
                Preview Breakdown (Realtime)
              </CardTitle>
              <Button
                variant="outline"
                onClick={refreshAll}
                disabled={bdLoading || configLoading}
                className="h-11 sm:h-9"
              >
                <RefreshCw className={cn('h-4 w-4', (bdLoading || configLoading) && 'animate-spin')} />
                Refresh
              </Button>
            </div>
            <CardDescription>
              Hitungan engine realtime: Toko → Minggu → Hari → Zoning → Crew. Tanpa snapshot. Target
              harian crew mengikuti bobot shift; target <b>mingguan &amp; bulanan crew = target zoning ÷ jumlah crew</b> (sama rata, apa pun jadwalnya).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            {bdLoading && !breakdown ? (
              <Skeleton className="h-64 w-full" />
            ) : !breakdown ? (
              <p className="text-xs text-muted-foreground">Memuat preview…</p>
            ) : !breakdown.engineActive ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Engine target belum aktif</AlertTitle>
                <AlertDescription>
                  {breakdown.message ||
                    'Target breakdown belum dikonfigurasi.'}{' '}
                  Isi <span className="font-semibold">Target Bulanan Toko</span> dan{' '}
                  <span className="font-semibold">Alokasi Zoning</span> pada bagian 1–2 di atas
                  terlebih dahulu.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {/* Stat strip */}
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <MiniStat label="Target Bulanan Toko" value={fmtRp(bdStore?.monthlyTarget ?? 0)} accent />
                  <MiniStat
                    label={`Target Minggu ke-${breakdown.focusWeek}`}
                    value={fmtRp(bdStore?.weeklyTargets?.[breakdown.focusWeek - 1] ?? 0)}
                  />
                  <MiniStat label="Target Hari Ini" value={fmtRp(bdStore?.todayTarget ?? 0)} accent />
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <Label htmlFor="tb-focus-date" className="text-[11px] font-medium text-muted-foreground">
                      Tanggal Fokus
                    </Label>
                    <Input
                      id="tb-focus-date"
                      type="date"
                      value={focusDate}
                      onChange={e => setFocusDate(e.target.value)}
                      className="h-9 border-0 bg-transparent px-1 text-sm font-semibold shadow-none"
                    />
                  </div>
                </div>

                {/* Hierarki per group */}
                <div className={cn('max-h-96 overflow-auto rounded-lg border', scrollbarCls)}>
                  <Table className="min-w-max text-xs">
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="sticky top-0 z-10 bg-background min-w-44">Zoning / Crew</TableHead>
                        <TableHead className="sticky top-0 z-10 bg-background text-center">Shift</TableHead>
                        <TableHead className="sticky top-0 z-10 bg-background text-center">Bobot</TableHead>
                        <TableHead className="sticky top-0 z-10 bg-background text-right">Hari Ini</TableHead>
                        <TableHead className="sticky top-0 z-10 bg-background text-right">Minggu Ini</TableHead>
                        <TableHead className="sticky top-0 z-10 bg-background text-right">Bulanan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bdGroups.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                            Belum ada data group.
                          </TableCell>
                        </TableRow>
                      ) : (
                        bdGroups.map(g => (
                          <Fragment key={g.id}>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell className="font-bold">
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{g.name}</span>
                                  <Badge
                                    variant="secondary"
                                    className="tabular-nums"
                                    title="Persentase alokasi zoning"
                                  >
                                    {g.allocationPct}%
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              <TableCell className="text-right font-bold tabular-nums">
                                {fmtRp(g.todayTarget)}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {fmtRp(g.weeklyTarget)}
                              </TableCell>
                              <TableCell className="text-right font-bold tabular-nums">
                                {fmtRp(g.monthlyTarget)}
                              </TableCell>
                            </TableRow>
                            {g.crews.map(c => (
                              <TableRow key={c.id}>
                                <TableCell className="pl-8">
                                  <span className="text-muted-foreground">└</span>{' '}
                                  <span className="font-medium">{c.name}</span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <ShiftBadge code={c.shiftCode} label={c.shiftLabel} />
                                </TableCell>
                                <TableCell className="text-center tabular-nums text-muted-foreground">
                                  {c.shiftCode ? `×${c.shiftWeight}` : '—'}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmtRp(c.todayTarget)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmtRp(c.weeklyTarget)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {fmtRp(c.monthlyTarget)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Peringatan alokasi tidak terdistribusi */}
                {unassignedGroups.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="space-y-0.5">
                      {unassignedGroups.map(g => (
                        <p key={g.id}>
                          {g.name}: {fmtRp(g.unassignedToday)} tidak terdistribusi (semua crew Off)
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Catatan split rata (belum ada jadwal) */}
                {legacyGroups.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <p>
                      Belum ada jadwal → split rata sementara:{' '}
                      <span className="font-semibold">{legacyGroups.map(g => g.name).join(', ')}</span>
                    </p>
                  </div>
                )}

                {/* Verifikasi Σ */}
                {breakdown.checks && (
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs font-bold">
                        <ListChecks className="h-4 w-4 text-[#E14227]" />
                        Verifikasi Σ
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Σ Target Crew = Σ Target Group = Target Toko
                      </p>
                    </div>
                    <Separator className="mb-3" />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            Per tanggal fokus
                          </p>
                          <CheckBadge ok={breakdown.checks.today.balanced} />
                        </div>
                        <VerifRow
                          label="Σ Target Crew"
                          value={breakdown.checks.today.sumCrew}
                          equal={breakdown.checks.today.sumCrew === breakdown.checks.today.store}
                        />
                        <VerifRow
                          label="Σ Target Group"
                          value={breakdown.checks.today.sumGroup}
                          equal={breakdown.checks.today.sumGroup === breakdown.checks.today.store}
                        />
                        <VerifRow label="Target Toko" value={breakdown.checks.today.store} equal />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                            Per bulan
                          </p>
                          <CheckBadge ok={breakdown.checks.monthly.balanced} />
                        </div>
                        <VerifRow
                          label="Σ Target Crew"
                          value={breakdown.checks.monthly.sumCrew}
                          equal={breakdown.checks.monthly.sumCrew === breakdown.checks.monthly.store}
                        />
                        <VerifRow
                          label="Σ Target Group"
                          value={breakdown.checks.monthly.sumGroup}
                          equal={breakdown.checks.monthly.sumGroup === breakdown.checks.monthly.store}
                        />
                        <VerifRow label="Target Toko" value={breakdown.checks.monthly.store} equal />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Dialog: Tambah Shift ── */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#E14227]" /> Tambah Shift
            </DialogTitle>
            <DialogDescription>
              Kode maksimal 3 karakter. Shift baru otomatis aktif dan muncul di roster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tb-shift-code" className="text-xs font-semibold">
                Kode
              </Label>
              <Input
                id="tb-shift-code"
                maxLength={3}
                placeholder="mis. M"
                value={newShiftCode}
                onChange={e => setNewShiftCode(e.target.value.toUpperCase())}
                className="h-11 uppercase sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-shift-label" className="text-xs font-semibold">
                Label
              </Label>
              <Input
                id="tb-shift-label"
                placeholder="mis. Siang"
                value={newShiftLabel}
                onChange={e => setNewShiftLabel(e.target.value)}
                className="h-11 sm:h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tb-shift-weight" className="text-xs font-semibold">
                Bobot (0–100)
              </Label>
              <Input
                id="tb-shift-weight"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                max={100}
                value={newShiftWeight}
                onChange={e => setNewShiftWeight(e.target.value)}
                className="h-11 tabular-nums sm:h-9"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftDialogOpen(false)} className="h-11 sm:h-9">
              Batal
            </Button>
            <Button
              onClick={addShift}
              disabled={addingShift}
              className="h-11 bg-[#E14227] text-white hover:bg-[#c93a21] sm:h-9"
            >
              {addingShift ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
