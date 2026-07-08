'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Upload, ShoppingCart, UploadCloud, Download, Trash2, Search, CheckCircle2,
  Clock, Flame, Sparkles, Users, Calendar, CalendarDays, CalendarRange,
  Package, PartyPopper, FileSpreadsheet, Edit2, X,
  ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight,
  SlidersHorizontal, ChevronDown, Zap, Trophy, BarChart3,
  Pencil, RotateCcw, Loader2,
} from 'lucide-react'
import { fmtRp, fmtNum, fadeIn, stagger, AnimatedCounter, SkeletonRow, timeAgo, getDeptColor, getPageNumbers, getWeekRange, getMonthRange } from '@/lib/cms-utils'
import type { ClaimSale, Crew } from '@/lib/cms-types'
import { toast } from 'sonner'
import UploadModal from '@/components/modals/UploadModal'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import BulkEditDialog from '@/components/claims/BulkEditDialog'

// Lightweight count-up animator for ClaimsTab
const CountUp = ({ value, format }: { value: number; format: (n: number) => string }) => {
  const [display, setDisplay] = React.useState(0)
  React.useEffect(() => {
    const end = Math.abs(value)
    const duration = 1200
    const steps = 75
    const increment = end / steps
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= end) { setDisplay(end); clearInterval(timer) }
      else setDisplay(Math.floor(current))
    }, duration / steps)
    return () => clearInterval(timer)
  }, [value])
  return <>{format(display)}</>
}

// ─── Claim Progress Ring (SVG circular) ───────────────
const ClaimProgressRing = ({ percentage, size = 140, strokeWidth = 10 }: { percentage: number; size?: number; strokeWidth?: number }) => {
  const [animatedPct, setAnimatedPct] = useState(0)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animatedPct / 100) * circumference
  const center = size / 2

  useEffect(() => {
    let current = 0
    const end = Math.min(Math.max(percentage, 0), 100)
    const steps = 60
    const duration = 1200
    const increment = end / steps
    const timer = setInterval(() => {
      current += increment
      if (current >= end) { setAnimatedPct(end); clearInterval(timer) }
      else setAnimatedPct(Math.floor(current * 10) / 10)
    }, duration / steps)
    return () => clearInterval(timer)
  }, [percentage])

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E14227" />
            <stop offset="50%" stopColor="#D4956B" />
            <stop offset="100%" stopColor="#B8321E" />
          </linearGradient>
        </defs>
        {/* Background circle */}
        <circle
          cx={center} cy={center} r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Animated progress arc */}
        <motion.circle
          cx={center} cy={center} r={radius}
          fill="none"
          stroke="url(#ring-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.15 }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-[#E14227] to-[#D4956B] bg-clip-text text-transparent tabular-nums">
          {Math.round(animatedPct)}%
        </span>
        <span className="text-[10px] sm:text-xs font-semibold text-muted-foreground mt-0.5">Tingkat Klaim</span>
      </div>
    </div>
  )
}

interface ClaimsTabProps {
  // Data
  claimSales: ClaimSale[]
  claimTotal: number
  claimTotalPages: number
  claimPage: number
  claimSearch: string
  claimDateFrom: string
  claimDateTo: string
  claimFilterProgram: string
  claimFilterCrew: string
  claimShowClaimed: 'unclaimed' | 'claimed' | 'all'
  claimsLoading: boolean
  claimSortField: string
  claimSortDir: 'asc' | 'desc'
  programs: string[]
  crews: Crew[]
  selectedSaleIds: Set<string>
  claimCrewSearch: string
  selectedClaimCrewId: string
  claimSummary: { totalQty: number; totalSettle: number; totalStruk: number; basketSize: number; pricePoint: number } | null
  isAdmin: boolean
  todayStr: string
  // Computed (sortedClaimSales is no longer used — we compute sortedDisplaySales locally)
  sortedClaimSales: ClaimSale[]
  selectedItemsTotal: number
  selectedItemsPreview: ClaimSale[]
  selectedClaimCrew: Crew | null
  claimCrewResults: Crew[]
  claimStats: { unclaimedCount: number; claimedCount: number; unclaimedSettle: number; claimedSettle: number; todayActivity: number; todaySettle: number; todayItems: number; todayStruk: number }
  globalClaimedCount: number
  globalUnclaimedCount: number
  activeQuickFilter: 'today' | 'week' | 'month' | 'all' | 'custom'
  activeFilterCount: number
  // Upload state
  uploading: boolean
  uploadProgress: number
  uploadResult: { totalRows: number; totalQty: number; totalSettle: number; uniqueProducts: number; duplicateRows?: number } | null
  showUploadModal: boolean
  isDragOver: boolean
  claiming: boolean
  showFilterPanel: boolean
  batchSelectedIds: Set<string>
  // Refs
  fileInputRef: React.RefObject<HTMLInputElement | null>
  // Setters
  setClaimSearch?: (v: string) => void
  updateClaimSearch: (v: string, immediate?: boolean) => void
  forceSearchNow?: () => void
  isSearchDebouncing?: boolean
  setClaimDateFrom: (v: string) => void
  setClaimDateTo: (v: string) => void
  setClaimFilterProgram: (v: string) => void
  setClaimFilterCrew: (v: string) => void
  setClaimShowClaimed: (v: 'unclaimed' | 'claimed' | 'all') => void
  setClaimSortField: (v: string) => void
  setClaimSortDir: (v: 'asc' | 'desc' | ((prev: 'asc' | 'desc') => 'asc' | 'desc')) => void
  setSelectedSaleIds: (s: Set<string>) => void
  setClaimCrewSearch: (v: string) => void
  setSelectedClaimCrewId: (v: string) => void
  setShowUploadModal: (v: boolean) => void
  setIsDragOver: (v: boolean) => void
  setShowFilterPanel: (v: boolean) => void
  setBatchSelectedIds: (s: Set<string>) => void
  // Handlers
  fetchClaims: (page: number) => void
  handleClaimSales: (retryCount?: number) => void
  handleExport: () => void
  handleUnclaimSale: (id: string) => void
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleDropFile: (file: File) => void
  openEditSale: (sale: ClaimSale) => void
  setDeleteConfirm: (v: { type: 'crew' | 'group' | 'sale' | 'batch-sale'; ids?: string[]; id?: string; name: string } | null) => void
  setActiveTab: (v: string) => void
}

