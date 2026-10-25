'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TabsContent } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DollarSign, Hash, ShoppingCart, TrendingUp, Search, Download, X,
  ChevronLeft, ChevronRight, CalendarDays, FileSpreadsheet, BarChart3, Users, Filter,
  ArrowUpDown, Package, FileDown, Eye,
} from 'lucide-react'
import { fmtRp, fmtNum, fadeIn, stagger, safeFetch, getWIBToday, getWeekRange, getMonthRange, getPageNumbers } from '@/lib/cms-utils'
import type { Crew, Group } from '@/lib/cms-types'

// ─── Types ─────────────────────────────────────────────
interface ExportTabProps {
  crews: Crew[]
  groups: Group[]
  isAdmin: boolean
}

interface ExportSale {
  id: string
  tanggal: string
  kodeExtend: string
  brand: string | null
  dept: string | null
  qty: number
  settle: number
  program: string | null
  idPenjualan: string | null
  crew: { id: string; name: string; employeeId: string; photo: string | null; group: { id: string; name: string } | null } | null
}

interface ExportSummary {
  totalQty: number
  totalSettle: number
  totalStruk: number
  basketSize: number
  pricePoint: number
}

interface ExportData {
  sales: ExportSale[]
  total: number
  totalPages: number
  page: number
  summary: ExportSummary
}

interface CrewReport {
  crewId: string
  crewName: string
  groupName: string | null
  totalQty: number
  totalSettle: number
  totalStruk: number
  totalItems: number
}

type QuickFilter = 'today' | 'week' | 'month' | 'all'
type ViewMode = 'table' | 'crew-summary'

const quickFilters: { key: QuickFilter; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: 'week', label: 'Minggu Ini' },
  { key: 'month', label: 'Bulan Ini' },
  { key: 'all', label: 'Semua' },
]

