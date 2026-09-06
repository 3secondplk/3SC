'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  ChevronLeft, ChevronRight, CalendarDays, FileSpreadsheet, Users, Filter,
} from 'lucide-react'
import { fmtRp, fmtNum, fadeIn, stagger, safeFetch, getWIBToday, getWeekRange, getMonthRange, getPageNumbers } from '@/lib/cms-utils'
import type { Crew, Group } from '@/lib/cms-types'

// ─── Types ─────────────────────────────────────────────
interface ManagementReportProps {
  crews: Crew[]
  groups: Group[]
  isAdmin: boolean
}

interface ReportSale {
  id: string
  tanggal: string
  kodeExtend: string
  brand: string | null
  dept: string | null
  qty: number
  settle: number
  program: string | null
  crew: { id: string; name: string; employeeId: string; photo: string | null; group: { id: string; name: string } | null } | null
}

interface ReportSummary {
  totalQty: number
  totalSettle: number
  totalStruk: number
  basketSize: number
  pricePoint: number
}

interface ReportCrewInfo {
  id: string
  name: string
  groupName: string
}

interface ReportData {
  sales: ReportSale[]
  total: number
  totalPages: number
  page: number
  summary: ReportSummary
  crewInfo: ReportCrewInfo | null
}

// ─── Quick filter chips ─────────────────────────────────
type QuickFilter = 'today' | 'week' | 'month' | 'all'

const quickFilters: { key: QuickFilter; label: string }[] = [
  { key: 'today', label: 'Hari Ini' },
  { key: 'week', label: 'Minggu Ini' },
  { key: 'month', label: 'Bulan Ini' },
  { key: 'all', label: 'Semua' },
]