const ClaimsTab = React.memo(function ClaimsTab(props: ClaimsTabProps) {
  // Bulk edit dialog state (self-contained, no extra props needed)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [bulkUnclaiming, setBulkUnclaiming] = useState(false)

  const handleBulkUnclaim = async () => {
    if (batchSelectedIds.size === 0) return
    setBulkUnclaiming(true)
    try {
      const res = await fetch('/api/claims/bulk-unclaim', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds: Array.from(batchSelectedIds) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')
      if (data.updated > 0) {
        toast.success(`✅ ${data.updated} penjualan berhasil di-unclaim`)
      } else {
        toast.info('Tidak ada penjualan yang di-unclaim')
      }
      setBatchSelectedIds(new Set())
      fetchClaims(claimPage)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal unclaim')
    } finally {
      setBulkUnclaiming(false)
    }
  }
  const {
    claimSales, claimTotal, claimTotalPages, claimPage, claimSearch,
    claimDateFrom, claimDateTo, claimFilterProgram, claimFilterCrew, claimShowClaimed,
    claimsLoading, claimSortField, claimSortDir,
    programs, crews, selectedSaleIds, claimCrewSearch, selectedClaimCrewId,
    claimSummary, isAdmin, todayStr,
    sortedClaimSales: _sortedClaimSales, selectedItemsTotal, selectedItemsPreview, selectedClaimCrew, claimCrewResults,
    claimStats, globalClaimedCount, globalUnclaimedCount, activeQuickFilter, activeFilterCount,
    uploading, uploadProgress, uploadResult, showUploadModal, isDragOver,
    claiming, showFilterPanel, batchSelectedIds,
    fileInputRef,
    updateClaimSearch, setClaimDateFrom, setClaimDateTo,
    setClaimFilterProgram, setClaimFilterCrew, setClaimShowClaimed,
    setClaimSortField, setClaimSortDir,
    setSelectedSaleIds, setClaimCrewSearch, setSelectedClaimCrewId,
    setShowUploadModal, setIsDragOver, setShowFilterPanel, setBatchSelectedIds,
    fetchClaims, handleClaimSales, handleExport, handleUnclaimSale,
    handleFileUpload, handleDropFile, openEditSale, setDeleteConfirm, setActiveTab,
  } = props

  // ─── Local search state (prevents full page re-renders on every keystroke) ───
  // The input uses local state for display. Parent's updateClaimSearch is only called
  // when clearing search, avoiding full page.tsx re-renders on every keystroke.
  const [searchText, setSearchText] = useState(claimSearch)
  const localDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [localSearchLoading, setLocalSearchLoading] = useState(false)
  const [localSearchResults, setLocalSearchResults] = useState<ClaimSale[] | null>(null)
  const [localSearchTotal, setLocalSearchTotal] = useState(0)
  const [localSearchTotalPages, setLocalSearchTotalPages] = useState(1)
  const [localSearchPage, setLocalSearchPage] = useState(1)
  const [localSearchSummary, setLocalSearchSummary] = useState<{ totalQty: number; totalSettle: number; totalStruk: number; basketSize: number; pricePoint: number } | null>(null)

  const isLocalSearching = localSearchResults !== null

  // Determine which data to display: local search results or parent's data
  const displaySales = isLocalSearching ? localSearchResults! : claimSales
  const displayTotal = isLocalSearching ? localSearchTotal : claimTotal
  const displayTotalPages = isLocalSearching ? localSearchTotalPages : claimTotalPages
  const displayPage = isLocalSearching ? localSearchPage : claimPage
  const displaySummary = isLocalSearching ? localSearchSummary : claimSummary

  // Local search fetch — calls the new /api/claims/search endpoint
  const fetchLocalSearch = React.useCallback(async (query: string, page: number) => {
    if (!query.trim()) {
      setLocalSearchResults(null)
      return
    }
    setLocalSearchLoading(true)
    try {
      const params = new URLSearchParams({ search: query, page: String(page), limit: '50' })
      if (claimDateFrom) params.set('dateFrom', claimDateFrom)
      if (claimDateTo) params.set('dateTo', claimDateTo)
      if (claimFilterProgram) params.set('program', claimFilterProgram)
      if (claimFilterCrew) params.set('crewId', claimFilterCrew)
      if (claimShowClaimed !== 'all') params.set('claimed', claimShowClaimed === 'claimed' ? 'true' : 'false')
      const r = await fetch(`/api/claims/search?${params}`)
      const d = await r.json()
      setLocalSearchResults(d.sales || [])
      setLocalSearchTotal(d.total || 0)
      setLocalSearchTotalPages(d.totalPages || 1)
      setLocalSearchPage(d.page || 1)
      if (d.summary) setLocalSearchSummary(d.summary)
    } catch {
      setLocalSearchResults(null)
    } finally {
      setLocalSearchLoading(false)
    }
  }, [claimDateFrom, claimDateTo, claimFilterProgram, claimFilterCrew, claimShowClaimed])

  // Local onChange handler — ONLY updates local state + calls local search API.
  // Does NOT trigger parent state change, preventing full page.tsx re-render on every keystroke.
  // NOTE: Barcode scanner 11-char trim is handled in the BACKEND (kodeExtend only).
  // Frontend sends full text so brand/dept/modul/crew searches still work with long queries.
  const handleSearchChange = React.useCallback((value: string) => {
    setSearchText(value)
    const trimmed = value.replace(/[\r\n]+$/g, '').trim()
    if (localDebounceRef.current) clearTimeout(localDebounceRef.current)
    if (trimmed === '') {
      // Clear local search, sync parent to empty so it fetches fresh data
      setLocalSearchResults(null)
      updateClaimSearch('', true)
    } else {
      // Debounced local search to avoid spamming API on every keystroke
      localDebounceRef.current = setTimeout(() => {
        fetchLocalSearch(trimmed, 1)
      }, 300)
    }
  }, [updateClaimSearch, fetchLocalSearch])

  // Clear search handler
  const clearSearch = React.useCallback(() => {
    setSearchText('')
    setLocalSearchResults(null)
    if (localDebounceRef.current) clearTimeout(localDebounceRef.current)
    updateClaimSearch('', true) // Sync parent to empty so it fetches fresh data
  }, [updateClaimSearch])

  // Enter key handler (barcode scanner / manual) — immediate local search only
  // NOTE: Barcode scanner 11-char trim is handled in the BACKEND (kodeExtend only).
  const handleSearchEnter = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (localDebounceRef.current) clearTimeout(localDebounceRef.current)
      const trimmed = searchText.replace(/[\r\n]+$/g, '').trim()
      setSearchText(trimmed)
      // Only use local search — NO parent state change, no page re-render
      fetchLocalSearch(trimmed, 1)
    }
  }, [searchText, fetchLocalSearch])

  // Re-trigger local search when other filters change while search is active
  // (e.g. user changes date range while having a search term active)
  const activeSearchRef = useRef(searchText)
  activeSearchRef.current = searchText
  React.useEffect(() => {
    if (isLocalSearching && activeSearchRef.current.trim()) {
      fetchLocalSearch(activeSearchRef.current.trim(), 1)
    }
  }, [claimDateFrom, claimDateTo, claimFilterProgram, claimFilterCrew, claimShowClaimed, isLocalSearching, fetchLocalSearch])

  // Cleanup local debounce on unmount
  React.useEffect(() => {
    return () => { if (localDebounceRef.current) clearTimeout(localDebounceRef.current) }
  }, [])

  // Sort local search results the same way page.tsx sorts claimSales
  const sortedDisplaySales = React.useMemo(() => {
    const data = displaySales
    return [...data].sort((a, b) => {
      const dir = claimSortDir === 'asc' ? 1 : -1
      if (claimSortField === 'tanggal') return dir * a.tanggal.localeCompare(b.tanggal)
      if (claimSortField === 'qty') return dir * (a.qty - b.qty)
      if (claimSortField === 'settle') return dir * (a.settle - b.settle)
      if (claimSortField === 'kodeExtend') return dir * a.kodeExtend.localeCompare(b.kodeExtend)
      if (claimSortField === 'dept') return dir * (a.dept || '').localeCompare(b.dept || '')
      if (claimSortField === 'brand') return dir * (a.brand || '').localeCompare(b.brand || '')
      return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    })
  }, [displaySales, claimSortField, claimSortDir])

  // Computed display loading: use local search loading when doing local search
  const displayLoading = isLocalSearching ? localSearchLoading : claimsLoading
  // Debounce indicator: show when typing but local search hasn't finished yet
  const displayDebouncing = isLocalSearching && localSearchLoading && searchText.trim() !== ''

  return (
    <TabsContent value="claims" className="mt-4 sm:mt-6 pb-24 md:pb-8 overflow-hidden">
      <motion.div {...stagger} className="space-y-6">
        {/* Upload Modal Dialog */}
        <UploadModal
          showUploadModal={showUploadModal}
          setShowUploadModal={setShowUploadModal}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadResult={uploadResult}
          isDragOver={isDragOver}
          setIsDragOver={setIsDragOver}
          fileInputRef={fileInputRef}
          handleFileUpload={handleFileUpload}
          handleDropFile={handleDropFile}
        />

        {/* ── Claim Progress Overview — Progress Ring + Quick Stats ── */}
        {!claimsLoading && claimStats && (() => {
          const totalData = globalClaimedCount + globalUnclaimedCount
          const claimRate = totalData > 0 ? (globalClaimedCount / totalData) * 100 : 0
          if (totalData === 0) return null
          return (
            <motion.div {...fadeIn} transition={{ delay: 0.02 }}>
              <div className="glass-card rounded-xl p-4 sm:p-5">
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                  {/* Progress Ring */}
                  <div className="shrink-0">
                    <ClaimProgressRing percentage={claimRate} size={130} strokeWidth={9} />
                  </div>

                  {/* Mini Stat Pills */}
                  <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 w-full sm:flex-1 sm:justify-center">
                    {[
                      {
                        label: 'Belum Di-claim',
                        value: globalUnclaimedCount,
                        badgeClass: 'bg-[#F0D5C5] text-[#B8321E] dark:bg-[#B8321E]/40 dark:text-[#E6BAA3] border-[#E6BAA3]/60 dark:border-[#B8321E]/40',
                        dotClass: 'bg-[#E6BAA3]',
                        iconColor: 'text-[#E6BAA3]',
                      },
                      {
                        label: 'Sudah Di-claim',
                        value: globalClaimedCount,
                        badgeClass: 'bg-[#F0D5C5] text-[#B8321E] dark:bg-[#B8321E]/40 dark:text-[#F07050] border-[#E6BAA3]/60 dark:border-[#B8321E]/40',
                        dotClass: 'bg-[#E14227]',
                        iconColor: 'text-[#E14227]',
                      },
                      {
                        label: 'Total Data',
                        value: totalData,
                        badgeClass: 'bg-[#B5C7DB] text-[#7E95B3] dark:bg-[#7E95B3]/40 dark:text-[#B5C7DB] border-[#9DB1CC]/60 dark:border-[#7E95B3]/40',
                        dotClass: 'bg-[#9DB1CC]',
                        iconColor: 'text-[#9DB1CC]',
                      },
                    ].map((stat, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.1, type: 'spring', stiffness: 200, damping: 18 }}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border/50 dark:border-border/30 bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm w-full sm:w-auto sm:min-w-[140px]"
                      >
                        <div className={`w-2 h-2 rounded-full ${stat.dotClass} shrink-0`} />
                        <div className="flex flex-col">
                          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{stat.label}</span>
                          <span className={`text-sm sm:text-base font-bold tabular-nums ${stat.iconColor}`}>
                            {fmtNum(stat.value)}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )
        })()}

        {/* ── Section A: Import Hari Ini (Hero) — always uses parent data (not affected by search) ── */}
        {claimTotal > 0 && !claimsLoading && (
          <motion.div {...fadeIn} transition={{ delay: 0.05 }}>
            <div className="relative overflow-hidden rounded-xl border border-[#E6BAA3]/60 dark:border-[#B8321E]/40 bg-gradient-to-r from-[#F0D5C5] to-[#B5C7DB]/60 dark:from-[#B8321E]/20 dark:to-[#7E95B3]/10 p-4">
              {/* Decorative bg circle */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#E14227] to-[#9DB1CC] opacity-[0.07] rounded-full -translate-y-8 translate-x-8" />
              {/* Shimmer sweep overlay */}
              <div className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer-sweep pointer-events-none" />
              <div className="relative flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-lg shadow-[#E14227]/20 shrink-0">
                  <CalendarDays className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">Import Hari Ini</p>
                  <p className="text-xl sm:text-2xl font-extrabold text-[#B8321E] dark:text-[#F07050] tracking-tight tabular-nums">
                    <CountUp value={claimStats.todaySettle} format={fmtRp} />
                  </p>
                </div>
                <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                  <div className="text-center">
                    <p className="text-base sm:text-lg font-bold text-[#B8321E] dark:text-[#F07050] tabular-nums">
                      <CountUp value={claimStats.todayItems} format={fmtNum} />
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium">item</p>
                  </div>
                  <div className="w-px h-8 bg-[#E6BAA3]/60 dark:bg-[#B8321E]/40" />
                  <div className="text-center">
                    <p className="text-base sm:text-lg font-bold text-[#B8321E] dark:text-[#F07050] tabular-nums">
                      <CountUp value={claimStats.todayStruk} format={fmtNum} />
                    </p>
                    <p className="text-[10px] text-muted-foreground font-medium">struk</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Section B: Progress Claim Overview — always uses parent data (not affected by search) ── */}
        {claimSummary && claimTotal > 0 && !claimsLoading && (() => {
          const totalGlobal = globalClaimedCount + globalUnclaimedCount
          const claimedPct = totalGlobal > 0 ? Math.round((globalClaimedCount / totalGlobal) * 100) : 0
          const unclaimedPct = totalGlobal > 0 ? 100 - claimedPct : 0
          const totalSettle = claimSummary.totalSettle ?? 0
          return (
            <motion.div {...fadeIn} transition={{ delay: 0.1 }}>
              <Card className="border-0 shadow-lg card-hover-glow overflow-hidden">
                <CardContent className="p-4 sm:p-6 space-y-5">
                  {/* Total Settle Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Settle</p>
                      <p className="text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums">
                        <CountUp value={totalSettle} format={fmtRp} />
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] sm:text-xs">{fmtNum(claimTotal)} data</Badge>
                    </div>
                  </div>

                  {/* Dual Progress Bar */}
                  <div className="space-y-2">
                    <div className="h-3 sm:h-4 rounded-full bg-muted/80 overflow-hidden flex shadow-inner">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${claimedPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                        className="bg-gradient-to-r from-[#F07050] to-[#E14227] h-full rounded-l-full"
                      />
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${unclaimedPct}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.4 }}
                        className="bg-gradient-to-r from-[#E6BAA3] to-[#D4956B] h-full rounded-r-full"
                      />
                    </div>
                    <div className="flex justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[#E14227]" />
                        <span className="text-[10px] sm:text-xs font-semibold text-[#B8321E] dark:text-[#F07050]">Claimed {claimedPct}%</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">({globalClaimedCount} data)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] sm:text-xs text-muted-foreground">({globalUnclaimedCount} data)</span>
                        <span className="text-[10px] sm:text-xs font-semibold text-[#B8321E] dark:text-[#E6BAA3]">Unclaimed {unclaimedPct}%</span>
                        <div className="w-2 h-2 rounded-full bg-[#E6BAA3]" />
                      </div>
                    </div>
                  </div>

                  {/* 4 Mini Stat Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                      { label: 'Total Struk', rawValue: claimSummary.totalStruk ?? 0, format: fmtNum, icon: FileSpreadsheet, gradient: 'from-[#E14227] to-[#9DB1CC]', shadow: 'shadow-[#E14227]/20', sub: 'transaksi' },
                      { label: 'Basket Size', rawValue: claimSummary.basketSize ?? 0, format: (n: number) => n.toFixed(2), icon: ShoppingCart, gradient: 'from-purple-500 to-violet-600', shadow: 'shadow-purple-500/20', sub: 'per struk' },
                      { label: 'Price Point', rawValue: claimSummary.pricePoint ?? 0, format: fmtRp, icon: Sparkles, gradient: 'from-[#9DB1CC] to-[#7E95B3]', shadow: 'shadow-[#9DB1CC]/20', sub: 'per item' },
                      { label: 'Total Qty', rawValue: claimSummary.totalQty ?? 0, format: fmtNum, icon: Package, gradient: 'from-[#E6BAA3] to-[#D4956B]', shadow: 'shadow-[#E6BAA3]/20', sub: 'jumlah item' },
                    ].map((s, i) => (
                      <motion.div key={i} whileHover={{ y: -3, transition: { type: 'spring', stiffness: 300, damping: 20 } }}>
                        <div className="glass-stat rounded-xl p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">{s.label}</p>
                            <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${s.gradient} ${s.shadow} shadow flex items-center justify-center`}>
                              <s.icon className="w-3 h-3 text-white" />
                            </div>
                          </div>
                          <p className="text-sm sm:text-lg font-bold tracking-tight truncate tabular-nums">
                            <CountUp value={s.rawValue} format={s.format} />
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })()}

        {/* Section 4: Laporan Penjualan Table */}
        <motion.div {...fadeIn} transition={{ delay: 0.15 }}>
          <Card className="border-0 shadow-lg card-hover-glow overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 min-w-0">
                {/* Header row */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingCart className="w-5 h-5 text-[#E14227] shrink-0" />
                    <CardTitle className="text-base truncate">Laporan Penjualan</CardTitle>
                    <Badge variant="outline" className="text-xs shrink-0">{fmtNum(displayTotal)} data</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" className="h-8 gap-1.5 bg-gradient-to-r from-[#E14227] to-[#9DB1CC] hover:from-[#B8321E] hover:to-[#7E95B3] text-white shadow-md shadow-[#E14227]/20" onClick={() => setShowUploadModal(true)}>
                      <UploadCloud className="w-3.5 h-3.5" /> Upload
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[#E14227] border-[#E6BAA3] hover:bg-[#F0D5C5] dark:text-[#F07050] dark:border-[#B8321E] dark:hover:bg-[#B8321E]/30" onClick={handleExport}>
                      <Download className="w-3.5 h-3.5" /> Export CSV
                    </Button>
                    {isAdmin && (batchSelectedIds.size > 0 || selectedSaleIds.size > 0) && (
                      <>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[#E14227] border-[#E6BAA3] hover:bg-[#F0D5C5] dark:text-[#F07050] dark:border-[#B8321E] dark:hover:bg-[#B8321E]/30" onClick={() => setShowBulkEdit(true)}>
                          <Pencil className="w-3.5 h-3.5" /> Edit ({batchSelectedIds.size || selectedSaleIds.size})
                        </Button>
                        {batchSelectedIds.size > 0 && (
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/30" onClick={handleBulkUnclaim} disabled={bulkUnclaiming}>
                            {bulkUnclaiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Unclaim ({batchSelectedIds.size})
                          </Button>
                        )}
                        <Button variant="destructive" size="sm" className="h-8 gap-1.5" onClick={() => {
                          const ids = Array.from(batchSelectedIds.size > 0 ? batchSelectedIds : selectedSaleIds)
                          setDeleteConfirm({ type: 'batch-sale', ids, name: `${ids.length} data terpilih` })
                        }}>
                          <Trash2 className="w-3.5 h-3.5" /> Hapus ({batchSelectedIds.size || selectedSaleIds.size})
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Claim status toggle */}
                <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/60 w-fit">
                  {([
                    { val: 'unclaimed' as const, label: 'Belum Claim' },
                    { val: 'claimed' as const, label: 'Sudah Claim' },
                    { val: 'all' as const, label: 'Semua' },
                  ]).map(tab => (
                    <button
                      key={tab.val}
                      onClick={() => { setClaimShowClaimed(tab.val); setSelectedSaleIds(new Set()) }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        claimShowClaimed === tab.val
                          ? 'bg-white dark:bg-gray-900 shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Quick Filter Chips */}
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
                  {[
                    { val: 'today' as const, label: 'Hari Ini', icon: CalendarDays },
                    { val: 'week' as const, label: 'Minggu Ini', icon: CalendarRange },
                    { val: 'month' as const, label: 'Bulan Ini', icon: Calendar },
                    { val: 'all' as const, label: 'Semua Tanggal', icon: Clock },
                  ].map(chip => (
                    <button
                      key={chip.val}
                      onClick={() => {
                        if (chip.val === 'today') { setClaimDateFrom(todayStr); setClaimDateTo(todayStr) }
                        else if (chip.val === 'week') { const r = getWeekRange(); setClaimDateFrom(r.from); setClaimDateTo(r.to) }
                        else if (chip.val === 'month') { const r = getMonthRange(); setClaimDateFrom(r.from); setClaimDateTo(r.to) }
                        else { setClaimDateFrom(''); setClaimDateTo('') }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all border ${
                        activeQuickFilter === chip.val
                          ? 'bg-[#F0D5C5] text-[#B8321E] border-[#E6BAA3] dark:bg-[#B8321E]/40 dark:text-[#F07050] dark:border-[#B8321E] shadow-sm'
                          : 'bg-muted/40 text-muted-foreground border-border/50 hover:bg-muted/70 hover:text-foreground'
                      }`}
                    >
                      <chip.icon className="w-3 h-3" />
                      {chip.label}
                    </button>
                  ))}
                </div>

                {/* ─── MOBILE: Premium collapsible filter panel ─── */}
                <div className="sm:hidden">
                  {/* Toggle button */}
                  <button
                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-[#F0EAD6] to-[#F0EAD6]/80 dark:from-[#1A1A1B] dark:to-[#1A1A1B]/80 border border-border/60 transition-all active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#F0D5C5] dark:bg-[#B8321E]/50 flex items-center justify-center">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-[#E14227] dark:text-[#F07050]" />
                      </div>
                      <span className="text-xs font-semibold text-foreground">Filter & Pencarian</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeFilterCount > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#E14227] text-white text-[10px] font-bold flex items-center justify-center">
                          {activeFilterCount}
                        </span>
                      )}
                      <motion.div animate={{ rotate: showFilterPanel ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </motion.div>
                    </div>
                  </button>

                  {/* Expandable panel */}
                  <AnimatePresence>
                    {showFilterPanel && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3 space-y-3">
                          {/* Search */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Cari kode, brand, dept, crew..."
                              value={searchText}
                              onChange={e => handleSearchChange(e.target.value)}
                              onKeyDown={handleSearchEnter}
                              className="pl-9 h-10 w-full rounded-xl bg-white dark:bg-gray-900 border-border/60 text-sm"
                            />
                            {searchText && (
                              <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Program & Crew side by side */}
                          <div className="grid grid-cols-2 gap-2">
                            <Select value={claimFilterProgram || '__all__'} onValueChange={v => setClaimFilterProgram(v === '__all__' ? '' : v)}>
                              <SelectTrigger className="h-10 w-full text-xs rounded-xl bg-white dark:bg-gray-900 border-border/60">
                                <Sparkles className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                                <SelectValue placeholder="Program" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__all__">Semua</SelectItem>
                                {programs.map(p => (
                                  <SelectItem key={p} value={p}>{p}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={claimFilterCrew || '__all__'} onValueChange={v => setClaimFilterCrew(v === '__all__' ? '' : v)}>
                              <SelectTrigger className="h-10 w-full text-xs rounded-xl bg-white dark:bg-gray-900 border-border/60">
                                <Users className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                                <SelectValue placeholder="Crew" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__all__">Semua</SelectItem>
                                {crews.map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Date range — each date in its own card row */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 px-1">
                              <Calendar className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rentang Tanggal</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground px-1">Dari</span>
                                <Input
                                  type="date"
                                  value={claimDateFrom}
                                  onChange={e => setClaimDateFrom(e.target.value)}
                                  className="h-10 w-full text-xs rounded-xl bg-white dark:bg-gray-900 border-border/60"
                                />
                              </div>
                              <div className="space-y-1">
                                <span className="text-[10px] text-muted-foreground px-1">Sampai</span>
                                <Input
                                  type="date"
                                  value={claimDateTo}
                                  onChange={e => setClaimDateTo(e.target.value)}
                                  className="h-10 w-full text-xs rounded-xl bg-white dark:bg-gray-900 border-border/60"
                                />
                              </div>
                            </div>
                            {(claimDateFrom || claimDateTo) && (
                              <button
                                onClick={() => { setClaimDateFrom(''); setClaimDateTo('') }}
                                className="text-[10px] text-[#E14227] dark:text-[#F07050] font-medium px-1 flex items-center gap-1 active:opacity-70"
                              >
                                <X className="w-2.5 h-2.5" /> Reset tanggal
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* ─── DESKTOP (sm+): Horizontal inline filters ─── */}
                <div className="hidden sm:block">
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Cari kode, brand, dept, crew..." value={searchText} onChange={e => handleSearchChange(e.target.value)} onKeyDown={handleSearchEnter}
                      className="pl-9 h-9 w-full sm:w-72" />
                  </div>
                  {/* Filters row */}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Select value={claimFilterProgram || '__all__'} onValueChange={v => { setClaimFilterProgram(v === '__all__' ? '' : v) }}>
                      <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs">
                        <Sparkles className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                        <SelectValue placeholder="Program" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Semua Program</SelectItem>
                        {programs.map(p => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={claimFilterCrew || '__all__'} onValueChange={v => { setClaimFilterCrew(v === '__all__' ? '' : v) }}>
                      <SelectTrigger className="h-9 w-auto min-w-[160px] text-xs">
                        <Users className="w-3.5 h-3.5 mr-1 text-muted-foreground shrink-0" />
                        <SelectValue placeholder="Semua Crew" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Semua Crew</SelectItem>
                        {crews.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* Date filter inline */}
                    <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted/50 border">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide hidden md:inline">Tanggal</span>
                      <Input type="date" value={claimDateFrom} onChange={e => setClaimDateFrom(e.target.value)} className="h-7 w-[120px] text-xs border-0 shadow-none p-0" />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input type="date" value={claimDateTo} onChange={e => setClaimDateTo(e.target.value)} className="h-7 w-[120px] text-xs border-0 shadow-none p-0" />
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0" title="Reset tanggal" onClick={() => { setClaimDateFrom(''); setClaimDateTo('') }}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden">
            <LoadingOverlay loading={displayLoading || displayDebouncing} light={displayDebouncing && !displayLoading} label={displayDebouncing ? 'Menunggu pencarian...' : 'Memuat data penjualan...'}>
              {displayLoading && displaySales.length === 0 ? (
                <div className="space-y-3">
                  <div className="md:hidden space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="sale-card border border-border/40">
                        <div className="p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-[22px] h-[22px] rounded-[7px] skeleton-shimmer" />
                            <div className="flex-1">
                              <div className="h-4 skeleton-shimmer rounded-md w-3/4 mb-1.5" />
                              <div className="h-2.5 skeleton-shimmer rounded-md w-1/2" />
                            </div>
                            <div className="h-5 w-16 skeleton-shimmer rounded-full" />
                          </div>
                          <div className="h-6 skeleton-shimmer rounded-md w-2/5 mb-3" />
                          <div className="flex gap-1.5 mb-3">
                            <div className="h-5 w-16 skeleton-shimmer rounded-md" />
                            <div className="h-5 w-20 skeleton-shimmer rounded-md" />
                            <div className="h-5 w-14 skeleton-shimmer rounded-md" />
                          </div>
                          <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                            <div className="w-7 h-7 rounded-full skeleton-shimmer" />
                            <div className="h-3 skeleton-shimmer rounded-md w-24" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-gradient-to-r from-muted/80 to-muted/40">
                          <TableHead className="text-[11px] w-[40px]" />
                          <TableHead className="text-[11px] w-[100px]">Tanggal</TableHead>
                          <TableHead className="text-[11px]">Dept</TableHead>
                          <TableHead className="text-[11px]">Kode Extend</TableHead>
                          <TableHead className="text-[11px]">Brand</TableHead>
                          <TableHead className="text-[11px] text-right">Qty</TableHead>
                          <TableHead className="text-[11px] text-right">Settle</TableHead>
                          <TableHead className="text-[11px]">Crew</TableHead>
                          <TableHead className="text-[11px]">Program</TableHead>
                          <TableHead className="text-[11px] w-[80px]">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={10} />)}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : displaySales.length === 0 ? (
                claimShowClaimed === 'unclaimed' ? (
                  <div className="text-center py-12 relative overflow-hidden">
                    {/* Confetti-like decorative elements */}
                    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                      {[
                        { left: '8%', top: '12%', color: 'bg-[#E14227]', size: 'w-2.5 h-2.5', shape: 'rounded-full', delay: 0 },
                        { left: '22%', top: '25%', color: 'bg-[#E6BAA3]', size: 'w-2 h-3', shape: 'rounded-sm', delay: 0.3 },
                        { left: '75%', top: '8%', color: 'bg-purple-400', size: 'w-3 h-2', shape: 'rounded-full', delay: 0.6 },
                        { left: '88%', top: '30%', color: 'bg-[#9DB1CC]', size: 'w-2 h-2.5', shape: 'rounded-sm', delay: 0.9 },
                        { left: '15%', top: '70%', color: 'bg-rose-400', size: 'w-2.5 h-2.5', shape: 'rounded-full', delay: 1.2 },
                        { left: '82%', top: '65%', color: 'bg-orange-400', size: 'w-2 h-2', shape: 'rounded-sm', delay: 0.4 },
                        { left: '45%', top: '5%', color: 'bg-[#B5C7DB]', size: 'w-2 h-2', shape: 'rounded-full', delay: 0.7 },
                        { left: '60%', top: '80%', color: 'bg-pink-400', size: 'w-2.5 h-2', shape: 'rounded-sm', delay: 1.0 },
                      ].map((dot, i) => (
                        <motion.div
                          key={i}
                          className={`absolute ${dot.size} ${dot.color} ${dot.shape}`}
                          style={{ left: dot.left, top: dot.top }}
                          animate={{
                            y: [0, -14, 0],
                            rotate: [0, 180, 360],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 2.5 + i * 0.2,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: dot.delay,
                          }}
                        />
                      ))}
                    </div>
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#F0D5C5] to-[#E6BAA3] dark:from-[#B8321E]/40 dark:to-[#B8321E]/40 flex items-center justify-center relative"
                    >
                      <PartyPopper className="w-10 h-10 text-[#E14227] dark:text-[#F07050]" />
                      {/* Sparkle accents */}
                      <motion.span
                        className="absolute -top-1.5 -right-1.5 text-[#D4956B] text-sm"
                        animate={{ scale: [0, 1.2, 0], rotate: [0, 90, 180] }}
                        transition={{ duration: 1.8, repeat: Infinity, delay: 0.5 }}
                      >&#10022;</motion.span>
                      <motion.span
                        className="absolute -bottom-1 -left-1.5 text-[#B5C7DB] text-xs"
                        animate={{ scale: [0, 1.2, 0], rotate: [0, -90, -180] }}
                        transition={{ duration: 1.8, repeat: Infinity, delay: 1.2 }}
                      >&#10022;</motion.span>
                    </motion.div>
                    <h3 className="text-base font-bold text-foreground mb-1">Semua data sudah di-claim!</h3>
                    <p className="text-sm text-muted-foreground mb-3 max-w-xs mx-auto">Tidak ada data yang belum di-claim pada filter ini</p>
                    <motion.div
                      animate={{ scale: [0.95, 1, 0.95] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F0D5C5] dark:bg-[#B8321E]/30 border border-[#E6BAA3]/60 dark:border-[#B8321E]/40"
                    >
                      <Trophy className="w-4 h-4 text-[#E14227]" />
                      <span className="text-xs font-semibold text-[#B8321E] dark:text-[#F07050]">Kerja bagus, semua terselesaikan!</span>
                    </motion.div>
                  </div>
                ) : claimShowClaimed === 'claimed' ? (
                  <div className="text-center py-12">
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#F0D5C5] to-[#E6BAA3] dark:from-[#B8321E]/40 dark:to-[#B8321E]/40 flex items-center justify-center"
                    >
                      <Clock className="w-10 h-10 text-[#D4956B] dark:text-[#E6BAA3]" />
                    </motion.div>
                    <h3 className="text-base font-bold text-foreground mb-1">Belum Ada Data yang Di-claim</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">Data penjualan yang sudah di-claim akan muncul di sini</p>
                  </div>
                ) : (
                <div className="text-center py-12 relative overflow-hidden">
                  {/* Floating decorative icons */}
                  <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
                    <motion.div
                      className="absolute left-[12%] top-[10%] w-9 h-9 rounded-xl bg-[#F0D5C5] dark:bg-[#B8321E]/50 flex items-center justify-center"
                      animate={{ y: [0, -10, 0], rotate: [0, 8, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0 }}
                    >
                      <FileSpreadsheet className="w-4 h-4 text-[#E14227] dark:text-[#F07050]" />
                    </motion.div>
                    <motion.div
                      className="absolute right-[15%] top-[15%] w-8 h-8 rounded-lg bg-[#E6BAA3] dark:bg-[#B8321E]/50 flex items-center justify-center"
                      animate={{ y: [0, -8, 0], rotate: [0, -6, 0] }}
                      transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
                    >
                      <Upload className="w-3.5 h-3.5 text-[#B8321E] dark:text-[#E6BAA3]" />
                    </motion.div>
                    <motion.div
                      className="absolute left-[8%] bottom-[18%] w-8 h-8 rounded-lg bg-[#B5C7DB] dark:bg-[#7E95B3]/50 flex items-center justify-center"
                      animate={{ y: [0, -12, 0], rotate: [0, 5, 0] }}
                      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
                    >
                      <ShoppingCart className="w-3.5 h-3.5 text-[#9DB1CC] dark:text-[#B5C7DB]" />
                    </motion.div>
                    <motion.div
                      className="absolute right-[10%] bottom-[22%] w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center"
                      animate={{ y: [0, -9, 0], rotate: [0, -4, 0] }}
                      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
                    >
                      <BarChart3 className="w-3 h-3 text-purple-500 dark:text-purple-400" />
                    </motion.div>
                  </div>
                  {/* Main illustration */}
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#F0D5C5] to-[#E6BAA3] dark:from-[#B8321E]/40 dark:to-[#B8321E]/40 flex items-center justify-center relative"
                  >
                    <FileSpreadsheet className="w-10 h-10 text-[#E14227] dark:text-[#B8321E]" />
                    <motion.span
                      className="absolute -top-1.5 -right-1.5 text-[#D4956B] text-xs"
                      animate={{ scale: [0, 1.2, 0], rotate: [0, 90, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                    >&#10022;</motion.span>
                    <motion.span
                      className="absolute -bottom-1 -left-1 text-[#F07050] text-[10px]"
                      animate={{ scale: [0, 1.1, 0], rotate: [0, -60, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                    >&#10022;</motion.span>
                  </motion.div>
                  <h3 className="text-base font-bold text-foreground mb-1">Mulai dengan upload data penjualan</h3>
                  <p className="text-sm text-muted-foreground mb-5 max-w-xs mx-auto">Upload file Excel berisi data penjualan, lalu claim ke crew yang bertugas untuk melacak performa tim</p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <Button size="sm" className="bg-gradient-to-r from-[#E14227] to-[#9DB1CC] hover:from-[#B8321E] hover:to-[#7E95B3] text-white shadow-md shadow-[#E14227]/20" onClick={() => setShowUploadModal(true)}>
                      <Upload className="w-3.5 h-3.5 mr-1.5" />Upload File Excel
                    </Button>
                    <Button size="sm" variant="outline" className="border-[#E6BAA3] text-[#E14227] hover:bg-[#F0D5C5] dark:border-[#B8321E] dark:text-[#F07050] dark:hover:bg-[#B8321E]/30" onClick={() => setActiveTab('dashboard')}>
                      <BarChart3 className="w-3.5 h-3.5 mr-1.5" />Lihat Panduan
                    </Button>
                  </div>
                </div>
                )
              ) : (
                <>
                  {/* Mobile Card View — Premium */}
                  <div className="md:hidden space-y-3">
                    {sortedDisplaySales.map((sale, idx) => {
                      const isSelected = selectedSaleIds.has(sale.id)
                      const isClaimed = !!sale.crew
                      return (
                        <motion.div
                          key={sale.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(idx * 0.03, 0.3), duration: 0.3 }}
                          className={`sale-card shadow-sm border border-border/40 ${isClaimed ? 'sale-claimed' : ''} ${isSelected ? 'sale-selected sale-card-animate-select' : ''}`}
                        >
                          {/* Department left border indicator */}
                          {sale.dept && (
                            <div className={`absolute top-4 bottom-4 left-0 w-[3px] rounded-r-full ${getDeptColor(sale.dept)}`} />
                          )}
                          <div className="p-4">
                            {/* ── Top: Checkbox + Kode + Status ── */}
                            <div className="flex items-center gap-3 mb-3">
                              {!sale.crew && (
                                <div
                                  onClick={() => {
                                    const next = new Set(selectedSaleIds)
                                    if (next.has(sale.id)) next.delete(sale.id)
                                    else next.add(sale.id)
                                    setSelectedSaleIds(next)
                                  }}
                                  className={`sale-checkbox ${isSelected ? 'checked' : ''}`}
                                >
                                  {isSelected && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-mono font-bold tracking-tight truncate ${isClaimed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{sale.kodeExtend}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <Calendar className="w-2.5 h-2.5" />
                                  {sale.tanggal}
                                  <span className="text-muted-foreground/40 mx-0.5">·</span>
                                  <Package className="w-2.5 h-2.5" />
                                  {sale.qty} qty
                                  {sale.brand && (
                                    <>
                                      <span className="text-muted-foreground/40 mx-0.5">·</span>
                                      <span className="text-foreground/70 font-medium">{sale.brand.length > 15 ? sale.brand.slice(0, 15) + '…' : sale.brand}</span>
                                    </>
                                  )}
                                </p>
                              </div>
                              {/* Status pill */}
                              {isClaimed ? (
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F0D5C5] dark:bg-[#B8321E]/40 shrink-0">
                                  <CheckCircle2 className="w-3 h-3 text-[#B2AC88]" />
                                  <span className="text-[10px] font-semibold text-[#B2AC88] dark:text-[#B2AC88]">Claimed</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F0D5C5] dark:bg-[#B8321E]/40 shrink-0">
                                  <Clock className="w-3 h-3 text-[#E6BAA3]" />
                                  <span className="text-[10px] font-semibold text-[#E6BAA3] dark:text-[#D4956B]">Open</span>
                                </div>
                              )}
                            </div>

                            {/* ── Hero: Settle Amount ── */}
                            <div className="flex items-end justify-between mb-3">
                              <p className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-[#E14227] via-[#D4956B] to-[#E6BAA3] dark:from-[#F07050] dark:via-[#B5C7DB] dark:to-[#B5C7DB] bg-clip-text text-transparent">
                                {fmtRp(sale.settle)}
                              </p>
                              {sale.claimedAt && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1 mb-0.5">
                                  {sale.claimedAt && (Date.now() - new Date(sale.claimedAt).getTime() < 120000) && (
                                    <div className="w-1.5 h-1.5 bg-[#B2AC88] rounded-full animate-pulse" />
                                  )}
                                  {timeAgo(sale.claimedAt)}
                                </span>
                              )}
                            </div>

                            {/* ── Tag Chips Row ── */}
                            {(sale.dept || sale.brand || sale.program || sale.pembayaran) && (
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {sale.dept && (
                                  <span className="tag-chip tag-chip-dept">
                                    <div className={`w-1.5 h-1.5 rounded-full ${getDeptColor(sale.dept)}`} />
                                    {sale.dept}
                                  </span>
                                )}
                                {sale.brand && (
                                  <span className="tag-chip tag-chip-brand">
                                    {sale.brand.length > 15 ? sale.brand.slice(0, 15) + '…' : sale.brand}
                                  </span>
                                )}
                                {sale.program && (
                                  <span className="tag-chip tag-chip-program">
                                    {sale.program.length > 15 ? sale.program.slice(0, 15) + '…' : sale.program}
                                  </span>
                                )}
                                {sale.pembayaran && (
                                  <span className="tag-chip tag-chip-payment">
                                    {sale.pembayaran.length > 12 ? sale.pembayaran.slice(0, 12) + '…' : sale.pembayaran}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* ── Crew Section ── */}
                            <div className={`flex items-center justify-between ${isClaimed && sale.crew ? 'pt-3 border-t border-border/40' : ''}`}>
                              {sale.crew ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-7 h-7 ring-2 ring-[#E6BAA3] dark:ring-[#B8321E]">
                                    <AvatarImage src={sale.crew?.photo || ''} />
                                    <AvatarFallback className="text-[9px] bg-gradient-to-br from-[#F07050] to-[#E14227] text-white font-bold">
                                      {sale.crew?.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold text-foreground truncate">{sale.crew.name}</p>
                                    <p className="text-[10px] text-muted-foreground">{sale.crew.employeeId}</p>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                                  <Search className="w-3.5 h-3.5" />
                                  <span className="text-[11px] italic">Belum di-claim</span>
                                </div>
                              )}

                              {/* Admin actions */}
                              {isAdmin && (
                                <div className="flex items-center gap-0.5">
                                  <button onClick={() => openEditSale(sale)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => setDeleteConfirm({ type: 'sale', id: sale.id, name: `${sale.kodeExtend}${sale.crew ? ` — ${sale.crew.name}` : ' (unclaimed)'}` })} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                  {sale.crew && (
                                    <button onClick={() => handleUnclaimSale(sale.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-[#D4956B] hover:bg-[#F0D5C5] dark:hover:bg-[#B8321E]/30 transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>

                  {/* Desktop Table View — Premium */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border shadow-sm">
                    <Table className="table-stripe">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-gradient-to-r from-muted/80 to-muted/40">
                          {/* Select column (for unclaimed rows) */}
                          <TableHead className="w-[40px]">
                            <button
                              className="w-4 h-4 rounded border border-muted-foreground/30 flex items-center justify-center transition-all hover:border-[#E14227]"
                              onClick={() => {
                                const unclaimed = sortedDisplaySales.filter(s => !s.crew)
                                if (selectedSaleIds.size === unclaimed.length && unclaimed.length > 0) {
                                  setSelectedSaleIds(new Set())
                                } else {
                                  setSelectedSaleIds(new Set(unclaimed.map(s => s.id)))
                                }
                              }}
                              aria-label="Select all unclaimed rows"
                            >
                              {(() => {
                                const unclaimed = sortedDisplaySales.filter(s => !s.crew)
                                return selectedSaleIds.size === unclaimed.length && unclaimed.length > 0 && (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-[#E14227]" />
                                )
                              })()}
                            </button>
                          </TableHead>
                          <TableHead className="w-[100px] min-w-[100px] cursor-pointer select-none text-[11px] hover:text-foreground" onClick={() => { if (claimSortField === 'tanggal') setClaimSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setClaimSortField('tanggal'); setClaimSortDir('desc') } }}>
                            <span className="inline-flex items-center gap-1">Tanggal{claimSortField === 'tanggal' && (claimSortDir === 'asc' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}</span>
                          </TableHead>
                          <TableHead className="min-w-[80px] cursor-pointer select-none text-[11px] hover:text-foreground" onClick={() => { if (claimSortField === 'dept') setClaimSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setClaimSortField('dept'); setClaimSortDir('desc') } }}>
                            <span className="inline-flex items-center gap-1">Dept{claimSortField === 'dept' && (claimSortDir === 'asc' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}</span>
                          </TableHead>
                          <TableHead className="min-w-[120px] cursor-pointer select-none text-[11px] hover:text-foreground" onClick={() => { if (claimSortField === 'kodeExtend') setClaimSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setClaimSortField('kodeExtend'); setClaimSortDir('desc') } }}>
                            <span className="inline-flex items-center gap-1">Kode Extend{claimSortField === 'kodeExtend' && (claimSortDir === 'asc' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}</span>
                          </TableHead>
                          <TableHead className="min-w-[100px] cursor-pointer select-none text-[11px] hover:text-foreground" onClick={() => { if (claimSortField === 'brand') setClaimSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setClaimSortField('brand'); setClaimSortDir('desc') } }}>
                            <span className="inline-flex items-center gap-1">Brand{claimSortField === 'brand' && (claimSortDir === 'asc' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}</span>
                          </TableHead>
                          <TableHead className="text-right min-w-[60px] cursor-pointer select-none text-[11px] hover:text-foreground" onClick={() => { if (claimSortField === 'qty') setClaimSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setClaimSortField('qty'); setClaimSortDir('desc') } }}>
                            <span className="inline-flex items-center justify-end gap-1">Qty{claimSortField === 'qty' && (claimSortDir === 'asc' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}</span>
                          </TableHead>
                          <TableHead className="text-right min-w-[110px] cursor-pointer select-none text-[11px] hover:text-foreground" onClick={() => { if (claimSortField === 'settle') setClaimSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setClaimSortField('settle'); setClaimSortDir('desc') } }}>
                            <span className="inline-flex items-center justify-end gap-1">Settle{claimSortField === 'settle' && (claimSortDir === 'asc' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />)}</span>
                          </TableHead>
                          <TableHead className="min-w-[160px] text-[11px]">Crew</TableHead>
                          <TableHead className="min-w-[80px] text-[11px]">Program</TableHead>
                          {isAdmin && <TableHead className="w-[80px] text-[11px]">Aksi</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedDisplaySales.map((sale) => (
                          <TableRow
                            key={sale.id}
                            className={`sale-row group ${selectedSaleIds.has(sale.id) ? 'row-selected' : ''} ${batchSelectedIds.has(sale.id) ? 'bg-red-50/50 dark:bg-red-950/10' : ''} ${sale.crew ? 'opacity-75' : ''}`}
                          >
                            {/* Checkbox — only for unclaimed */}
                            <TableCell>
                              {!sale.crew ? (
                                <button
                                  className="w-4 h-4 rounded border-2 flex items-center justify-center transition-colors shrink-0 mx-auto"
                                  style={{ backgroundColor: selectedSaleIds.has(sale.id) ? '#E14227' : 'transparent', borderColor: selectedSaleIds.has(sale.id) ? '#E14227' : 'rgb(156 163 175)' }}
                                  onClick={() => {
                                    const next = new Set(selectedSaleIds)
                                    if (next.has(sale.id)) next.delete(sale.id)
                                    else next.add(sale.id)
                                    setSelectedSaleIds(next)
                                  }}
                                >
                                  {selectedSaleIds.has(sale.id) && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                </button>
                              ) : isAdmin ? (
                                <button
                                  className="w-4 h-4 rounded border border-muted-foreground/30 flex items-center justify-center transition-all hover:border-[#E14227] shrink-0 mx-auto"
                                  onClick={() => {
                                    const next = new Set(batchSelectedIds)
                                    if (next.has(sale.id)) next.delete(sale.id)
                                    else next.add(sale.id)
                                    setBatchSelectedIds(next)
                                  }}
                                  aria-label={`Select ${sale.kodeExtend}`}
                                >
                                  {batchSelectedIds.has(sale.id) && <CheckCircle2 className="w-3 h-3 text-[#E14227]" />}
                                </button>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{sale.tanggal}</TableCell>
                            {/* Dept column */}
                            <TableCell className="text-xs">
                              {sale.dept ? (
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${getDeptColor(sale.dept)} shrink-0`} />
                                  <span className="text-foreground/80">{sale.dept}</span>
                                </div>
                              ) : <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            {/* Kode Extend column */}
                            <TableCell className="text-xs font-mono whitespace-nowrap">
                              <div className="flex flex-col gap-0.5">
                                <span className={`font-semibold ${sale.crew ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{sale.kodeExtend}</span>
                              </div>
                            </TableCell>
                            {/* Brand column (NEW) */}
                            <TableCell className="text-xs">
                              {sale.brand ? (
                                <span className="text-foreground/70">{sale.brand.length > 18 ? sale.brand.slice(0, 18) + '…' : sale.brand}</span>
                              ) : <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{sale.qty}</TableCell>
                            <TableCell className="text-xs text-right font-bold text-[#E14227] dark:text-[#F07050] whitespace-nowrap tabular-nums">{fmtRp(sale.settle)}</TableCell>
                            {/* Crew column */}
                            <TableCell>
                              {sale.crew ? (
                                <div className="flex items-center gap-2">
                                  <div className="relative">
                                    <Avatar className="w-6 h-6 ring-1 ring-[#E6BAA3] dark:ring-[#B8321E]">
                                      <AvatarImage src={sale.crew?.photo || ''} />
                                      <AvatarFallback className="text-[8px] bg-gradient-to-br from-[#F07050] to-[#E14227] text-white font-bold">{(sale.crew?.name || '?')[0]}</AvatarFallback>
                                    </Avatar>
                                    {sale.claimedAt && (Date.now() - new Date(sale.claimedAt).getTime() < 120000) && (
                                      <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[#B2AC88] rounded-full border-2 border-background animate-pulse" />
                                    )}
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-[11px] truncate max-w-[120px] font-semibold text-foreground">{sale.crew?.name || 'Unknown'}</span>
                                    {sale.claimedAt && (
                                      <span className="text-[9px] text-muted-foreground">{timeAgo(sale.claimedAt)}</span>
                                    )}
                                  </div>
                                  {isAdmin && (
                                    <button
                                      onClick={() => handleUnclaimSale(sale.id)}
                                      className="ml-auto shrink-0 p-1 rounded text-muted-foreground hover:text-[#D4956B] hover:bg-[#F0D5C5] dark:hover:bg-[#B8321E]/30 transition-colors"
                                      title="Unclaim"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 text-muted-foreground/60">
                                  <Search className="w-3.5 h-3.5 shrink-0" />
                                  <span className="text-[11px] italic">Belum di-claim</span>
                                </div>
                              )}
                            </TableCell>
                            {/* Program column */}
                            <TableCell>
                              {sale.program ? (
                                <span className="tag-chip tag-chip-program">{sale.program}</span>
                              ) : <span className="text-xs text-muted-foreground">-</span>}
                            </TableCell>
                            {isAdmin && (
                              <TableCell>
                                <div className="flex items-center gap-0.5">
                                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30" onClick={() => openEditSale(sale)}>
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeleteConfirm({ type: 'sale', id: sale.id, name: `${sale.kodeExtend}${sale.crew ? ` — ${sale.crew.name}` : ' (unclaimed)'}` })}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Section 5: Pagination */}
                  <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-3">
                    <p className="text-xs text-muted-foreground">
                      {displayTotal > 0 && `Menampilkan ${displaySales.length} dari ${fmtNum(displayTotal)}`}
                    </p>
                    <div className="flex items-center gap-2">
                      <button className="pagination-btn border border-border" disabled={displayPage <= 1} onClick={() => isLocalSearching ? fetchLocalSearch(searchText.trim(), displayPage - 1) : fetchClaims(displayPage - 1)}>
                        <ChevronLeft className="w-4 h-4 mr-1" /><span className="hidden sm:inline">Prev</span>
                      </button>
                      <div className="flex items-center gap-0.5">
                        {getPageNumbers(displayPage, displayTotalPages).map((p, idx) => (
                          p === '...' ? (
                            <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-xs text-muted-foreground">···</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => isLocalSearching ? fetchLocalSearch(searchText.trim(), p) : fetchClaims(p)}
                              className={`pagination-btn ${p === displayPage ? 'active' : 'text-muted-foreground border border-transparent'}`}
                              style={p === displayPage ? { backgroundColor: '#E14227', color: 'white', borderColor: '#E14227' } : undefined}
                            >
                              {p}
                            </button>
                          )
                        ))}
                      </div>
                      <button className="pagination-btn border border-border" disabled={displayPage >= displayTotalPages} onClick={() => isLocalSearching ? fetchLocalSearch(searchText.trim(), displayPage + 1) : fetchClaims(displayPage + 1)}>
                        <span className="hidden sm:inline">Next</span><ChevronRight className="w-4 h-4 ml-1" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </LoadingOverlay>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Mobile Selected Items Bar removed — merged into Floating Claim Bar below ── */}
      </motion.div>

      {/* ── Quick Actions Floating Bar ── */}
      <AnimatePresence>
        {selectedSaleIds.size > 0 && selectedClaimCrewId && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-16 sm:bottom-5 left-0 right-0 z-40 px-3 sm:px-6"
          >
            <div className="max-w-lg mx-auto glass-card animate-bar-glow rounded-2xl p-3 sm:p-4">
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Selected count + total */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center">
                      <span className="text-[9px] font-bold text-white">{selectedSaleIds.size}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">item dipilih</p>
                  </div>
                  <p className="text-base sm:text-lg font-extrabold tracking-tight bg-gradient-to-r from-[#E14227] to-[#D4956B] dark:from-[#F07050] dark:to-[#B5C7DB] bg-clip-text text-transparent tabular-nums">
                    {fmtRp(selectedItemsTotal)}
                  </p>
                </div>

                {/* Selected crew info */}
                {selectedClaimCrew && (
                  <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-border/50">
                    <Avatar className="w-8 h-8 ring-2 ring-[#E6BAA3] dark:ring-[#B8321E] shadow-sm">
                      <AvatarImage src={selectedClaimCrew.photo || ''} />
                      <AvatarFallback className="text-[10px] bg-gradient-to-br from-[#F07050] to-[#E14227] text-white font-bold">
                        {selectedClaimCrew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-semibold text-foreground truncate max-w-[80px] sm:max-w-[120px] hidden sm:block">
                      {selectedClaimCrew.name}
                    </span>
                  </div>
                )}

                {/* Claim Sekarang button */}
                <Button
                  onClick={() => handleClaimSales()}
                  disabled={claiming}
                  className="shrink-0 bg-gradient-to-r from-[#E14227] to-[#9DB1CC] hover:from-[#B8321E] hover:to-[#7E95B3] text-white shadow-lg shadow-[#E14227]/25 px-4 sm:px-5 h-10 sm:h-11 text-xs sm:text-sm font-bold gap-1.5 transition-all active:scale-95"
                >
                  {claiming ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>Claim Sekarang</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Admin Batch Action Floating Bar ── */}
      <AnimatePresence>
        {isAdmin && (batchSelectedIds.size > 0 || selectedSaleIds.size > 0) && !(selectedSaleIds.size > 0 && selectedClaimCrewId) && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed bottom-16 sm:bottom-5 left-0 right-0 z-40 px-3 sm:px-6"
          >
            <div className="max-w-md mx-auto glass-card rounded-2xl p-3 sm:p-4 shadow-xl border border-[#E6BAA3]/30 dark:border-[#B8321E]/20">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center">
                      <span className="text-[9px] font-bold text-white">{batchSelectedIds.size || selectedSaleIds.size}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">dipilih (admin)</p>
                  </div>
                </div>
                <Button size="sm" className="h-9 gap-1.5 bg-gradient-to-r from-[#E14227] to-[#9DB1CC] hover:from-[#B8321E] hover:to-[#7E95B3] text-white shadow-md text-xs font-bold" onClick={() => setShowBulkEdit(true)}>
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
                {batchSelectedIds.size > 0 && (
                  <Button size="sm" variant="outline" className="h-9 gap-1.5 text-amber-600 border-amber-300 text-xs" onClick={handleBulkUnclaim} disabled={bulkUnclaiming}>
                    {bulkUnclaiming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RotateCcw className="w-3.5 h-3.5" /> Unclaim</>}
                  </Button>
                )}
                <Button size="sm" variant="destructive" className="h-9 gap-1.5 text-xs" onClick={() => {
                  const ids = Array.from(batchSelectedIds.size > 0 ? batchSelectedIds : selectedSaleIds)
                  setDeleteConfirm({ type: 'batch-sale', ids, name: `${ids.length} data terpilih` })
                }}>
                  <Trash2 className="w-3.5 h-3.5" /> Hapus
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bulk Edit Dialog ── */}
      <BulkEditDialog
        open={showBulkEdit}
        onClose={() => setShowBulkEdit(false)}
        saleIds={Array.from(batchSelectedIds.size > 0 ? batchSelectedIds : selectedSaleIds)}
        onSuccess={() => {
          setBatchSelectedIds(new Set())
          setSelectedSaleIds(new Set())
          fetchClaims(claimPage)
        }}
        crews={crews}
        programs={programs}
      />
    </TabsContent>
  )
})

export default ClaimsTab
