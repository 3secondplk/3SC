'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import {
  LayoutDashboard, Upload, Settings, Layers, Sun, Moon, Shield, LogOut,
  ChevronUp, Users, Crown, Target, Calendar, UserCheck, CheckCircle2,
  DollarSign, ShoppingCart, Search, X, Sparkles, Heart,
  Monitor, Briefcase, Beaker, Code2, Smartphone, Clock, Sunset, FileUp, UserPlus, Keyboard, Download, ShoppingBag,
} from 'lucide-react'
import { fmtRp, fmtNum, getWIBDate, getWIBToday, monthNames, dayNames, currentYear, getWeekRange, getMonthRange, safeFetch } from '@/lib/cms-utils'
import type { CrewStat, GroupAchievement, DashboardData, Crew, Group, ClaimSale, GroupDetailData, DeleteConfirmState } from '@/lib/cms-types'

import DashboardTab from '@/components/dashboard/DashboardTab'
import ClaimsTab from '@/components/claims/ClaimsTab'
import TikTokSalesTab from '@/components/tiktok/TikTokSalesTab'
import ManagementTab from '@/components/management/ManagementTab'
import ExportTab from '@/components/export/ExportTab'
import DeleteConfirmDialog from '@/components/modals/DeleteConfirmDialog'
import EditSaleDialog from '@/components/modals/EditSaleDialog'
import CrewDetailPanel from '@/components/modals/CrewDetailPanel'
import GroupDetailModal from '@/components/modals/GroupDetailModal'
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp'
import NotificationCenter from '@/components/NotificationCenter'
import GamifiedLoader from '@/components/ui/GamifiedLoader'