// ─── Component ──────────────────────────────────────────
const ExportTab = React.memo(function ExportTab({
  crews,
  groups,
  isAdmin,
}: ExportTabProps) {
  // Filter state
  const [selectedCrewId, setSelectedCrewId] = useState<string>('')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')
  const [page, setPage] = useState(1)
  const [showClaimed, setShowClaimed] = useState<'all' | 'claimed' | 'unclaimed'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  // Data state
  const [exportData, setExportData] = useState<ExportData | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [subsequentLoading, setSubsequentLoading] = useState(false)
  const [crewReports, setCrewReports] = useState<CrewReport[]>([])
  const [crewReportLoading, setCrewReportLoading] = useState(false)
  const [previewCrew, setPreviewCrew] = useState<CrewReport | null>(null)
  const [previewSales, setPreviewSales] = useState<ExportSale[]>([])

  // Refs
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstLoadRef = useRef(true)

  // ─── Debounced search (500ms) ───
  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 500)
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [searchInput])

  // ─── Reset page when filters change ───
  useEffect(() => { setPage(1) }, [selectedCrewId, selectedGroupId, dateFrom, dateTo, debouncedSearch, showClaimed])

  // ─── Effective crew filter (group overrides crew) ───
  const effectiveCrewId = useMemo(() => {
    if (selectedGroupId) return ''
    return selectedCrewId
  }, [selectedCrewId, selectedGroupId])

  // ─── Build query params ───
  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    if (effectiveCrewId) params.set('crewId', effectiveCrewId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (showClaimed !== 'all') params.set('claimed', showClaimed === 'claimed' ? 'true' : 'false')
    params.set('page', String(page))
    params.set('limit', '50')
    return params.toString()
  }, [effectiveCrewId, dateFrom, dateTo, debouncedSearch, showClaimed, page])

  // ─── Fetch sales data ───
  const fetchSales = useCallback(async () => {
    if (!isAdmin) return
    if (isFirstLoadRef.current) {
      setInitialLoading(true)
    } else {
      setSubsequentLoading(true)
    }
    try {
      const res = await safeFetch(`/api/claims?${queryParams}`)
      if (res.ok) {
        const data = await res.json()
        setExportData(data)
      }
    } catch (err) {
      console.error('Failed to fetch sales:', err)
    } finally {
      setInitialLoading(false)
      setSubsequentLoading(false)
      isFirstLoadRef.current = false
    }
  }, [isAdmin, queryParams])

  useEffect(() => { fetchSales() }, [fetchSales])

  // ─── Fetch crew summary report ───
  const fetchCrewReport = useCallback(async () => {
    if (!isAdmin) return
    setCrewReportLoading(true)
    try {
      // Build params for the report API
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await safeFetch(`/api/claims?${params}&limit=1000&claimed=true`)
      if (res.ok) {
        const data = await res.json()
        // Aggregate by crew
        const crewMap = new Map<string, CrewReport>()
        for (const sale of data.sales || []) {
          const crewId = sale.crew?.id || '__unclaimed__'
          const crewName = sale.crew?.name || 'Belum Claim'
          const groupName = sale.crew?.group?.name || null
          const existing = crewMap.get(crewId)
          if (existing) {
            existing.totalQty += sale.qty
            existing.totalSettle += sale.settle
            existing.totalItems += 1
            if (sale.idPenjualan) existing.totalStruk += 1
          } else {
            crewMap.set(crewId, {
              crewId,
              crewName,
              groupName,
              totalQty: sale.qty,
              totalSettle: sale.settle,
              totalStruk: sale.idPenjualan ? 1 : 0,
              totalItems: 1,
            })
          }
        }
        setCrewReports([...crewMap.values()].sort((a, b) => b.totalSettle - a.totalSettle))
      }
    } catch (err) {
      console.error('Failed to fetch crew report:', err)
    } finally {
      setCrewReportLoading(false)
    }
  }, [isAdmin, dateFrom, dateTo, debouncedSearch])

  useEffect(() => { fetchCrewReport() }, [fetchCrewReport])

  // ─── Preview crew sales ───
  const handlePreviewCrew = useCallback(async (report: CrewReport) => {
    setPreviewCrew(report)
    setPreviewSales([])
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (report.crewId !== '__unclaimed__') params.set('crewId', report.crewId)
      params.set('claimed', 'true')
      params.set('limit', '50')

      const res = await safeFetch(`/api/claims?${params}`)
      if (res.ok) {
        const data = await res.json()
        setPreviewSales(data.sales || [])
      }
    } catch (err) {
      console.error('Failed to preview crew sales:', err)
    }
  }, [dateFrom, dateTo])

  // ─── Quick filter handler ───
  const handleQuickFilter = useCallback((filter: QuickFilter) => {
    const today = getWIBToday()
    switch (filter) {
      case 'today':
        setDateFrom(today); setDateTo(today)
        break
      case 'week': {
        const wr = getWeekRange()
        setDateFrom(wr.from); setDateTo(wr.to)
        break
      }
      case 'month': {
        const mr = getMonthRange()
        setDateFrom(mr.from); setDateTo(mr.to)
        break
      }
      case 'all':
        setDateFrom(''); setDateTo('')
        break
    }
  }, [])

  // ─── Export CSV ───
  // KONSISTENSI LAPORAN: export memakai semantik yang sama dengan
  // halaman Laporan (claimedOnly=1) sehingga total nominal SETTLE
  // identik dengan export dari Laporan — penjualan belum di-claim
  // tidak ikut (kolom nominal = settle, bukan netto/hjp).
  const handleExport = useCallback(() => {
    const params = new URLSearchParams()
    params.set('claimedOnly', '1')
    if (selectedGroupId) {
      params.set('scope', 'zoning')
      params.set('groupId', selectedGroupId)
    } else if (effectiveCrewId) {
      params.set('crewId', effectiveCrewId)
    }
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    const qs = params.toString()
    window.open(`/api/export?${qs}`, '_blank')
  }, [selectedGroupId, effectiveCrewId, dateFrom, dateTo])

  // ─── Export per crew CSV ───
  // claimedOnly=1: konsisten dengan export Laporan (nominal settle,
  // hanya penjualan ber-claim crew).
  const handleExportPerCrew = useCallback((report: CrewReport) => {
    const params = new URLSearchParams()
    params.set('claimedOnly', '1')
    if (report.crewId !== '__unclaimed__') params.set('crewId', report.crewId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    const qs = params.toString()
    const filename = `penjualan-${report.crewName.replace(/\s+/g, '-').toLowerCase()}-${getWIBToday()}.csv`
    window.open(`/api/export?${qs}&filename=${encodeURIComponent(filename)}`, '_blank')
  }, [dateFrom, dateTo])

  // ─── Filtered crews ───
  const filteredCrews = useMemo(() => {
    if (selectedGroupId) return crews.filter(c => c.groupId === selectedGroupId)
    return crews
  }, [crews, selectedGroupId])

  // ─── Page numbers ───
  const pageNumbers = useMemo(() => {
    if (!exportData) return []
    return getPageNumbers(page, exportData.totalPages)
  }, [exportData, page])

  // ─── Summary cards config ───
  const summaryCards = useMemo(() => [
    {
      label: 'Total Settle',
      value: exportData?.summary.totalSettle ?? 0,
      format: fmtRp,
      icon: DollarSign,
      gradient: 'from-[#E14227] to-[#B8321E]',
      accent: 'border-l-[#E14227]',
    },
    {
      label: 'Total Qty',
      value: exportData?.summary.totalQty ?? 0,
      format: fmtNum,
      icon: Hash,
      gradient: 'from-[#9DB1CC] to-[#7E95B3]',
      accent: 'border-l-[#9DB1CC]',
    },
    {
      label: 'Total Struk',
      value: exportData?.summary.totalStruk ?? 0,
      format: fmtNum,
      icon: ShoppingCart,
      gradient: 'from-[#D4956B] to-[#B8321E]',
      accent: 'border-l-[#D4956B]',
    },
    {
      label: 'Basket Size',
      value: exportData?.summary.basketSize ?? 0,
      format: (n: number) => n.toFixed(1),
      icon: Package,
      gradient: 'from-[#E6BAA3] to-[#D4956B]',
      accent: 'border-l-[#E6BAA3]',
    },
  ], [exportData])

  // ─── Active filter count ───
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedCrewId || selectedGroupId) count++
    if (dateFrom || dateTo) count++
    if (debouncedSearch) count++
    if (showClaimed !== 'all') count++
    return count
  }, [selectedCrewId, selectedGroupId, dateFrom, dateTo, debouncedSearch, showClaimed])

  // ═══════════════════════════════════════════════════
  // INITIAL LOADING SKELETON
  // ═══════════════════════════════════════════════════
  if (!isAdmin) return null

  if (initialLoading) {
    return (
      <TabsContent value="export" className="mt-4 sm:mt-6 pb-24 md:pb-8">
      <motion.div {...stagger} className="space-y-5">
        <Card className="border-0 shadow-lg glass-card">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-20 rounded-full" />)}
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="glass-stat">
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-7 w-28 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-0 shadow-lg glass-card">
          <CardContent className="p-4">
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
      </TabsContent>
    )
  }

  // ═══════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════
  return (
    <TabsContent value="export" className="mt-4 sm:mt-6 pb-24 md:pb-8">
    <motion.div {...stagger} className="space-y-5">

      {/* ═══════════════════════════════════════════════
          FILTERS SECTION
          ═══════════════════════════════════════════════ */}
      <motion.div {...fadeIn} transition={{ delay: 0.02 }}>
        <Card className="border-0 shadow-lg glass-card">
          <CardContent className="p-4 space-y-4">
            {/* Top row: Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Group Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Group</label>
                <Select value={selectedGroupId} onValueChange={(val) => {
                  setSelectedGroupId(val === '__all__' ? '' : val)
                  setSelectedCrewId('')
                }}>
                  <SelectTrigger className="w-full h-10 glass-stat">
                    <SelectValue placeholder="Semua Group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua Group</SelectItem>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Group</SelectLabel>
                      {groups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {/* Crew Selector */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Crew</label>
                <Select value={selectedCrewId} onValueChange={(val) => {
                  setSelectedCrewId(val === '__all__' ? '' : val)
                  if (val !== '__all__') setSelectedGroupId('')
                }}>
                  <SelectTrigger className="w-full h-10 glass-stat">
                    <SelectValue placeholder="Semua Crew" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Semua Crew</SelectItem>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Crew</SelectLabel>
                      {filteredCrews.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />Dari
                </label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-10 glass-stat" />
              </div>

              {/* Date To */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <CalendarDays className="w-3 h-3" />Sampai
                </label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-10 glass-stat" />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
                <Select value={showClaimed} onValueChange={(v) => setShowClaimed(v as 'all' | 'claimed' | 'unclaimed')}>
                  <SelectTrigger className="w-full h-10 glass-stat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="claimed">Sudah Claim</SelectItem>
                    <SelectItem value="unclaimed">Belum Claim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quick filter chips + Search + Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Quick filters */}
              {quickFilters.map(qf => {
                const isActive = (
                  (qf.key === 'today' && dateFrom === getWIBToday() && dateTo === getWIBToday()) ||
                  (qf.key === 'week' && (() => { const wr = getWeekRange(); return dateFrom === wr.from && dateTo === wr.to })()) ||
                  (qf.key === 'month' && (() => { const mr = getMonthRange(); return dateFrom === mr.from && dateTo === mr.to })()) ||
                  (qf.key === 'all' && !dateFrom && !dateTo)
                )
                return (
                  <button
                    key={qf.key}
                    onClick={() => handleQuickFilter(qf.key)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 border ${
                      isActive
                        ? 'bg-[#E14227] text-white border-[#E14227] shadow-md shadow-[#E14227]/20'
                        : 'bg-white/60 dark:bg-gray-900/40 text-muted-foreground border-border/50 hover:border-[#E14227]/40 hover:text-[#E14227] dark:hover:text-[#F07050]'
                    }`}
                  >
                    {qf.label}
                  </button>
                )
              })}

              <div className="hidden sm:block w-px h-6 bg-border/50 mx-1" />

              {/* Search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari kode, brand, dept, crew..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setDebouncedSearch(searchInput.trim()) } }}
                  className="h-9 pl-8 pr-8 text-xs glass-stat"
                />
                {searchInput && (
                  <button onClick={() => setSearchInput('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex-1" />

              {/* View mode toggle */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/60">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'table' ? 'bg-white dark:bg-gray-900 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <BarChart3 className="w-3 h-3" />
                  <span className="hidden sm:inline">Tabel</span>
                </button>
                <button
                  onClick={() => setViewMode('crew-summary')}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                    viewMode === 'crew-summary' ? 'bg-white dark:bg-gray-900 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span className="hidden sm:inline">Per Crew</span>
                </button>
              </div>

              {/* Export button */}
              <Button
                size="sm"
                onClick={handleExport}
                className="bg-gradient-to-r from-[#D4956B] to-[#B8321E] hover:from-[#B8321E] hover:to-[#8F8B6E] text-white shadow-md shadow-[#D4956B]/20 text-xs font-semibold transition-all"
              >
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Export CSV
              </Button>
            </div>

            {/* Active filter badges */}
            <AnimatePresence>
              {activeFilterCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <Filter className="w-3 h-3 text-muted-foreground mr-1" />
                  {selectedGroupId && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                      Group: {groups.find(g => g.id === selectedGroupId)?.name || 'Unknown'}
                      <button onClick={() => { setSelectedGroupId(''); setSelectedCrewId('') }} className="ml-1 hover:text-destructive"><X className="w-2.5 h-2.5 inline" /></button>
                    </Badge>
                  )}
                  {selectedCrewId && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                      Crew: {crews.find(c => c.id === selectedCrewId)?.name || 'Unknown'}
                      <button onClick={() => setSelectedCrewId('')} className="ml-1 hover:text-destructive"><X className="w-2.5 h-2.5 inline" /></button>
                    </Badge>
                  )}
                  {dateFrom && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                      Dari: {dateFrom}
                      <button onClick={() => setDateFrom('')} className="ml-1 hover:text-destructive"><X className="w-2.5 h-2.5 inline" /></button>
                    </Badge>
                  )}
                  {dateTo && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                      Sampai: {dateTo}
                      <button onClick={() => setDateTo('')} className="ml-1 hover:text-destructive"><X className="w-2.5 h-2.5 inline" /></button>
                    </Badge>
                  )}
                  {showClaimed !== 'all' && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                      {showClaimed === 'claimed' ? 'Sudah Claim' : 'Belum Claim'}
                      <button onClick={() => setShowClaimed('all')} className="ml-1 hover:text-destructive"><X className="w-2.5 h-2.5 inline" /></button>
                    </Badge>
                  )}
                  {debouncedSearch && (
                    <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                      &ldquo;{debouncedSearch}&rdquo;
                      <button onClick={() => setSearchInput('')} className="ml-1 hover:text-destructive"><X className="w-2.5 h-2.5 inline" /></button>
                    </Badge>
                  )}
                  <button
                    onClick={() => {
                      setSelectedCrewId(''); setSelectedGroupId(''); setDateFrom(''); setDateTo('')
                      setSearchInput(''); setShowClaimed('all')
                    }}
                    className="text-[10px] text-muted-foreground hover:text-[#E14227] transition-colors ml-1"
                  >
                    Reset semua
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════════
          SUMMARY STAT CARDS
          ═══════════════════════════════════════════════ */}
      <motion.div {...fadeIn} transition={{ delay: 0.05 }}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {summaryCards.map((s, i) => (
            <motion.div
              key={i}
              {...fadeIn}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
            >
              <Card className={`glass-stat border-l-[3px] ${s.accent} overflow-hidden`}>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br ${s.gradient} shadow-lg flex items-center justify-center`}>
                      <s.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                    </div>
                  </div>
                  <p className="text-sm sm:text-lg font-bold tracking-tight truncate">
                    {s.format(s.value)}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
          {/* Price Point */}
          <motion.div
            {...fadeIn}
            transition={{ delay: 0.2 }}
            whileHover={{ y: -3, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
          >
            <Card className="glass-stat border-l-[3px] border-l-[#B2AC88] overflow-hidden">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">Price Point</p>
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-[#B2AC88] to-[#8F8B6E] shadow-lg flex items-center justify-center">
                    <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  </div>
                </div>
                <p className="text-sm sm:text-lg font-bold tracking-tight truncate">
                  {fmtRp(exportData?.summary.pricePoint ?? 0)}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════
          TABLE / CREW SUMMARY VIEW
          ═══════════════════════════════════════════════ */}
      <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
        <Card className="border-0 shadow-lg overflow-hidden glass-card">
          <CardContent className="p-4">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                  {viewMode === 'table' ? <FileSpreadsheet className="w-4 h-4 text-white" /> : <Users className="w-4 h-4 text-white" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    {viewMode === 'table' ? 'Detail Penjualan' : 'Ringkasan Per Crew'}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    {viewMode === 'table'
                      ? `${exportData?.total ?? 0} transaksi`
                      : `${crewReports.length} crew`
                    }
                  </p>
                </div>
              </div>
              {viewMode === 'table' && (
                <Badge variant="outline" className="text-[10px] tabular-nums font-semibold">
                  Hal {page} / {exportData?.totalPages ?? 1}
                </Badge>
              )}
            </div>

            {/* Loading overlay */}
            <div className="relative">
              <AnimatePresence>
                {(subsequentLoading || crewReportLoading) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/40 dark:bg-black/15 rounded-lg backdrop-blur-[1px]"
                  >
                    <div className="relative w-7 h-7 mb-2">
                      <div className="absolute inset-0 rounded-full border-[2.5px] border-[#E6BAA3] dark:border-[#7A1A14]" />
                      <div className="absolute inset-0 rounded-full border-[2.5px] border-transparent border-t-[#E14227] animate-spin" />
                    </div>
                    <p className="text-[11px] font-medium text-[#B8321E] dark:text-[#F07050]">Memuat...</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={(subsequentLoading || crewReportLoading) ? 'pointer-events-none opacity-70' : ''}>

                {/* ─── TABLE VIEW ─── */}
                {viewMode === 'table' && (
                  <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-2 max-h-[500px] overflow-y-auto -mx-4 px-4">
                      {exportData && exportData.sales.length > 0 ? (
                        exportData.sales.map((sale, idx) => (
                          <motion.div
                            key={sale.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.02, duration: 0.15 }}
                            className="bg-white dark:bg-gray-900 rounded-lg border border-border/40 dark:border-border/20 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold truncate">{sale.kodeExtend}</p>
                                <p className="text-[10px] text-muted-foreground">{sale.brand || '-'} &bull; {sale.dept || '-'}</p>
                              </div>
                              <p className="text-sm font-bold text-[#E14227] ml-2 tabular-nums">{fmtRp(sale.settle)}</p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span>{sale.tanggal}</span>
                              <span>Qty: {fmtNum(sale.qty)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              {sale.crew ? (
                                <div className="flex items-center gap-1.5">
                                  <Users className="w-3 h-3 text-[#9DB1CC]" />
                                  <span className="text-[11px] font-medium">{sale.crew.name}</span>
                                  {sale.program && (
                                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{sale.program}</Badge>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-[9px] text-orange-500 border-orange-300">Belum Claim</Badge>
                              )}
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="py-10 text-center">
                          <FileSpreadsheet className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Tidak ada data penjualan</p>
                        </div>
                      )}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block max-h-[500px] overflow-y-auto">
                      <Table className="table-stripe table-sticky-head">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>Kode Extend</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead>Dept</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Settle</TableHead>
                            <TableHead>Crew</TableHead>
                            <TableHead>Program</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {exportData && exportData.sales.length > 0 ? (
                            exportData.sales.map((sale, idx) => (
                              <motion.tr
                                key={sale.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.015 }}
                                className="transition-colors hover:bg-muted/30"
                              >
                                <TableCell className="text-xs text-muted-foreground/60 tabular-nums">{(page - 1) * 50 + idx + 1}</TableCell>
                                <TableCell className="text-xs font-medium">{sale.tanggal}</TableCell>
                                <TableCell className="text-xs font-mono font-semibold">{sale.kodeExtend}</TableCell>
                                <TableCell className="text-xs">{sale.brand || '-'}</TableCell>
                                <TableCell className="text-xs">{sale.dept || '-'}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{fmtNum(sale.qty)}</TableCell>
                                <TableCell className="text-xs text-right font-bold tabular-nums">{fmtRp(sale.settle)}</TableCell>
                                <TableCell className="text-xs">
                                  {sale.crew ? (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="font-medium">{sale.crew.name}</span>
                                      {sale.crew.group && <span className="text-[10px] text-muted-foreground">({sale.crew.group.name})</span>}
                                    </span>
                                  ) : (
                                    <span className="text-orange-500 text-[10px]">Belum Claim</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs">
                                  {sale.program ? <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{sale.program}</Badge> : '-'}
                                </TableCell>
                              </motion.tr>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={9} className="text-center py-12">
                                <div className="flex flex-col items-center">
                                  <FileSpreadsheet className="w-10 h-10 text-muted-foreground/40 mb-2" />
                                  <p className="text-sm text-muted-foreground">Tidak ada data penjualan</p>
                                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Coba ubah filter atau periode tanggal</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {exportData && exportData.totalPages > 1 && (
                      <div className="flex items-center justify-center gap-1.5 mt-4 pt-4 border-t border-border/40">
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        {pageNumbers.map((pn, i) =>
                          pn === '...' ? (
                            <span key={`dots-${i}`} className="px-1.5 text-xs text-muted-foreground">...</span>
                          ) : (
                            <Button
                              key={pn} size="icon" variant={pn === page ? 'default' : 'outline'}
                              className={`h-8 w-8 text-xs tabular-nums ${pn === page ? 'bg-[#E14227] hover:bg-[#B8321E] text-white' : ''}`}
                              onClick={() => setPage(pn as number)}
                            >
                              {pn}
                            </Button>
                          )
                        )}
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={page >= (exportData?.totalPages ?? 1)} onClick={() => setPage(p => Math.min(exportData?.totalPages ?? 1, p + 1))}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* ─── CREW SUMMARY VIEW ─── */}
                {viewMode === 'crew-summary' && (
                  <>
                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-2 max-h-[500px] overflow-y-auto -mx-4 px-4">
                      {crewReports.length > 0 ? (
                        crewReports.map((report, idx) => (
                          <motion.div
                            key={report.crewId}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.02, duration: 0.15 }}
                            className="bg-white dark:bg-gray-900 rounded-lg border border-border/40 dark:border-border/20 p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shrink-0">
                                  <Users className="w-3.5 h-3.5 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold truncate">{report.crewName}</p>
                                  <p className="text-[10px] text-muted-foreground">{report.groupName || 'Tanpa Group'}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-2">
                                <p className="text-sm font-bold text-[#E14227] tabular-nums">{fmtRp(report.totalSettle)}</p>
                                <p className="text-[10px] text-muted-foreground">{fmtNum(report.totalItems)} item</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1" onClick={() => handlePreviewCrew(report)}>
                                <Eye className="w-3 h-3" /> Preview
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 flex-1" onClick={() => handleExportPerCrew(report)}>
                                <FileDown className="w-3 h-3" /> Export
                              </Button>
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <div className="py-10 text-center">
                          <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Tidak ada data crew</p>
                        </div>
                      )}
                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden md:block max-h-[500px] overflow-y-auto">
                      <Table className="table-stripe table-sticky-head">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-10">#</TableHead>
                            <TableHead>Crew</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead className="text-right">Total Item</TableHead>
                            <TableHead className="text-right">Total Struk</TableHead>
                            <TableHead className="text-right">Total Qty</TableHead>
                            <TableHead className="text-right">Total Settle</TableHead>
                            <TableHead className="text-center w-[160px]">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {crewReports.length > 0 ? (
                            crewReports.map((report, idx) => (
                              <motion.tr
                                key={report.crewId}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: idx * 0.015 }}
                                className="transition-colors hover:bg-muted/30"
                              >
                                <TableCell className="text-xs text-muted-foreground/60 tabular-nums">{idx + 1}</TableCell>
                                <TableCell className="text-xs font-semibold">{report.crewName}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{report.groupName || '-'}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{fmtNum(report.totalItems)}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{fmtNum(report.totalStruk)}</TableCell>
                                <TableCell className="text-xs text-right tabular-nums">{fmtNum(report.totalQty)}</TableCell>
                                <TableCell className="text-xs text-right font-bold tabular-nums">{fmtRp(report.totalSettle)}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handlePreviewCrew(report)}>
                                      <Eye className="w-3 h-3" /> Preview
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => handleExportPerCrew(report)}>
                                      <FileDown className="w-3 h-3" /> CSV
                                    </Button>
                                  </div>
                                </TableCell>
                              </motion.tr>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-12">
                                <div className="flex flex-col items-center">
                                  <Users className="w-10 h-10 text-muted-foreground/40 mb-2" />
                                  <p className="text-sm text-muted-foreground">Tidak ada data crew</p>
                                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">Coba ubah filter atau periode tanggal</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}

              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ═══════════════════════════════════════════════
          CREW PREVIEW DIALOG (slide-up panel)
          ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {previewCrew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
              onClick={() => setPreviewCrew(null)}
            />
            {/* Panel */}
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative z-10 w-full sm:max-w-2xl max-h-[85vh] bg-white dark:bg-gray-900 sm:rounded-xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate">{previewCrew.crewName}</p>
                    <p className="text-[10px] text-muted-foreground">{previewCrew.groupName || 'Tanpa Group'} &bull; {fmtRp(previewCrew.totalSettle)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => handleExportPerCrew(previewCrew)}>
                    <FileDown className="w-3.5 h-3.5" /> Export
                  </Button>
                  <button onClick={() => setPreviewCrew(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Summary pills */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto scrollbar-none pb-1">
                  <div className="shrink-0 px-3 py-1.5 rounded-lg bg-[#F0D5C5]/60 dark:bg-[#B8321E]/20 border border-[#E6BAA3]/60 dark:border-[#B8321E]/30">
                    <p className="text-[10px] text-muted-foreground">Item</p>
                    <p className="text-xs font-bold tabular-nums">{fmtNum(previewCrew.totalItems)}</p>
                  </div>
                  <div className="shrink-0 px-3 py-1.5 rounded-lg bg-[#B5C7DB]/60 dark:bg-[#7E95B3]/20 border border-[#9DB1CC]/60 dark:border-[#7E95B3]/30">
                    <p className="text-[10px] text-muted-foreground">Struk</p>
                    <p className="text-xs font-bold tabular-nums">{fmtNum(previewCrew.totalStruk)}</p>
                  </div>
                  <div className="shrink-0 px-3 py-1.5 rounded-lg bg-[#E6BAA3]/60 dark:bg-[#D4956B]/20 border border-[#D4956B]/60 dark:border-[#D4956B]/30">
                    <p className="text-[10px] text-muted-foreground">Qty</p>
                    <p className="text-xs font-bold tabular-nums">{fmtNum(previewCrew.totalQty)}</p>
                  </div>
                </div>

                {/* Sales list */}
                <div className="space-y-1.5">
                  {previewSales.length > 0 ? (
                    previewSales.map((sale, idx) => (
                      <div key={sale.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/30">
                        <div className="min-w-0 flex-1 mr-3">
                          <p className="text-xs font-semibold truncate">{sale.kodeExtend}</p>
                          <p className="text-[10px] text-muted-foreground">{sale.tanggal} &bull; {sale.brand || '-'} &bull; Qty {fmtNum(sale.qty)}</p>
                        </div>
                        <p className="text-xs font-bold text-[#E14227] tabular-nums shrink-0">{fmtRp(sale.settle)}</p>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-sm text-muted-foreground">Memuat data...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </motion.div>
    </TabsContent>
  )
})

export default ExportTab