// ─── Component ──────────────────────────────────────────
const ManagementReport = React.memo(function ManagementReport({
  crews,
  groups,
  isAdmin,
}: ManagementReportProps) {
  // Filter state
  const [selectedCrewId, setSelectedCrewId] = useState<string>('')
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [searchInput, setSearchInput] = useState<string>('')
  const [debouncedSearch, setDebouncedSearch] = useState<string>('')
  const [page, setPage] = useState(1)

  // Data state
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [subsequentLoading, setSubsequentLoading] = useState(false)

  // Refs
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstLoadRef = useRef(true)

  // ─── Debounced search (500ms using useRef + setTimeout) ───
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput)
    }, 500)
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [searchInput])

  // ─── Reset page when filters change ───
  useEffect(() => {
    setPage(1)
  }, [selectedCrewId, selectedGroupId, dateFrom, dateTo, debouncedSearch])

  // ─── Determine effective crewId (selected crew filtered by group) ───
  const effectiveCrewId = useMemo(() => {
    if (selectedGroupId) {
      // When a group is selected, override crewId to empty (show all in group)
      return ''
    }
    return selectedCrewId
  }, [selectedCrewId, selectedGroupId])

  // ─── Build query params ───
  const queryParams = useMemo(() => {
    const params = new URLSearchParams()
    if (effectiveCrewId) params.set('crewId', effectiveCrewId)
    if (selectedGroupId) params.set('groupId', selectedGroupId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (debouncedSearch) params.set('search', debouncedSearch)
    params.set('page', String(page))
    params.set('limit', '50')
    return params.toString()
  }, [effectiveCrewId, selectedGroupId, dateFrom, dateTo, debouncedSearch, page])

  // ─── Fetch report data ───
  const fetchReport = useCallback(async () => {
    if (!isAdmin) return

    if (isFirstLoadRef.current) {
      setInitialLoading(true)
    } else {
      setSubsequentLoading(true)
    }

    try {
      const res = await safeFetch(`/api/management/report?${queryParams}`)
      if (res.ok) {
        const data = await res.json()
        setReportData(data)
      }
    } catch (err) {
      console.error('Failed to fetch report:', err)
    } finally {
      setInitialLoading(false)
      setSubsequentLoading(false)
      isFirstLoadRef.current = false
    }
  }, [isAdmin, queryParams])

  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // ─── Quick filter handler ───
  const handleQuickFilter = useCallback((filter: QuickFilter) => {
    const today = getWIBToday()
    switch (filter) {
      case 'today':
        setDateFrom(today)
        setDateTo(today)
        break
      case 'week': {
        const wr = getWeekRange()
        setDateFrom(wr.from)
        setDateTo(wr.to)
        break
      }
      case 'month': {
        const mr = getMonthRange()
        setDateFrom(mr.from)
        setDateTo(mr.to)
        break
      }
      case 'all':
        setDateFrom('')
        setDateTo('')
        break
    }
  }, [])

  // ─── Export CSV ───
  const handleExport = useCallback(() => {
    const params = new URLSearchParams()
    if (effectiveCrewId) params.set('crewId', effectiveCrewId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    const qs = params.toString()
    window.open(`/api/export?${qs}`, '_blank')
  }, [effectiveCrewId, dateFrom, dateTo])

  // ─── Filtered crews for crew dropdown (based on selected group) ───
  const filteredCrews = useMemo(() => {
    if (selectedGroupId) {
      return crews.filter(c => c.groupId === selectedGroupId)
    }
    return crews
  }, [crews, selectedGroupId])

  // ─── Page numbers for pagination ───
  const pageNumbers = useMemo(() => {
    if (!reportData) return []
    return getPageNumbers(page, reportData.totalPages)
  }, [reportData, page])

  // ─── Summary stat cards config ───
  const summaryCards = [
    {
      label: 'Total Settle',
      value: reportData?.summary.totalSettle ?? 0,
      format: fmtRp,
      icon: DollarSign,
      gradient: 'from-[#E14227] to-[#B8321E]',
      accent: 'border-l-[#E14227]',
    },
    {
      label: 'Total Qty',
      value: reportData?.summary.totalQty ?? 0,
      format: fmtNum,
      icon: Hash,
      gradient: 'from-[#9DB1CC] to-[#7E95B3]',
      accent: 'border-l-[#9DB1CC]',
    },
    {
      label: 'Total Struk',
      value: reportData?.summary.totalStruk ?? 0,
      format: fmtNum,
      icon: ShoppingCart,
      gradient: 'from-[#D4956B] to-[#B8321E]',
      accent: 'border-l-[#D4956B]',
    },
    {
      label: 'Basket Size',
      value: reportData?.summary.basketSize ?? 0,
      format: (n: number) => n.toFixed(1),
      icon: TrendingUp,
      gradient: 'from-[#E6BAA3] to-[#D4956B]',
      accent: 'border-l-[#E6BAA3]',
    },
  ]

  // ─── Price point card (special layout) ───
  const pricePoint = reportData?.summary.pricePoint ?? 0

  // ═══════════════════════════════════════════════════
  // INITIAL LOADING SKELETON
  // ═══════════════════════════════════════════════════
  if (!isAdmin) return null

  if (initialLoading) {
    return (
      <motion.div {...stagger} className="space-y-5">
        {/* Filter skeleton */}
        <Card className="border-0 shadow-lg glass-card">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-8 w-20 rounded-full" />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary skeleton */}
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

        {/* Zoning summary skeleton */}
        <Card className="border-0 shadow-lg glass-card">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-44 rounded" />
                <Skeleton className="h-2.5 w-64 rounded" />
              </div>
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </CardContent>
        </Card>

        {/* Table skeleton */}
        <Card className="border-0 shadow-lg glass-card">
          <CardContent className="p-4">
            <Skeleton className="h-8 w-48 rounded mb-4" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  // ═══════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════
  return (
    <motion.div {...stagger} className="space-y-5">
      {/* ═══════════════════════════════════════════════
          FILTERS SECTION
          ═══════════════════════════════════════════════ */}
      <Card className="border-0 shadow-lg glass-card">
        <CardContent className="p-4 space-y-4">
          {/* Top row: Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 glass-stat"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />Sampai
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 glass-stat"
              />
            </div>
          </div>

          {/* Quick filter chips + Search + Export */}
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

            {/* Separator */}
            <div className="hidden sm:block w-px h-6 bg-border/50 mx-1" />

            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Cari kode, brand, dept..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-9 pl-8 pr-8 text-xs glass-stat"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

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
            {(selectedCrewId || selectedGroupId || dateFrom || dateTo || debouncedSearch) && (
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
                {debouncedSearch && (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                    &ldquo;{debouncedSearch}&rdquo;
                    <button onClick={() => setSearchInput('')} className="ml-1 hover:text-destructive"><X className="w-2.5 h-2.5 inline" /></button>
                  </Badge>
                )}
                <button
                  onClick={() => {
                    setSelectedCrewId('')
                    setSelectedGroupId('')
                    setDateFrom('')
                    setDateTo('')
                    setSearchInput('')
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

      {/* ═══════════════════════════════════════════════
          SUMMARY STAT CARDS
          ═══════════════════════════════════════════════ */}
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
                {fmtRp(pricePoint)}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════
          SALES TABLE
          ═══════════════════════════════════════════════ */}
      <Card className="border-0 shadow-lg overflow-hidden glass-card">
        <CardContent className="p-4">
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                <FileSpreadsheet className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Laporan Penjualan</h3>
                <p className="text-[10px] text-muted-foreground">
                  {reportData?.total ?? 0} transaksi
                  {reportData?.crewInfo && (
                    <span className="ml-1">
                      &bull; <span className="font-semibold text-[#E14227]">{reportData.crewInfo.name}</span>
                      {reportData.crewInfo.groupName && (
                        <span className="ml-0.5 text-muted-foreground">({reportData.crewInfo.groupName})</span>
                      )}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] tabular-nums font-semibold">
              Hal {page} / {reportData?.totalPages ?? 1}
            </Badge>
          </div>

          {/* Loading overlay for subsequent loads */}
          <div className="relative">
            <AnimatePresence>
              {subsequentLoading && (
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

            <div className={subsequentLoading ? 'pointer-events-none opacity-70' : ''}>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2 max-h-[500px] overflow-y-auto -mx-4 px-4">
                {reportData && reportData.sales.length > 0 ? (
                  reportData.sales.map((sale, idx) => (
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
                          <p className="text-[10px] text-muted-foreground">{sale.brand || '—'} &bull; {sale.dept || '—'}</p>
                        </div>
                        <p className="text-sm font-bold text-[#E14227] ml-2 tabular-nums">{fmtRp(sale.settle)}</p>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{sale.tanggal}</span>
                        <span>Qty: {fmtNum(sale.qty)}</span>
                      </div>
                      {sale.crew && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3 h-3 text-[#9DB1CC]" />
                          <span className="text-[11px] font-medium">{sale.crew.name}</span>
                          {sale.program && (
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 ml-auto">{sale.program}</Badge>
                          )}
                        </div>
                      )}
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
                    {reportData && reportData.sales.length > 0 ? (
                      reportData.sales.map((sale, idx) => (
                        <motion.tr
                          key={sale.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.015 }}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <TableCell className="text-xs text-muted-foreground/60 tabular-nums">
                            {(page - 1) * 50 + idx + 1}
                          </TableCell>
                          <TableCell className="text-xs font-medium">{sale.tanggal}</TableCell>
                          <TableCell className="text-xs font-mono font-semibold">{sale.kodeExtend}</TableCell>
                          <TableCell className="text-xs">{sale.brand || '—'}</TableCell>
                          <TableCell className="text-xs">{sale.dept || '—'}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{fmtNum(sale.qty)}</TableCell>
                          <TableCell className="text-xs text-right font-bold tabular-nums">{fmtRp(sale.settle)}</TableCell>
                          <TableCell className="text-xs">
                            {sale.crew ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="font-medium">{sale.crew.name}</span>
                                {sale.crew.group && (
                                  <span className="text-[10px] text-muted-foreground">({sale.crew.group.name})</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {sale.program ? (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">{sale.program}</Badge>
                            ) : '—'}
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
            </div>
          </div>

          {/* ═══════════════════════════════════════════════
              PAGINATION
              ═══════════════════════════════════════════════ */}
          {reportData && reportData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-4 pt-4 border-t border-border/40">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {pageNumbers.map((pn, i) =>
                pn === '...' ? (
                  <span key={`dots-${i}`} className="px-1.5 text-xs text-muted-foreground">...</span>
                ) : (
                  <Button
                    key={pn}
                    size="icon"
                    variant={pn === page ? 'default' : 'outline'}
                    className={`h-8 w-8 text-xs tabular-nums ${
                      pn === page
                        ? 'bg-[#E14227] hover:bg-[#B8321E] text-white'
                        : ''
                    }`}
                    onClick={() => setPage(pn as number)}
                  >
                    {pn}
                  </Button>
                )
              )}
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8"
                disabled={page >= (reportData?.totalPages ?? 1)}
                onClick={() => setPage(p => Math.min(reportData?.totalPages ?? 1, p + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
})

export default ManagementReport