// ─── Main App ────────────────────────────────────────────
export default function Home() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  // Theme cycling: light → dark → system → light
  const cycleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    setTheme(next)
    const label = next === 'light' ? '☀️ Light Mode' : next === 'dark' ? '🌙 Dark Mode' : '🖥️ System (Auto)'
    toast.success(label, { description: next === 'system' ? 'Theme follows your device setting' : `Switched to ${next} mode`, duration: 2000 })
  }, [theme, setTheme])
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState('dashboard')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminName, setAdminName] = useState('')

  // Prevent hydration mismatch for theme toggle
  useEffect(() => { setMounted(true) }, [])
  // Crew detail panel state
  const [selectedCrewDetail, setSelectedCrewDetail] = useState<CrewStat | null>(null)
  // Crew photo preview modal state
  const [crewPhotoPreview, setCrewPhotoPreview] = useState<{ name: string; photo: string } | null>(null)

  // Group/Zoning detail modal state
  const [selectedGroupDetail, setSelectedGroupDetail] = useState<GroupAchievement | null>(null)
  const [groupDetailData, setGroupDetailData] = useState<GroupDetailData | null>(null)
  const [groupDetailPeriod, setGroupDetailPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [groupDetailLoading, setGroupDetailLoading] = useState(false)

  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [editSaleDialog, setEditSaleDialog] = useState<ClaimSale | null>(null)
  const [editSaleForm, setEditSaleForm] = useState({ tanggal: '', kodeExtend: '', qty: 0, settle: 0, dept: '', brand: '', modul: '', pembayaran: '', program: '', crewId: '' })
  const [editSaleSaving, setEditSaleSaving] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  // Dashboard state
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [dashPeriod, setDashPeriod] = useState<'today' | 'week' | 'month'>('today')
  const [dashLoading, setDashLoading] = useState(true)
  const [dashMonth, setDashMonth] = useState(new Date().getMonth())
  const [dashYear, setDashYear] = useState(new Date().getFullYear())

  // Claims state
  const [crews, setCrews] = useState<Crew[]>([])
  const [claimSales, setClaimSales] = useState<ClaimSale[]>([])
  const [claimTotal, setClaimTotal] = useState(0)
  const [claimTotalPages, setClaimTotalPages] = useState(1)
  const [claimPage, setClaimPage] = useState(1)
  const [claimSearch, setClaimSearch] = useState('')
  const [debouncedClaimSearch, setDebouncedClaimSearch] = useState('')
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to track latest search value for barcode scanner (avoids stale closure in forceSearchNow)
  const claimSearchRef = useRef('')
  const todayStr = getWIBToday()

  // ─── Custom debounce for claim search (fixes barcode scanner + prevents table glitch) ───
  // Replaces useDeferredValue with a true 500ms debounce.
  // On Enter key (from barcode scanner or manual), immediately search without waiting.
  const updateClaimSearch = useCallback((value: string, immediate = false) => {
    setClaimSearch(value)
    claimSearchRef.current = value // Always keep ref in sync
    // Trim trailing whitespace/newlines from barcode scanners
    const trimmed = value.replace(/[\r\n]+$/g, '').trim()
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (immediate || trimmed === '') {
      setDebouncedClaimSearch(trimmed)
    } else {
      searchDebounceRef.current = setTimeout(() => {
        setDebouncedClaimSearch(trimmed)
      }, 500)
    }
  }, [])

  // Force immediate search (called on Enter keypress in search input)
  // Uses ref instead of state to avoid stale closure when barcode scanner types fast
  const forceSearchNow = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    const trimmed = claimSearchRef.current.replace(/[\r\n]+$/g, '').trim()
    setDebouncedClaimSearch(trimmed)
  }, [])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current) }
  }, [])

  // BUGFIX: Restore filter state from localStorage (persists across reload)
  const [claimDateFrom, setClaimDateFrom] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('cms-claim-dateFrom') || '' } catch { /* ignore */ }
    }
    return ''
  })
  const [claimDateTo, setClaimDateTo] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('cms-claim-dateTo') || '' } catch { /* ignore */ }
    }
    return ''
  })
  const [claimFilterProgram, setClaimFilterProgram] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('cms-claim-program') || '' } catch { /* ignore */ }
    }
    return ''
  })
  const [claimFilterCrew, setClaimFilterCrew] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('cms-claim-crew') || '' } catch { /* ignore */ }
    }
    return ''
  })
  const [claimShowClaimed, setClaimShowClaimed] = useState<'unclaimed' | 'claimed' | 'all'>(() => {
    if (typeof window !== 'undefined') {
      try { return (localStorage.getItem('cms-claim-showClaimed') as 'unclaimed' | 'claimed' | 'all') || 'unclaimed' } catch { /* ignore */ }
    }
    return 'unclaimed'
  })

  // Sync filter state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cms-claim-dateFrom', claimDateFrom)
      localStorage.setItem('cms-claim-dateTo', claimDateTo)
      localStorage.setItem('cms-claim-program', claimFilterProgram)
      localStorage.setItem('cms-claim-crew', claimFilterCrew)
      localStorage.setItem('cms-claim-showClaimed', claimShowClaimed)
    } catch { /* ignore */ }
  }, [claimDateFrom, claimDateTo, claimFilterProgram, claimFilterCrew, claimShowClaimed])
  const [claimsLoading, setClaimsLoading] = useState(false)
  const [claimSortField, setClaimSortField] = useState<string>('createdAt')
  const [claimSortDir, setClaimSortDir] = useState<'asc' | 'desc'>('desc')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<{ totalRows: number; totalQty: number; totalSettle: number; uniqueProducts: number; duplicateRows?: number } | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [programs, setPrograms] = useState<string[]>([])
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set())
  const [claimCrewSearch, setClaimCrewSearch] = useState('')
  const [selectedClaimCrewId, setSelectedClaimCrewId] = useState('')
  const [claimSummary, setClaimSummary] = useState<{ totalQty: number; totalSettle: number; totalStruk: number; basketSize: number; pricePoint: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Management state
  const [groups, setGroups] = useState<Group[]>([])
  const [mgmtCrews, setMgmtCrews] = useState<Crew[]>([])
  const [showAddCrew, setShowAddCrew] = useState(false)
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [editCrew, setEditCrew] = useState<Crew | null>(null)
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [mgmtSearch, setMgmtSearch] = useState('')
  const [mgmtLoading, setMgmtLoading] = useState(false)

  // Batch delete state for Laporan
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  // Keyboard shortcuts help panel
  const [showShortcuts, setShowShortcuts] = useState(false)

  // ─── Notification Polling ──────────────────────────────
  const [notificationCount, setNotificationCount] = useState(0)
  const prevUnclaimedRef = useRef(0)
  const [bellSwingTrigger, setBellSwingTrigger] = useState(false)

  // Poll unclaimed count every 30s when NOT on claims tab
  useEffect(() => {
    if (activeTab === 'claims') return // claims tab refreshes on its own

    // Initial sync from dashboard state if available
    if (dashboard?.unclaimedCount !== undefined) {
      setNotificationCount(dashboard.unclaimedCount)
      prevUnclaimedRef.current = dashboard.unclaimedCount
    }

    const interval = setInterval(async () => {
      try {
        const r = await safeFetch('/api/dashboard?period=today')
        const d = await r.json()
        if (d.error) return
        const count = d.unclaimedCount || 0
        setNotificationCount(count)

        // Detect increase — show toast once per increase
        if (count > prevUnclaimedRef.current && prevUnclaimedRef.current >= 0) {
          const diff = count - prevUnclaimedRef.current
          toast.info(`🆕 ${diff} data penjualan baru belum di-claim`, { duration: 4000 })
          setBellSwingTrigger(prev => !prev) // toggle to re-trigger animation
        }
        prevUnclaimedRef.current = count
      } catch {
        /* silent — polling should never disrupt UX */
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [activeTab, dashboard?.unclaimedCount])

  // Keep notificationCount in sync with dashboard data
  useEffect(() => {
    if (dashboard?.unclaimedCount !== undefined) {
      setNotificationCount(dashboard.unclaimedCount)
    }
  }, [dashboard?.unclaimedCount])

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth').then(r => r.json()).then(d => {
      if (d.authenticated) setIsAdmin(true)
    }).catch(() => {})
  }, [])

  // Fetch dashboard data
  const isCurrentMonth = dashMonth === new Date().getMonth() && dashYear === new Date().getFullYear()

  const fetchDashboard = useCallback(async () => {
    setDashLoading(true)
    try {
      const params = new URLSearchParams({ period: dashPeriod })
      if (!isCurrentMonth) {
        params.set('month', String(dashMonth + 1))
        params.set('year', String(dashYear))
      }
      const r = await safeFetch(`/api/dashboard?${params}`)
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      setDashboard(d)
    } catch { toast.error('Gagal memuat dashboard') }
    finally { setDashLoading(false) }
  }, [dashPeriod, dashMonth, dashYear, isCurrentMonth])

  // Fetch crews for claim form — only when claims tab is active
  // NOTE: uses useRef (not useState) for loaded flag to avoid re-render
  // cancelling the setTimeout via cleanup. useState triggers re-render →
  // cleanup runs → clearTimeout → fetch never fires.
  const crewsLoadedRef = useRef(false)
  useEffect(() => {
    if (activeTab !== 'claims' || crewsLoadedRef.current) return
    crewsLoadedRef.current = true
    const t = setTimeout(async () => {
      try {
        const r = await safeFetch('/api/crews')
        const d = await r.json()
        if (Array.isArray(d)) setCrews(d)
      } catch { /* silent */ }
    }, 100)
    return () => clearTimeout(t)
  }, [activeTab])

  // Fetch claim sales history — stable callback, params read from refs
  const claimFilterRefs = useRef({
    search: '', dateFrom: '', dateTo: '', program: '', crew: '', showClaimed: 'unclaimed' as string,
  })
  // Keep refs in sync with state (no re-creation of fetchClaims)
  claimFilterRefs.current.search = debouncedClaimSearch
  claimFilterRefs.current.dateFrom = claimDateFrom
  claimFilterRefs.current.dateTo = claimDateTo
  claimFilterRefs.current.program = claimFilterProgram
  claimFilterRefs.current.crew = claimFilterCrew
  claimFilterRefs.current.showClaimed = claimShowClaimed

  const fetchClaims = useCallback(async (page: number) => {
    setClaimsLoading(true)
    try {
      const f = claimFilterRefs.current
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (f.search) params.set('search', f.search)
      if (f.dateFrom) params.set('dateFrom', f.dateFrom)
      if (f.dateTo) params.set('dateTo', f.dateTo)
      if (f.program) params.set('program', f.program)
      if (f.crew) params.set('crewId', f.crew)
      if (f.showClaimed !== 'all') params.set('claimed', f.showClaimed === 'claimed' ? 'true' : 'false')
      const r = await safeFetch(`/api/claims?${params}`)
      const d = await r.json()
      setClaimSales(d.sales || [])
      setClaimTotal(d.total || 0)
      setClaimTotalPages(d.totalPages || 1)
      setClaimPage(d.page || 1)
      if (d.summary) setClaimSummary(d.summary)
    } catch { /* silent */ }
    finally { setClaimsLoading(false) }
  }, []) // stable — reads latest filter values from refs

  // Re-fetch claims when tab becomes active OR any filter changes
  const prevFilterKeyRef = useRef('')
  const prevActiveTabRef = useRef(activeTab)
  useEffect(() => {
    const tabChanged = prevActiveTabRef.current !== activeTab
    prevActiveTabRef.current = activeTab
    if (activeTab !== 'claims') return
    const key = `${debouncedClaimSearch}|${claimDateFrom}|${claimDateTo}|${claimFilterProgram}|${claimFilterCrew}|${claimShowClaimed}`
    // Always fetch on tab switch to claims, then only on actual filter changes
    if (!tabChanged && key === prevFilterKeyRef.current) return
    prevFilterKeyRef.current = key
    setClaimPage(1)
    fetchClaims(1)
  }, [activeTab, debouncedClaimSearch, claimDateFrom, claimDateTo, claimFilterProgram, claimFilterCrew, claimShowClaimed, fetchClaims])

  // Fetch programs for filter dropdown — staggered 500ms
  const fetchPrograms = useCallback(async () => {
    try {
      const r = await safeFetch('/api/claims/programs')
      const d = await r.json()
      if (d.programs && Array.isArray(d.programs)) setPrograms(d.programs)
    } catch { /* silent */ }
  }, [])

  // Fetch programs only when claims tab is active (PERF: lazy load)
  const programsLoadedRef = useRef(false)
  useEffect(() => {
    if (activeTab !== 'claims' || programsLoadedRef.current) return
    programsLoadedRef.current = true
    fetchPrograms()
  }, [activeTab, fetchPrograms])

  // Fetch management data — only when admin tab is active
  const [mgmtInitialLoaded, setMgmtInitialLoaded] = useState(false)
  const fetchManagement = useCallback(async () => {
    setMgmtLoading(true)
    try {
      const [g, c] = await Promise.all([safeFetch('/api/groups').then(r => r.json()), safeFetch('/api/crews').then(r => r.json())])
      if (Array.isArray(g)) setGroups(g)
      if (Array.isArray(c)) setMgmtCrews(c)
    } catch { /* silent */ }
    finally { setMgmtLoading(false); setMgmtInitialLoaded(true) }
  }, [])

  useEffect(() => { if (isAdmin) fetchManagement() }, [isAdmin, fetchManagement])

  // Auto-refresh on tab switch (PERF: only fetch active tab's data)
  const [dashInitialLoaded, setDashInitialLoaded] = useState(false)
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchDashboard()
      setDashInitialLoaded(true)
    }
    // NOTE: claims refetch is handled by the dedicated filter-change effect above
    else if (activeTab === 'management' && isAdmin) fetchManagement()
  }, [activeTab, fetchDashboard, fetchManagement, isAdmin])

  // Scroll listener for back-to-top button
  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 300)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // ─── Keyboard Shortcuts ────────────────────────────────
  const handleExportRef = useRef<() => void>(() => {})

  useEffect(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

    function isInputFocused(e: KeyboardEvent): boolean {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if ((e.target as HTMLElement)?.isContentEditable) return true
      return false
    }

    function isDialogOpen(): boolean {
      return !!(showUploadModal || editSaleDialog || deleteConfirm || showAddCrew || showAddGroup || showShortcuts || selectedCrewDetail || crewPhotoPreview || selectedGroupDetail)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // ── Escape: close any open dialog + deselect claims ──
      if (e.key === 'Escape') {
        // Let the Dialog component handle its own Escape first
        // Close shortcuts help first
        if (showShortcuts) { setShowShortcuts(false); e.preventDefault(); return }
        // Close other dialogs
        if (showUploadModal) { setShowUploadModal(false); e.preventDefault(); return }
        if (editSaleDialog) { setEditSaleDialog(null); e.preventDefault(); return }
        if (deleteConfirm) { setDeleteConfirm(null); e.preventDefault(); return }
        if (showAddCrew) { setShowAddCrew(false); return }
        if (showAddGroup) { setShowAddGroup(false); return }
        if (selectedCrewDetail) { setSelectedCrewDetail(null); return }
        if (crewPhotoPreview) { setCrewPhotoPreview(null); return }
        if (selectedGroupDetail) { setSelectedGroupDetail(null); return }
        if (showFilterPanel) { setShowFilterPanel(false); return }
        // Deselect all claims
        if (selectedSaleIds.size > 0) { setSelectedSaleIds(new Set()); return }
        return
      }

      // Don't process non-modifier shortcuts when input is focused
      const inputFocused = isInputFocused(e)
      const dialogOpen = isDialogOpen()

      // ── ? : Toggle shortcuts help (only when no input focused) ──
      if (e.key === '?' && !inputFocused && !dialogOpen) {
        e.preventDefault()
        setShowShortcuts(prev => !prev)
        return
      }

      // ── Ctrl/Cmd + K : Focus search input ──
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        // Find the search input for the current tab
        if (activeTab === 'claims') {
          const input = document.querySelector<HTMLInputElement>('input[placeholder="Cari kode, brand, dept, crew..."]')
          input?.focus()
        } else if (activeTab === 'management') {
          const input = document.querySelector<HTMLInputElement>('input[placeholder="Cari crew, ID, atau group..."]')
          input?.focus()
        }
        return
      }

      // ── Ctrl/Cmd + U : Open upload dialog (claims tab) ──
      if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
        e.preventDefault()
        if (activeTab === 'claims') setShowUploadModal(true)
        return
      }

      // ── Ctrl/Cmd + E : Export CSV (claims tab) ──
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        if (activeTab === 'claims') handleExportRef.current()
        return
      }

      // ── Navigation and theme shortcuts: only when no input/dialog focused ──
      if (inputFocused || dialogOpen) return

      // ── 1, 2, 3, 4, 5 : Switch tabs ──
      if (e.key === '1') { setActiveTab('dashboard'); return }
      if (e.key === '2') { setActiveTab('claims'); return }
      if (e.key === '3') { setActiveTab('export'); return }
      if (e.key === '4') { setActiveTab('management'); return }

      // ── T : Toggle theme ──
      if (e.key === 't' || e.key === 'T') {
        cycleTheme()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, showUploadModal, editSaleDialog, deleteConfirm, showAddCrew, showAddGroup, showShortcuts, selectedCrewDetail, crewPhotoPreview, selectedGroupDetail, selectedSaleIds, showFilterPanel, cycleTheme])

  // ─── Auth handlers ────────────────────────────────────
  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) { toast.error('Isi username dan password'); return }
    try {
      const r = await safeFetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginForm) })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      setIsAdmin(true)
      setAdminName(d.admin.name)
      toast.success(`Selamat datang, ${d.admin.name}!`)
    } catch (e: any) { toast.error('Login gagal: ' + (e.message || 'Network error')) }
  }

  const handleLogout = async () => {
    await safeFetch('/api/auth', { method: 'DELETE' })
    setIsAdmin(false)
    toast.success('Berhasil logout')
  }

  // ─── Claim handlers ───────────────────────────────────
  const processImport = async (file: File) => {
    setUploading(true)
    setUploadProgress(0)
    setUploadResult(null)

    // Simulated progress: reading phase
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 85) return prev
        return prev + Math.random() * 15
      })
    }, 200)

    const fd = new FormData()
    fd.append('file', file)
    try {
      const r = await safeFetch('/api/claims', { method: 'POST', body: fd }, 120000)
      const d = await r.json()
      clearInterval(progressInterval)
      setUploadProgress(100)
      if (d.error) { toast.error(d.error); return }
      setUploadResult(d.summary)
      const dupCount = d.summary?.duplicateRows || 0
      if (d.summary?.totalRows === 0 && dupCount > 0) {
        toast.info(`${dupCount} data sudah ada di database — tidak ada data baru`)
      } else if (dupCount > 0) {
        toast.success(`Import berhasil! ${d.summary?.totalRows || 0} data baru — ${dupCount} duplikat dilewati`)
      } else {
        toast.success(`Import berhasil! ${d.summary?.totalRows || 0} data diimpor — Total: ${fmtRp(d.summary?.totalSettle || 0)}`)
      }
      // BUGFIX: Auto-clear date filter after import so ALL imported data is visible
      setClaimDateFrom('')
      setClaimDateTo('')
      fetchClaims(1)
      fetchDashboard()
      fetchPrograms()
    } catch {
      toast.error('Gagal memproses file')
    } finally {
      clearInterval(progressInterval)
      setUploading(false)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processImport(file)
    e.target.value = ''
  }

  const handleDropFile = async (file: File) => {
    if (!file) return
    await processImport(file)
  }

  const handleClaimSales = async (retryCount = 0) => {
    if (selectedSaleIds.size === 0) return
    if (!selectedClaimCrewId) { toast.error('Cari dan pilih crew terlebih dahulu'); return }
    const crew = crews.find(c => c.id === selectedClaimCrewId)
    if (!crew) { toast.error('Crew tidak ditemukan'); return }
    setClaiming(true)
    try {
      const r = await safeFetch('/api/claims', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds: Array.from(selectedSaleIds), crewId: crew.id })
      })
      const d = await r.json()

      // ── Handle conflict responses (race condition detected) ──
      if (d.code === 'ALL_CONFLICT') {
        // ALL requested sales were already claimed by someone else
        const claimers = [...new Set((d.conflictDetails || []).map((c: { claimedBy: string }) => c.claimedBy))]
        toast.error(`⚠️ Semua data sudah di-claim oleh ${claimers.join(', ')}! Data mungkin sudah diambil oleh device lain.`, { duration: 8000 })
        setSelectedSaleIds(new Set())
        setClaimCrewSearch('')
        setSelectedClaimCrewId('')
        fetchClaims(claimPage)
        return
      }

      if (d.code === 'PARTIAL_CONFLICT') {
        // Some sales claimed successfully, some conflicted
        const claimers = [...new Set((d.conflictDetails || []).map((c: { claimedBy: string }) => c.claimedBy))]
        toast.warning(
          `⚡ ${d.claimedCount} berhasil, ${d.conflictCount} sudah di-claim ${claimers.join(', ')} — kemungkinan claim bersamaan dari device lain`,
          { duration: 8000 }
        )
        setSelectedSaleIds(new Set())
        setClaimCrewSearch('')
        setSelectedClaimCrewId('')
        fetchClaims(claimPage)
        fetchDashboard()
        return
      }

      if (d.error) {
        // Network error or server error — retry with exponential backoff (max 2 retries)
        if (retryCount < 2 && !r.ok) {
          const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s
          toast.info(`⏳ Retry ${retryCount + 1} setelah ${delay / 1000}s... (jaringan lambat)`, { duration: delay })
          setClaiming(false)
          await new Promise(resolve => setTimeout(resolve, delay))
          return handleClaimSales(retryCount + 1)
        }
        toast.error(d.error)
        return
      }

      // Full success
      toast.success(`✅ ${d.claimedCount || 0} data berhasil di-claim ke ${crew.name} (${fmtRp(d.totalSettle || 0)})`)
      setSelectedSaleIds(new Set())
      setClaimCrewSearch('')
      setSelectedClaimCrewId('')
      fetchClaims(claimPage)
      fetchDashboard()
    } catch {
      // Network failure — retry once
      if (retryCount < 1) {
        toast.info('⏳ Koneksi gagal, mencoba lagi...')
        setClaiming(false)
        await new Promise(resolve => setTimeout(resolve, 1500))
        return handleClaimSales(retryCount + 1)
      }
      toast.error('❌ Gagal meng-claim data. Periksa koneksi internet dan coba lagi.')
    } finally { setClaiming(false) }
  }

  const handleUnclaimSale = async (saleId: string) => {
    try {
      const r = await safeFetch('/api/claims/unclaim', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds: [saleId] })
      })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      toast.success('Data berhasil di-unclaim')
      fetchClaims(claimPage)
      fetchDashboard()
    } catch { toast.error('Gagal meng-unclaim data') }
  }

  // Sort claims for Laporan Penjualan (memoized)
  const sortedClaimSales = useMemo(() => [...claimSales].sort((a, b) => {
    const dir = claimSortDir === 'asc' ? 1 : -1
    if (claimSortField === 'tanggal') return dir * a.tanggal.localeCompare(b.tanggal)
    if (claimSortField === 'qty') return dir * (a.qty - b.qty)
    if (claimSortField === 'settle') return dir * (a.settle - b.settle)
    if (claimSortField === 'kodeExtend') return dir * a.kodeExtend.localeCompare(b.kodeExtend)
    if (claimSortField === 'dept') return dir * (a.dept || '').localeCompare(b.dept || '')
    if (claimSortField === 'brand') return dir * (a.brand || '').localeCompare(b.brand || '')
    return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }), [claimSales, claimSortField, claimSortDir])

  // Delete a sale record (admin only)
  const handleDeleteSale = async (id: string) => {
    try {
      const r = await fetch(`/api/claims?id=${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      toast.success(d.message)
      setBatchSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      fetchClaims(claimPage)
      fetchDashboard()
    } catch { toast.error('Gagal menghapus data') }
  }

  // Batch delete selected sale records
  const handleBatchDeleteSales = async (ids: string[]) => {
    if (ids.length === 0) return
    setBatchDeleting(true)
    try {
      const results = await Promise.allSettled(
        ids.map(id => fetch(`/api/claims?id=${id}`, { method: 'DELETE' }).then(r => r.json()))
      )
      const succeeded = results.filter(r => r.status === 'fulfilled').length
      const failed = results.length - succeeded
      toast.success(`Berhasil menghapus ${succeeded} data${failed > 0 ? ` (${failed} gagal)` : ''}`)
      setBatchSelectedIds(new Set())
      fetchClaims(1)
      fetchDashboard()
    } catch { toast.error('Gagal menghapus data') }
    finally { setBatchDeleting(false) }
  }

  // Open edit sale dialog
  const openEditSale = (sale: ClaimSale) => {
    setEditSaleDialog(sale)
    setEditSaleForm({
      tanggal: sale.tanggal,
      kodeExtend: sale.kodeExtend,
      qty: sale.qty,
      settle: sale.settle,
      dept: sale.dept || '',
      brand: sale.brand || '',
      modul: sale.modul || '',
      pembayaran: sale.pembayaran || '',
      program: sale.program || '',
      crewId: sale.crew?.id || '__none__',
    })
  }

  // Save edited sale
  const handleSaveEditSale = async () => {
    if (!editSaleDialog) return
    setEditSaleSaving(true)
    try {
      const body: Record<string, unknown> = {
        id: editSaleDialog.id,
        tanggal: editSaleForm.tanggal,
        kodeExtend: editSaleForm.kodeExtend,
        qty: Number(editSaleForm.qty),
        settle: Number(editSaleForm.settle),
        dept: editSaleForm.dept,
        brand: editSaleForm.brand,
        modul: editSaleForm.modul,
        pembayaran: editSaleForm.pembayaran,
        program: editSaleForm.program,
        crewId: (editSaleForm.crewId && editSaleForm.crewId !== '__none__') ? editSaleForm.crewId : null,
      }
      const r = await fetch('/api/claims', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      toast.success('Data berhasil diperbarui')
      setEditSaleDialog(null)
      fetchClaims(claimPage)
      fetchDashboard()
    } catch { toast.error('Gagal mengubah data') }
    finally { setEditSaleSaving(false) }
  }

  // Filtered management crews
  const filteredMgmtCrews = useMemo(() => {
    if (!mgmtSearch) return mgmtCrews
    const q = mgmtSearch.toLowerCase()
    return mgmtCrews.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.employeeId.toLowerCase().includes(q) ||
      c.group?.name.toLowerCase().includes(q)
    )
  }, [mgmtCrews, mgmtSearch])

  // Filtered crews for claim crew search dropdown
  const claimCrewResults = useMemo(() => {
    if (!claimCrewSearch || claimCrewSearch.length < 1) return []
    const q = claimCrewSearch.toLowerCase()
    return crews.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.employeeId.toLowerCase().includes(q)
    ).slice(0, 5)
  }, [claimCrewSearch, crews])

  const filteredGroups = useMemo(() => {
    if (!mgmtSearch) return groups
    const q = mgmtSearch.toLowerCase()
    return groups.filter(g =>
      g.name.toLowerCase().includes(q)
    )
  }, [groups, mgmtSearch])

  // ─── Claim computed values ───────────────────────────
  const claimStats = useMemo(() => {
    const unclaimedInPage = claimSales.filter(s => !s.crew)
    const claimedInPage = claimSales.filter(s => !!s.crew)
    const todayItems = claimSales.filter(s => s.tanggal && s.tanggal.startsWith(todayStr))
    const todaySettle = todayItems.reduce((sum, s) => sum + s.settle, 0)
    const todayStruk = new Set(todayItems.map(s => s.idPenjualan).filter(Boolean)).size
    return {
      unclaimedCount: unclaimedInPage.length,
      claimedCount: claimedInPage.length,
      unclaimedSettle: unclaimedInPage.reduce((sum, s) => sum + s.settle, 0),
      claimedSettle: claimedInPage.reduce((sum, s) => sum + s.settle, 0),
      todayActivity: claimSales.filter(s => s.claimedAt && s.claimedAt.startsWith(todayStr)).length,
      todaySettle,
      todayItems: todayItems.length,
      todayStruk,
    }
  }, [claimSales, todayStr])

  const selectedItemsTotal = useMemo(() => {
    return claimSales.filter(s => selectedSaleIds.has(s.id)).reduce((sum, s) => sum + s.settle, 0)
  }, [claimSales, selectedSaleIds])

  const selectedItemsPreview = useMemo(() => {
    return claimSales.filter(s => selectedSaleIds.has(s.id)).slice(0, 3)
  }, [claimSales, selectedSaleIds])

  const selectedClaimCrew = useMemo(() => {
    return crews.find(c => c.id === selectedClaimCrewId) || null
  }, [crews, selectedClaimCrewId])

  const activeQuickFilter = useMemo((): 'today' | 'week' | 'month' | 'all' | 'custom' => {
    const week = getWeekRange()
    const month = getMonthRange()
    if (claimDateFrom === todayStr && claimDateTo === todayStr) return 'today'
    if (claimDateFrom === week.from && claimDateTo === week.to) return 'week'
    if (claimDateFrom === month.from && claimDateTo === month.to) return 'month'
    if (!claimDateFrom && !claimDateTo) return 'all'
    return 'custom'
  }, [claimDateFrom, claimDateTo, todayStr])

  // Count active filters for badge
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (claimSearch) count++
    if (claimFilterProgram) count++
    if (claimFilterCrew) count++
    if (activeQuickFilter === 'custom') count++
    if (claimShowClaimed !== 'unclaimed') count++
    return count
  }, [claimSearch, claimFilterProgram, claimFilterCrew, activeQuickFilter, claimShowClaimed])

  // ─── Management handlers ──────────────────────────────
  const handleSaveCrew = async (data: { name: string; photo: string; employeeId: string; groupId: string; removePhoto?: boolean }) => {
    try {
      const url = editCrew ? '/api/crews' : '/api/crews'
      const method = editCrew ? 'PUT' : 'POST'
      const { removePhoto, ...rest } = data
      const body = editCrew ? { id: editCrew.id, ...rest, photo: removePhoto ? null : rest.photo } : rest
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      toast.success(editCrew ? 'Crew diperbarui' : 'Crew ditambahkan')
      setShowAddCrew(false); setEditCrew(null); fetchManagement()
    } catch { toast.error('Gagal menyimpan crew') }
  }

  const handleDeleteCrew = async (id: string) => {
    try {
      const r = await fetch(`/api/crews?id=${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      toast.success('Crew dihapus'); fetchManagement()
    } catch { toast.error('Gagal menghapus crew') }
  }

  const handleSaveGroup = async (data: { name: string; logo: string; monthlyTarget: number; week1Target: number; week2Target: number; week3Target: number; week4Target: number; week5Target: number; tiktokActive: boolean }) => {
    try {
      const method = editGroup ? 'PUT' : 'POST'
      const body = editGroup ? { id: editGroup.id, ...data } : data
      const r = await safeFetch('/api/groups', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      toast.success(editGroup ? 'Group diperbarui' : 'Group ditambahkan')
      setShowAddGroup(false); setEditGroup(null); fetchManagement()
    } catch { toast.error('Gagal menyimpan group') }
  }

  const handleDeleteGroup = async (id: string) => {
    try {
      const r = await fetch(`/api/groups?id=${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      toast.success('Group dihapus'); fetchManagement()
    } catch { toast.error('Gagal menghapus group') }
  }

  // ─── Group Detail fetch ──────────────────────────────
  const fetchGroupDetail = useCallback(async (groupId: string, period: 'daily' | 'weekly' | 'monthly') => {
    setGroupDetailLoading(true)
    try {
      const r = await safeFetch(`/api/dashboard/group-detail?groupId=${groupId}&period=${period}`)
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      setGroupDetailData(d)
    } catch { toast.error('Gagal memuat detail grup') }
    finally { setGroupDetailLoading(false) }
  }, [])

  // Open group detail when selectedGroupDetail changes
  useEffect(() => {
    if (selectedGroupDetail) {
      fetchGroupDetail(selectedGroupDetail.id, groupDetailPeriod)
    }
  }, [selectedGroupDetail, groupDetailPeriod, fetchGroupDetail])

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (claimDateFrom) params.set('dateFrom', claimDateFrom)
      if (claimDateTo) params.set('dateTo', claimDateTo)
      const url = `/api/export${params.toString() ? '?' + params.toString() : ''}`
      const r = await fetch(url)
      if (!r.ok) { toast.error('Gagal mengekspor data'); return }
      const blob = await r.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `laporan-penjualan-${getWIBToday()}.csv`
      link.click()
      URL.revokeObjectURL(link.href)
      toast.success('Data berhasil diekspor ke CSV')
    } catch { toast.error('Gagal mengekspor data') }
  }
  handleExportRef.current = handleExport

  // Delete confirm handler (centralized)
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === 'crew') await handleDeleteCrew(deleteConfirm.id!)
    else if (deleteConfirm.type === 'group') await handleDeleteGroup(deleteConfirm.id!)
    else if (deleteConfirm.type === 'sale') await handleDeleteSale(deleteConfirm.id!)
    else if (deleteConfirm.type === 'batch-sale') await handleBatchDeleteSales(deleteConfirm.ids || [])
    setDeleteConfirm(null)
  }

  // ─── Render Helpers ───────────────────────────────────
  const wibDate = getWIBDate()
  const dateStr = `${dayNames[wibDate.getDay()]}, ${wibDate.getDate()} ${monthNames[wibDate.getMonth()]} ${wibDate.getFullYear()}`

  // ─── Greeting Config (WIB time-of-day) ─────────────────
  const greetingConfig = useMemo(() => {
    const hour = wibDate.getHours()
    if (hour >= 5 && hour <= 11) return { text: 'Selamat Pagi', icon: Sun, gradient: 'from-[#E14227] via-[#D4956B] to-[#E6BAA3]', bgGradient: 'from-[#F0EAD6]/80 via-[#E6DDD0]/60 to-[#E6BAA3]/40 dark:from-[#E14227]/10 dark:via-[#D4956B]/5 dark:to-[#E6BAA3]/5', iconColor: 'text-[#E14227]', textColor: 'from-[#B8321E] to-[#E14227] dark:from-[#F07050] dark:to-[#E14227]' }
    if (hour >= 12 && hour <= 14) return { text: 'Selamat Siang', icon: Sun, gradient: 'from-[#D4956B] via-[#E14227] to-[#E6BAA3]', bgGradient: 'from-[#E6DDD0]/80 via-[#F0EAD6]/60 to-[#E6BAA3]/40 dark:from-[#D4956B]/10 dark:via-[#E14227]/5 dark:to-[#E6BAA3]/5', iconColor: 'text-[#D4956B]', textColor: 'from-[#B8321E] to-[#D4956B] dark:from-[#F07050] dark:to-[#D4956B]' }
    if (hour >= 15 && hour <= 17) return { text: 'Selamat Sore', icon: Sunset, gradient: 'from-[#9DB1CC] via-[#B2AC88] to-[#E6BAA3]', bgGradient: 'from-[#E6DDD0]/80 via-[#D5E0EB]/60 to-[#E6BAA3]/40 dark:from-[#9DB1CC]/10 dark:via-[#B2AC88]/5 dark:to-[#E6BAA3]/5', iconColor: 'text-[#9DB1CC]', textColor: 'from-[#7E95B3] to-[#9DB1CC] dark:from-[#B5C7DB] dark:to-[#9DB1CC]' }
    return { text: 'Selamat Malam', icon: Moon, gradient: 'from-[#1A1A1B] via-[#3A3632] to-[#5A524C]', bgGradient: 'from-[#E6DDD0]/40 via-[#1A1A1B]/60 to-[#1A1A1B]/40 dark:from-[#1A1A1B]/30 dark:via-[#3A3632]/20 dark:to-[#1A1A1B]/10', iconColor: 'text-[#E6BAA3]', textColor: 'from-[#E6BAA3] to-[#D4956B] dark:from-[#E6BAA3] dark:to-[#D4956B]' }
  }, [wibDate])


  // ─── RENDER ────────────────────────────────────────────
  const navItems = [
    { val: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', desc: 'Ringkasan & statistik' },
    { val: 'claims', icon: Upload, label: 'Claim Penjualan', desc: 'Upload & klaim data' },
    { val: 'tiktok', icon: ShoppingBag, label: 'TikTok', desc: 'Penjualan TikTok' },
    { val: 'export', icon: Download, label: 'Export Data', desc: 'Preview & ekspor penjualan' },
    { val: 'management', icon: Settings, label: 'Management', desc: 'Kelola crew & grup' },
  ]

  return (
    <>
    {/* ═══ GAMIFIED LOADING PAGE ═══ */}
    <GamifiedLoader isLoading={dashLoading && !dashboard} />

    <div className="min-h-screen flex flex-col bg-[#F0EAD6] dark:bg-[#1A1A1B] relative">
      {/* Dot pattern overlay */}
      <div className="absolute inset-0 bg-dot-pattern pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 flex flex-col min-h-screen">

      {/* ═══ PREMIUM NAVBAR ═══ */}
      <header className="sticky top-0 z-50">
        <div className="relative">
          {/* Top bar */}
          <div className="bg-white/70 dark:bg-[#1A1A1B]/80 backdrop-blur-2xl border-b border-border/50">
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14 sm:h-16">
                {/* Logo with Online Status & Loading Pulse Ring */}
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="relative">
                    {/* Activity Pulse Ring — visible when data is loading */}
                    {dashLoading && (
                      <div className="absolute -inset-1.5 rounded-2xl animate-logo-pulse-ring opacity-60" />
                    )}
                    <img src="/logo.png" alt="3SC CMS" className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-cover" />
                    {/* Online Status Indicator */}
                    <div className="absolute -top-0.5 -right-0.5 flex items-center justify-center">
                      <span className="absolute w-2.5 h-2.5 bg-[#B2AC88] rounded-full animate-subtle-pulse" />
                      <span className="absolute w-2.5 h-2.5 bg-[#B2AC88] rounded-full animate-online-ring" />
                      <span className="relative w-2 h-2 bg-[#B2AC88] rounded-full ring-2 ring-white dark:ring-[#1A1A1B]" />
                    </div>
                  </div>
                  <div className="hidden xs:block">
                    <h1 className="text-sm sm:text-base font-extrabold tracking-tight bg-gradient-to-r from-[#E14227] via-[#D4956B] to-[#9DB1CC] dark:from-[#E14227] dark:via-[#D4956B] dark:to-[#9DB1CC] bg-clip-text text-transparent leading-tight">
                      CMS Crew
                    </h1>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium -mt-0.5 tracking-wide">
                      Ahtjong Labs <span className="inline-block mx-1 text-muted-foreground/30">·</span> {dateStr}
                    </p>
                  </div>
                </div>

                {/* Desktop Nav */}
                <nav className="hidden md:flex items-center gap-1">
                  {navItems.map(t => (
                    <button
                      key={t.val}
                      onClick={() => setActiveTab(t.val)}
                      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                        activeTab === t.val
                          ? 'bg-[#E14227]/10 dark:bg-[#E14227]/20 text-[#E14227] dark:text-[#E14227] shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <t.icon className="w-4 h-4" />
                      {t.label}
                      {activeTab === t.val && (
                        <motion.div layoutId="nav-active" className="absolute inset-0 rounded-xl bg-[#E14227]/10 dark:bg-[#E14227]/20 -z-10" transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }} />
                      )}
                    </button>
                  ))}
                </nav>

                {/* Right actions */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Notification Center */}
                  <NotificationCenter notificationCount={notificationCount} bellSwingTrigger={bellSwingTrigger} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-muted" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts">
                        <Keyboard className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      <span className="flex items-center gap-1">Keyboard shortcuts <kbd className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted border border-border text-[10px] font-mono font-medium leading-none">?</kbd></span>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 rounded-full hover:bg-muted" onClick={cycleTheme}>
                        {mounted ? (
                          <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
                            {theme === 'system' ? <Monitor className="w-4 h-4" /> : resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                          </motion.span>
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                      {mounted ? (theme === 'light' ? 'Light Mode' : theme === 'dark' ? 'Dark Mode' : `System (${resolvedTheme})`) : '...'}
                    </TooltipContent>
                  </Tooltip>
                  {isAdmin && (
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="hidden sm:flex items-center gap-1.5">
                      <Badge variant="outline" className="bg-[#E14227]/10 text-[#E14227] border-[#E14227]/30 dark:bg-[#E14227]/20 dark:text-[#E14227] dark:border-[#E14227]/40 text-[10px] px-2 py-0.5">
                        <Shield className="w-3 h-3 mr-1" /> Admin
                      </Badge>
                      <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" title="Logout">
                        <LogOut className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Stats Ribbon (desktop only) */}
          {dashboard && !dashLoading && (
            <div className="hidden sm:block border-b border-border/30 bg-gradient-to-r from-white/60 via-[#F0EAD6]/20 to-[#E6BAA3]/10 dark:from-[#1A1A1B]/60 dark:via-[#1A1A1B]/40 dark:to-[#1A1A1B]/60">
              <div className="max-w-7xl mx-auto px-6 lg:px-8">
                <div className="flex items-center gap-2 py-2 overflow-x-auto scrollbar-none">
                  {[
                    { icon: Users, label: 'Crew', value: String(dashboard.crewStats.length), color: 'text-[#E14227] dark:text-[#E14227] bg-[#E14227]/10 dark:bg-[#E14227]/20 border-[#E14227]/20 dark:border-[#E14227]/30' },
                    { icon: Target, label: 'Groups', value: String(dashboard.groupAchievements.length), color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/40' },
                    { icon: Crown, label: 'Best', value: dashboard.topCrews[0]?.name?.split(' ')[0] || '-', color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200/60 dark:border-purple-800/40' },
                    { icon: Calendar, label: dashPeriod === 'today' ? 'Today' : dashPeriod === 'week' ? 'Week' : 'Month', value: dashPeriod === 'today' ? fmtRp(dashboard.totals.today) : dashPeriod === 'week' ? fmtRp(dashboard.totals.week) : fmtRp(dashboard.totals.month), color: 'text-[#9DB1CC] dark:text-[#9DB1CC] bg-[#9DB1CC]/10 dark:bg-[#9DB1CC]/20 border-[#9DB1CC]/20 dark:border-[#9DB1CC]/30' },
                  ].map((stat, i) => (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium whitespace-nowrap shrink-0 ${stat.color}`}>
                      <stat.icon className="w-3 h-3" />
                      <span className="text-muted-foreground">{stat.label}</span>
                      <span className="font-bold tabular-nums">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ═══ GREETING BANNER ═══ */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 pb-2"
        >
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${greetingConfig.bgGradient} border border-border/40`}>
            {/* Decorative gradient overlay */}
            <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl ${greetingConfig.gradient} opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl`} />
            <div className="relative flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5">
              <div className={`flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br ${greetingConfig.gradient} shadow-lg`}>
                <greetingConfig.icon className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className={`text-sm sm:text-base font-bold bg-gradient-to-r ${greetingConfig.textColor} bg-clip-text text-transparent`}>
                  {greetingConfig.text}
                  {adminName && (
                    <span className="ml-1.5 font-semibold text-foreground/80 dark:text-foreground/60">
                      — {adminName}
                    </span>
                  )}
                </h2>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                  {dateStr} · {dashboard && !dashLoading ? `${dashboard.crewStats.length} crew aktif` : 'Memuat data...'}
                </p>
              </div>
              {!isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs h-8 bg-white/60 dark:bg-gray-900/60 backdrop-blur-sm border-border/60 hover:bg-white dark:hover:bg-gray-900"
                  onClick={() => setActiveTab('management')}
                >
                  <Shield className="w-3.5 h-3.5 mr-1.5" />
                  Login
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ─── Main Content ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
        className="flex-1"
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

            {/* ─── Dashboard Tab ────────────────────────── */}
            <DashboardTab
              dashboard={dashboard}
              dashPeriod={dashPeriod}
              setDashPeriod={setDashPeriod}
              dashLoading={dashLoading}
              isAdmin={isAdmin}
              selectedCrewDetail={selectedCrewDetail}
              setSelectedCrewDetail={setSelectedCrewDetail}
              selectedGroupDetail={selectedGroupDetail}
              setSelectedGroupDetail={setSelectedGroupDetail}
              groupDetailData={groupDetailData}
              groupDetailPeriod={groupDetailPeriod}
              setGroupDetailPeriod={setGroupDetailPeriod}
              groupDetailLoading={groupDetailLoading}
              fetchDashboard={fetchDashboard}
              setActiveTab={setActiveTab}
              crewPhotoPreview={crewPhotoPreview}
              setCrewPhotoPreview={setCrewPhotoPreview}
              dashMonth={dashMonth}
              dashYear={dashYear}
              isCurrentMonth={isCurrentMonth}
              setDashMonth={setDashMonth}
              setDashYear={setDashYear}
            />

            {/* ─── Claims Tab ───────────────────────────── */}
            <ClaimsTab
              claimSales={claimSales}
              claimTotal={claimTotal}
              claimTotalPages={claimTotalPages}
              claimPage={claimPage}
              claimSearch={claimSearch}
              claimDateFrom={claimDateFrom}
              claimDateTo={claimDateTo}
              claimFilterProgram={claimFilterProgram}
              claimFilterCrew={claimFilterCrew}
              claimShowClaimed={claimShowClaimed}
              claimsLoading={claimsLoading}
              claimSortField={claimSortField}
              claimSortDir={claimSortDir}
              programs={programs}
              crews={crews}
              selectedSaleIds={selectedSaleIds}
              claimCrewSearch={claimCrewSearch}
              selectedClaimCrewId={selectedClaimCrewId}
              claimSummary={claimSummary}
              isAdmin={isAdmin}
              todayStr={todayStr}
              sortedClaimSales={sortedClaimSales}
              selectedItemsTotal={selectedItemsTotal}
              selectedItemsPreview={selectedItemsPreview}
              selectedClaimCrew={selectedClaimCrew}
              claimCrewResults={claimCrewResults}
              claimStats={claimStats}
              globalClaimedCount={dashboard?.claimedCount || 0}
              globalUnclaimedCount={dashboard?.unclaimedCount || 0}
              activeQuickFilter={activeQuickFilter}
              activeFilterCount={activeFilterCount}
              uploading={uploading}
              uploadProgress={uploadProgress}
              uploadResult={uploadResult}
              showUploadModal={showUploadModal}
              isDragOver={isDragOver}
              claiming={claiming}
              showFilterPanel={showFilterPanel}
              batchSelectedIds={batchSelectedIds}
              fileInputRef={fileInputRef}
              setClaimSearch={setClaimSearch}
              updateClaimSearch={updateClaimSearch}
              forceSearchNow={forceSearchNow}
              isSearchDebouncing={claimSearch !== debouncedClaimSearch}
              setClaimDateFrom={setClaimDateFrom}
              setClaimDateTo={setClaimDateTo}
              setClaimFilterProgram={setClaimFilterProgram}
              setClaimFilterCrew={setClaimFilterCrew}
              setClaimShowClaimed={setClaimShowClaimed}
              setClaimSortField={setClaimSortField}
              setClaimSortDir={setClaimSortDir}
              setSelectedSaleIds={setSelectedSaleIds}
              setClaimCrewSearch={setClaimCrewSearch}
              setSelectedClaimCrewId={setSelectedClaimCrewId}
              setShowUploadModal={setShowUploadModal}
              setIsDragOver={setIsDragOver}
              setShowFilterPanel={setShowFilterPanel}
              setBatchSelectedIds={setBatchSelectedIds}
              fetchClaims={fetchClaims}
              handleClaimSales={handleClaimSales}
              handleExport={handleExport}
              handleUnclaimSale={handleUnclaimSale}
              handleFileUpload={handleFileUpload}
              handleDropFile={handleDropFile}
              openEditSale={openEditSale}
              setDeleteConfirm={setDeleteConfirm}
              setActiveTab={setActiveTab}
            />

            {/* ─── TikTok Sales Tab ────────────────────── */}
            <TikTokSalesTab crews={crews} groups={groups} />

            {/* ─── Export Tab ─────────────────────────── */}
            <ExportTab
              crews={mgmtCrews}
              groups={groups}
              isAdmin={isAdmin}
            />

            {/* ─── Management Tab ───────────────────────── */}
            <ManagementTab
              isAdmin={isAdmin}
              mgmtLoading={!mgmtInitialLoaded && mgmtLoading}
              loginForm={loginForm}
              setLoginForm={setLoginForm}
              handleLogin={handleLogin}
              groups={groups}
              mgmtCrews={mgmtCrews}
              mgmtSearch={mgmtSearch}
              setMgmtSearch={setMgmtSearch}
              showAddCrew={showAddCrew}
              setShowAddCrew={setShowAddCrew}
              showAddGroup={showAddGroup}
              setShowAddGroup={setShowAddGroup}
              editCrew={editCrew}
              setEditCrew={setEditCrew}
              editGroup={editGroup}
              setEditGroup={setEditGroup}
              filteredMgmtCrews={filteredMgmtCrews}
              filteredGroups={filteredGroups}
              handleSaveCrew={handleSaveCrew}
              handleDeleteCrew={handleDeleteCrew}
              handleSaveGroup={handleSaveGroup}
              handleDeleteGroup={handleDeleteGroup}
              setDeleteConfirm={setDeleteConfirm}
              onImportSuccess={fetchManagement}
              adminName={adminName}
              onPasswordChanged={() => {
                setIsAdmin(false)
                setAdminName('')
                toast.info('Password berhasil diubah, silakan login kembali')
              }}
              onDataCleared={() => {
                fetchManagement()
                fetchDashboard()
              }}
            />
          </Tabs>
        </div>
      </motion.div>

      {/* ─── Crew Detail Slide Panel ──────────────────── */}
      <CrewDetailPanel
        selectedCrewDetail={selectedCrewDetail}
        setSelectedCrewDetail={setSelectedCrewDetail}
      />

      {/* ─── Group/Zoning Detail Modal ──────────────── */}
      <GroupDetailModal
        selectedGroupDetail={selectedGroupDetail}
        setSelectedGroupDetail={setSelectedGroupDetail}
        groupDetailData={groupDetailData}
        groupDetailPeriod={groupDetailPeriod}
        setGroupDetailPeriod={setGroupDetailPeriod}
        groupDetailLoading={groupDetailLoading}
      />

      {/* ─── Delete Confirm Dialog ──────────────────── */}
      <DeleteConfirmDialog
        deleteConfirm={deleteConfirm}
        setDeleteConfirm={setDeleteConfirm}
        batchDeleting={batchDeleting}
        onConfirmDelete={handleConfirmDelete}
      />

      {/* ─── Edit Sale Dialog (Admin Only) ─── */}
      <EditSaleDialog
        editSaleDialog={editSaleDialog}
        setEditSaleDialog={setEditSaleDialog}
        editSaleForm={editSaleForm}
        setEditSaleForm={setEditSaleForm}
        editSaleSaving={editSaleSaving}
        onSave={handleSaveEditSale}
        crews={crews}
      />

      {/* ─── Keyboard Shortcuts Help Panel ─── */}
      <KeyboardShortcutsHelp
        open={showShortcuts}
        onOpenChange={setShowShortcuts}
      />

      <footer className="mt-auto border-t border-border/50 bg-[#1A1A1B] text-white backdrop-blur-xl pb-20 md:pb-0">
        {/* Top accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-[#E14227]/40 to-transparent" />
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* Main footer content */}
          <div className="py-6 sm:py-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
              {/* Brand */}
              <div className="col-span-2 sm:col-span-1 space-y-3">
                <div className="flex items-center gap-2.5">
                  <img src="/logo.png" alt="3SC CMS" className="w-8 h-8 rounded-xl object-cover shadow-md" />
                  <div>
                    <p className="text-sm font-extrabold bg-gradient-to-r from-[#E14227] to-[#9DB1CC] dark:from-[#E14227] dark:to-[#9DB1CC] bg-clip-text text-transparent">CMS Crew</p>
                    <p className="text-[9px] text-white/60 font-medium">Management System</p>
                  </div>
                </div>
                <p className="text-[11px] text-white/60 leading-relaxed max-w-[220px]">
                  Platform manajemen crew & tracking penjualan terintegrasi. Dibangun oleh Ahtjong Labs.
                </p>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0 border-[#E14227]/30 dark:border-[#E14227]/40 text-[#E14227] dark:text-[#E14227]">v3.0</Badge>
                  <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0"><Code2 className="w-2.5 h-2.5 mr-0.5" />PWA</Badge>
                </div>
              </div>

              {/* Navigation */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-white uppercase tracking-widest">Menu</p>
                <div className="space-y-1.5">
                  {navItems.map(t => (
                    <button key={t.val} onClick={() => { setActiveTab(t.val); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors py-0.5">
                      <t.icon className="w-3 h-3 text-white/40" />{t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tech Stack */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-white uppercase tracking-widest">Teknologi</p>
                <div className="space-y-1.5">
                  {[
                    { icon: Monitor, label: 'Next.js 16' },
                    { icon: Briefcase, label: 'Prisma ORM' },
                    { icon: Beaker, label: 'Tailwind CSS' },
                    { icon: Sparkles, label: 'Framer Motion' },
                  ].map(t => (
                    <div key={t.label} className="flex items-center gap-2 text-xs text-white/60">
                      <t.icon className="w-3 h-3 text-[#E14227]/50" />{t.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* System */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-white uppercase tracking-widest">Sistem</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3 h-3 text-[#E14227]/50" />
                    <span className="text-xs text-white/60">GMT+7 (WIB)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3 h-3 text-[#E14227]/50" />
                    <span className="text-xs text-white/60">PWA Ready</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-3 h-3 text-[#E14227]/50" />
                    <span className="text-xs text-white/60">Admin Auth</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="py-3 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-[10px] text-white/60 text-center sm:text-left">
              © {currentYear} <span className="font-semibold text-white/70">Ahtjong Labs</span>. All rights reserved.
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-white/60">Made with</span>
              <Heart className="w-3 h-3 text-red-500 fill-red-500" />
              <span className="text-[10px] text-white/60">in Indonesia</span>
            </div>
          </div>
        </div>
      </footer>

      {/* ─── Back to Top Button ────────────────────────── */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-20 right-4 sm:right-6 z-40 w-10 h-10 rounded-full bg-[#E14227] hover:bg-[#B8321E] text-white shadow-lg shadow-[#E14227]/25 flex items-center justify-center transition-colors"
            aria-label="Back to top"
          >
            <ChevronUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ═══ FLOATING CLAIM BAR ═══ */}
      <AnimatePresence>
        {selectedSaleIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed z-40 left-0 right-0 md:left-auto md:right-6 md:bottom-6 md:w-[440px]"
            style={{ bottom: 'max(60px, env(safe-area-inset-bottom, 60px))' }}
          >
            <div className="mx-3 mb-1 md:mx-0 md:mb-0 rounded-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl border border-[#E14227]/20 dark:border-[#E14227]/40 shadow-2xl shadow-[#E14227]/10">
              {/* Top row: info + close */}
              <div className="flex items-center justify-between px-3 pt-3 pb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#E14227]/10 dark:bg-[#E14227]/20 shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-[#E14227] dark:text-[#E14227]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">
                      {selectedSaleIds.size} item dipilih
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate">{fmtRp(selectedItemsTotal)}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSaleIds(new Set())}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0"
                  title="Batal pilih"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Preview badges */}
              {selectedItemsPreview.length > 0 && (
                <div className="flex items-center gap-1 px-3 pb-2 overflow-hidden">
                  {selectedItemsPreview.map(s => (
                    <Badge key={s.id} variant="outline" className="text-[9px] px-1.5 py-0 h-5 font-mono shrink-0 bg-muted/50 border-border/50">
                      {s.kodeExtend.length > 8 ? s.kodeExtend.slice(0, 8) + '…' : s.kodeExtend}
                    </Badge>
                  ))}
                  {selectedSaleIds.size > 3 && (
                    <span className="text-[10px] text-muted-foreground shrink-0">+{selectedSaleIds.size - 3}</span>
                  )}
                </div>
              )}

              {/* Crew search or selected crew + claim button */}
              <div className="px-3 pb-3">
                {selectedClaimCrew && selectedClaimCrewId ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-[#E14227]/10 dark:bg-[#E14227]/20 border border-[#E14227]/20 dark:border-[#E14227]/40">
                      <Avatar className="w-5 h-5 shrink-0">
                        <AvatarImage src={selectedClaimCrew.photo || ''} />
                        <AvatarFallback className="text-[7px] bg-[#E14227]/10 dark:bg-[#E14227]/20 text-[#E14227] dark:text-[#E14227]">
                          {selectedClaimCrew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs font-medium text-[#E14227] dark:text-[#E14227] truncate">{selectedClaimCrew.name}</span>
                      <button onClick={() => { setSelectedClaimCrewId(''); setClaimCrewSearch('') }} className="ml-auto text-[#E14227]/60 hover:text-[#E14227] dark:hover:text-[#E14227] shrink-0">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <Button
                      onClick={() => handleClaimSales(0)}
                      disabled={claiming}
                      size="sm"
                      className="shrink-0 bg-gradient-to-r from-[#E14227] to-[#B8321E] hover:from-[#B8321E] hover:to-[#E14227] text-white shadow-lg shadow-[#E14227]/25 disabled:opacity-50 animate-pulse-glow h-9 px-4"
                    >
                      {claiming ? (
                        <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />OK</>
                      ) : (
                        <><UserCheck className="w-3.5 h-3.5 mr-1.5" />Claim</>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="relative z-50">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Cari nama crew untuk claim..."
                          value={claimCrewSearch}
                          onChange={e => { setClaimCrewSearch(e.target.value); setSelectedClaimCrewId('') }}
                          className="pl-8 h-9 w-full text-xs rounded-xl"
                          autoFocus
                        />
                      </div>
                      <Button
                        onClick={() => handleClaimSales(0)}
                        disabled={true}
                        size="sm"
                        className="shrink-0 bg-gradient-to-r from-[#E14227] to-[#B8321E] text-white shadow-lg shadow-[#E14227]/25 disabled:opacity-50 disabled:cursor-not-allowed h-9 px-4"
                      >
                        <UserCheck className="w-3.5 h-3.5 mr-1.5" />Claim
                      </Button>
                    </div>
                    {/* Crew search dropdown */}
                    {!selectedClaimCrewId && claimCrewResults.length > 0 && (
                      <div className="absolute bottom-full left-0 right-8 mb-1 rounded-xl border border-[#E14227]/20 dark:border-[#E14227]/40 bg-white dark:bg-gray-900 shadow-xl max-h-52 overflow-y-auto">
                        {claimCrewResults.map(c => (
                          <button
                            key={c.id}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                            onClick={() => { setClaimCrewSearch(c.name); setSelectedClaimCrewId(c.id) }}
                          >
                            <Avatar className="w-7 h-7 shrink-0">
                              <AvatarImage src={c.photo || ''} />
                              <AvatarFallback className="text-[8px] bg-[#E14227]/10 dark:bg-[#E14227]/20 text-[#E14227] dark:text-[#E14227]">
                                {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{c.name}</p>
                              <p className="text-[10px] text-muted-foreground">{c.employeeId} — {c.group?.name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Anti double-claim indicator */}
                <div className="flex items-center gap-1.5 mt-1.5 px-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#B2AC88] animate-pulse" />
                  <span className="text-[9px] text-muted-foreground">Anti double-claim aktif</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MOBILE BOTTOM NAVIGATION ═══ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-[#1A1A1B]/90 backdrop-blur-2xl border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-around px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          {navItems.map(t => {
            const isActive = activeTab === t.val
            const hasUnclaimed = t.val === 'claims' && notificationCount > 0
            return (
              <motion.button
                key={t.val}
                onClick={() => { setActiveTab(t.val); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-2xl min-w-[64px] transition-colors duration-200 ${
                  isActive
                    ? 'text-[#E14227] dark:text-[#E14227]'
                    : 'text-muted-foreground active:text-[#E14227]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="bottomnav-active"
                    className="absolute inset-0 rounded-2xl bg-[#E14227]/10 dark:bg-[#E14227]/20 shadow-sm shadow-[#E14227]/10"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-0.5">
                  <motion.div
                    className={`w-6 h-6 flex items-center justify-center rounded-lg transition-all duration-200 ${isActive ? 'bg-[#E14227]/10 dark:bg-[#E14227]/20' : ''}`}
                    animate={isActive ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    <t.icon className={`w-[18px] h-[18px] transition-all duration-200 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
                  </motion.div>
                  <span className={`text-[10px] font-semibold leading-none transition-all duration-200 ${isActive ? 'text-[#E14227] dark:text-[#E14227]' : ''}`}>
                    {t.val === 'claims' ? 'Claim' : t.val === 'management' ? 'Mgmt' : t.label}
                  </span>
                </div>
                {/* Notification badge for unclaimed items */}
                {hasUnclaimed && !isActive && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-0.5 right-1.5 flex items-center justify-center"
                  >
                    <span className="w-2 h-2 bg-[#E14227] rounded-full ring-2 ring-white dark:ring-[#1A1A1B] animate-badge-pulse" />
                  </motion.span>
                )}
              </motion.button>
            )
          })}
        </div>
      </nav>

      </div>
      </div>
    </>
  )
}
