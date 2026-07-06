'use client'

import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import {
  Trophy, Medal, Target, TrendingUp, Users, Star, Zap, ArrowUpRight, ArrowDownRight,
  BarChart3, Calendar, Flame, Clock, Eye, RefreshCw, Upload, ShoppingCart, Package, X,
  Sun, CloudSun, CloudMoon, Moon, Sparkles, Receipt, ShoppingBag,
  ArrowLeftRight, TrendingDown, Minus, CircleDollarSign, CalendarDays, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { fmtRp, fmtNum, fadeIn, stagger, AnimatedCounter, SkeletonRow, AchievementBadge, CircularProgress, monthNames, getWIBDate, timeAgo, getWeekRangesForMonth } from '@/lib/cms-utils'
import type { DashboardData, CrewStat, GroupAchievement, GroupDetailData } from '@/lib/cms-types'
import LoadingOverlay from '@/components/ui/LoadingOverlay'
import DashboardExport from '@/components/dashboard/DashboardExport'

interface DashboardTabProps {
  dashboard: DashboardData | null
  dashPeriod: 'today' | 'week' | 'month'
  setDashPeriod: (p: 'today' | 'week' | 'month') => void
  dashLoading: boolean
  isAdmin: boolean
  selectedCrewDetail: CrewStat | null
  setSelectedCrewDetail: (c: CrewStat | null) => void
  selectedGroupDetail: GroupAchievement | null
  setSelectedGroupDetail: (g: GroupAchievement | null) => void
  groupDetailData: GroupDetailData | null
  groupDetailPeriod: 'daily' | 'weekly' | 'monthly'
  setGroupDetailPeriod: (p: 'daily' | 'weekly' | 'monthly') => void
  groupDetailLoading: boolean
  fetchDashboard: () => void
  setActiveTab: (v: string) => void
  crewPhotoPreview: { name: string; photo: string } | null
  setCrewPhotoPreview: (v: { name: string; photo: string } | null) => void
  dashMonth: number
  dashYear: number
  isCurrentMonth: boolean
  setDashMonth: (m: number) => void
  setDashYear: (y: number) => void
}

/* ─── Welcome Card ──────────────────────────────────────────── */
function WelcomeCard({ dashboard, isCurrentMonth, dashMonth, dashYear }: { dashboard: DashboardData; isCurrentMonth: boolean; dashMonth: number; dashYear: number }) {
  const hour = getWIBDate().getHours()
  let gradient: string
  let GreetingIcon: React.ElementType
  let iconColor: string
  let bgDecor: string

  if (isCurrentMonth) {
    if (hour >= 5 && hour < 11) {
      gradient = 'from-amber-400 via-orange-400 to-rose-400'
      GreetingIcon = Sun
      iconColor = 'text-amber-200'
      bgDecor = 'from-amber-500/10 via-orange-500/5 to-transparent'
    } else if (hour >= 11 && hour < 15) {
      gradient = 'from-[#9DB1CC] via-[#B5C7DB] to-[#7E95B3]'
      GreetingIcon = CloudSun
      iconColor = 'text-[#B5C7DB]'
      bgDecor = 'from-[#9DB1CC]/10 via-[#B5C7DB]/5 to-transparent'
    } else if (hour >= 15 && hour < 18) {
      gradient = 'from-orange-400 via-rose-400 to-purple-400'
      GreetingIcon = CloudMoon
      iconColor = 'text-orange-200'
      bgDecor = 'from-orange-500/10 via-rose-500/5 to-transparent'
    } else {
      gradient = 'from-indigo-500 via-purple-500 to-violet-500'
      GreetingIcon = Moon
      iconColor = 'text-indigo-200'
      bgDecor = 'from-indigo-500/10 via-purple-500/5 to-transparent'
    }
  } else {
    // Archive mode — muted gradient
    gradient = 'from-[#B5C7DB] via-[#9DB1CC] to-[#7E95B3]'
    GreetingIcon = CalendarDays
    iconColor = 'text-[#B5C7DB]'
    bgDecor = 'from-[#9DB1CC]/10 via-[#B5C7DB]/5 to-transparent'
  }

  const todaySettle = dashboard.totals.today
  const todayQty = dashboard.totals.todayQty
  const totalTx = dashboard.totals.totalTransactions
  const wib = getWIBDate()
  const dateStr = wib.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const greeting = (() => {
    if (!isCurrentMonth) return null
    if (hour >= 5 && hour < 11) return 'Selamat Pagi'
    if (hour >= 11 && hour < 15) return 'Selamat Siang'
    if (hour >= 15 && hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  })()

  const archiveTitle = isCurrentMonth ? null : `Arsip: ${monthNames[dashMonth]} ${dashYear}`

  return (
    <div className={"relative overflow-hidden rounded-2xl bg-gradient-to-r " + gradient + " p-[1px]"}>
      {/* Outer glow shimmer */}
      <div className={"absolute inset-0 bg-gradient-to-r " + gradient + " opacity-20 blur-xl pointer-events-none"} />
      <div className="relative rounded-2xl bg-background/80 dark:bg-background/90 backdrop-blur-xl p-4 sm:p-6">
        {/* Background decorative gradient */}
        <div className={"absolute inset-0 bg-gradient-to-br " + bgDecor + " rounded-2xl pointer-events-none"} />
        {/* Decorative sparkle dots */}
        <div className="absolute top-3 right-4 sm:top-4 sm:right-6 pointer-events-none">
          <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400/40 dark:text-amber-500/30 animate-pulse" />
        </div>
        <div className="absolute bottom-3 left-4 sm:bottom-4 sm:left-6 pointer-events-none">
          <motion.div animate={{ opacity: [0.15, 0.35, 0.15], scale: [1, 1.15, 1] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
            <Sparkles className="w-4 h-4 text-[#E6BAA3]/30 dark:text-[#E6BAA3]/20" />
          </motion.div>
        </div>

        <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
          {/* Icon circle */}
          <div className={"shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br " + gradient + " flex items-center justify-center shadow-lg"}>
            <GreetingIcon className={"w-6 h-6 sm:w-7 sm:h-7 " + iconColor + " drop-shadow-md"} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm sm:text-base font-bold text-foreground">
              {greeting ? <>{greeting}! 👋</> : <>{archiveTitle}</>}
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{isCurrentMonth ? dateStr : `Data bulan ${monthNames[dashMonth]} ${dashYear}`}</p>
          </div>
          <div className="flex gap-3 sm:gap-5 shrink-0">
            <div className="text-center">
              <p className="text-lg sm:text-2xl font-extrabold text-foreground tabular-nums">
                <AnimatedCounter value={todaySettle} prefix="Rp" />
              </p>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{isCurrentMonth ? 'Hari Ini' : 'Bulan Ini'}</p>
            </div>
            <div className="text-center">
              <p className="text-lg sm:text-2xl font-extrabold text-foreground tabular-nums">
                <AnimatedCounter value={todayQty} />
              </p>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Items</p>
            </div>
          </div>
        </div>
        {/* Mini footer strip */}
        <div className="relative mt-3 pt-3 border-t border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
            <Receipt className="w-3 h-3" />
            <span>{fmtNum(totalTx)} transaksi total</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${isCurrentMonth ? 'bg-[#E14227] animate-pulse' : 'bg-muted-foreground/40'}`} />
            <span>{isCurrentMonth ? 'Live Data' : 'Arsip'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const DashboardTab = React.memo(function DashboardTab({
  dashboard, dashPeriod, setDashPeriod, dashLoading, isAdmin,
  selectedCrewDetail, setSelectedCrewDetail,
  selectedGroupDetail, setSelectedGroupDetail,
  groupDetailData, groupDetailPeriod, setGroupDetailPeriod, groupDetailLoading,
  fetchDashboard, setActiveTab,
  crewPhotoPreview, setCrewPhotoPreview,
  dashMonth, dashYear, isCurrentMonth, setDashMonth, setDashYear,
}: DashboardTabProps) {
  // Leaderboard view can be 'achievement' (client-side only, doesn't affect API period)
  const [isAchievementView, setIsAchievementView] = useState(false)

  // Derive leaderboardView: achievement when explicitly selected, otherwise follow parent's dashPeriod
  const leaderboardView: 'today' | 'week' | 'month' | 'achievement' = isAchievementView ? 'achievement' : dashPeriod

  // Handle leaderboard view change — only notify parent for API-fetchable periods
  const handleLeaderboardViewChange = (view: 'today' | 'week' | 'month' | 'achievement') => {
    setIsAchievementView(view === 'achievement')
    if (view !== 'achievement') {
      setDashPeriod(view)
    }
  }

  // Compute sorted crew stats based on leaderboard view
  const displayCrewStats = useMemo(() => {
    if (!dashboard) return []
    if (leaderboardView === 'achievement') {
      return [...dashboard.crewStats].sort((a, b) => b.crewMonthlyAchievement - a.crewMonthlyAchievement)
    }
    return dashboard.crewStats
  }, [dashboard, leaderboardView])

  const top3Crews = displayCrewStats.slice(0, 3)

  // Working days in week for daily target calculation
  const workingDaysInWeek = useMemo(() => {
    if (!dashboard) return 1
    return dashboard.dateInfo.weekEnd - dashboard.dateInfo.weekStart + 1
  }, [dashboard])

  const isAchievement = leaderboardView === 'achievement'

  // Helper: get period-appropriate target + achievement % for a crew
  function getPeriodTarget(crew: CrewStat) {
    if (isAchievement) return { value: null, label: '', pct: crew.crewMonthlyAchievement, actual: crew.monthTotal }
    if (leaderboardView === 'today' && workingDaysInWeek > 0) {
      const target = crew.crewCurrentWeekTarget / workingDaysInWeek
      const pct = target > 0 ? Math.min(Math.round((crew.todayTotal / target) * 100), 999) : 0
      return { value: target, label: 'Target harian', pct, actual: crew.todayTotal }
    }
    if (leaderboardView === 'week') {
      const pct = crew.crewWeeklyAchievement
      return { value: crew.crewCurrentWeekTarget, label: 'Target mingguan', pct, actual: crew.weekTotal }
    }
    if (leaderboardView === 'month') {
      const pct = crew.crewMonthlyAchievement
      return { value: crew.crewMonthlyTarget, label: 'Target bulanan', pct, actual: crew.monthTotal }
    }
    return { value: null, label: '', pct: 0, actual: 0 }
  }

  // Color based on achievement percentage
  function getTargetPctColor(pct: number) {
    if (pct >= 100) return 'text-emerald-600 dark:text-emerald-400'
    if (pct >= 70) return 'text-[#B8321E] dark:text-[#F07050]'
    if (pct >= 40) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-500 dark:text-red-400'
  }
  function getTargetBarColor(pct: number) {
    if (pct >= 100) return 'bg-gradient-to-r from-emerald-400 to-emerald-500'
    if (pct >= 70) return 'bg-gradient-to-r from-[#E14227] to-[#F07050]'
    if (pct >= 40) return 'bg-gradient-to-r from-amber-400 to-orange-400'
    return 'bg-gradient-to-r from-red-400 to-rose-500'
  }

  return (
    <TabsContent value="dashboard" className="mt-4 sm:mt-6 pb-24 md:pb-8">
      {/* Loading skeleton — shimmer placeholders for summary cards */}
      {dashLoading && !dashboard && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Welcome card skeleton */}
          <div className="skeleton-shimmer rounded-2xl h-[100px] sm:h-[110px]" />
          {/* Summary cards skeleton grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer rounded-xl h-[100px] sm:h-[108px]" />
            ))}
          </div>
          {/* Leaderboard skeleton */}
          <div className="skeleton-shimmer rounded-xl h-[200px] sm:h-[250px]" />
        </motion.div>
      )}
      <LoadingOverlay loading={dashLoading && !!dashboard} label="Memuat dashboard...">
        {!dashboard && !dashLoading ? (
          <motion.div {...fadeIn} className="text-center py-20">
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#F0D5C5] to-[#E6BAA3] dark:from-[#1A1A1B]/40 dark:to-[#262627]/40 flex items-center justify-center"
            >
              <BarChart3 className="w-10 h-10 text-[#E6BAA3] dark:text-[#E14227]" />
            </motion.div>
            <h3 className="text-base font-bold text-foreground mb-1">Tidak Ada Data Dashboard</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">Dashboard tidak dapat dimuat. Coba refresh halaman.</p>
            <Button size="sm" variant="outline" className="border-[#E6BAA3] text-[#B8321E] hover:bg-[#F0D5C5] dark:border-[#B8321E] dark:text-[#F07050] dark:hover:bg-[#1A1A1B]/30" onClick={fetchDashboard}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
            </Button>
          </motion.div>
        ) : dashboard ? (
        <motion.div {...stagger} className="space-y-6">
          {/* ─── Selamat Datang Welcome Card ─── */}
          <motion.div initial={{ opacity: 0, y: -30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <WelcomeCard dashboard={dashboard} isCurrentMonth={isCurrentMonth} dashMonth={dashMonth} dashYear={dashYear} />
          </motion.div>

          {/* ─── Month / Year Filter ─── */}
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => {
                const m = dashMonth === 0 ? 11 : dashMonth - 1
                const y = dashMonth === 0 ? dashYear - 1 : dashYear
                setDashMonth(m)
                setDashYear(y)
              }}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2 min-w-[180px] justify-center">
                <span className="text-sm sm:text-base font-bold text-foreground">{monthNames[dashMonth]}</span>
                <span className="text-sm sm:text-base font-bold text-muted-foreground">{dashYear}</span>
                {!isCurrentMonth && (
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 font-medium bg-[#F0D5C5] text-[#B8321E] dark:bg-[#1A1A1B]/60 dark:text-[#F07050] border-0">Arsip</Badge>
                )}
              </div>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => {
                const m = dashMonth === 11 ? 0 : dashMonth + 1
                const y = dashMonth === 11 ? dashYear + 1 : dashYear
                setDashMonth(m)
                setDashYear(y)
              }}>
                <ChevronRight className="w-4 h-4" />
              </Button>
              {!isCurrentMonth && (
                <Button variant="outline" size="sm" className="h-8 ml-1 text-[11px] font-medium" onClick={() => {
                  const now = getWIBDate()
                  setDashMonth(now.getMonth())
                  setDashYear(now.getFullYear())
                }}>
                  <CalendarDays className="w-3 h-3 mr-1" />
                  Bulan Ini
                </Button>
              )}
            </div>
          </motion.div>

          {/* Summary Cards — Total Import Summary (ALL imported data from Excel) */}
          <div className={`grid gap-2.5 sm:gap-3 ${isCurrentMonth ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
            {/* Total Data Import */}
            <motion.div {...fadeIn} transition={{ delay: 0.05 }} whileHover={{ y: -2, transition: { type: 'spring', stiffness: 300 } }}>
              <Card className="relative overflow-hidden border-0 shadow-lg group cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-[#9DB1CC] to-[#7E95B3] opacity-[0.04] group-hover:opacity-[0.08] transition-opacity" />
                <CardContent className="p-3 sm:p-4 relative">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Total Data Import</p>
                      <p className="text-base sm:text-xl font-bold tracking-tight">
                        <AnimatedCounter value={dashboard.totals.totalTransactions} />
                      </p>
                      <p className="text-[10px] text-muted-foreground">{fmtNum(dashboard.totals.totalQty)} items • {fmtRp(dashboard.totals.totalSettle)}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#9DB1CC] to-[#7E95B3] shadow-lg shadow-[#9DB1CC]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Package className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  {/* Claimed vs Unclaimed bar */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-[#E14227] rounded-full transition-all" style={{ width: dashboard.totals.totalTransactions > 0 ? `${((dashboard.claimedCount || 0) / (dashboard.claimedCount + dashboard.unclaimedCount)) * 100}%` : '0%' }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">{dashboard.claimedCount || 0}/{dashboard.claimedCount + dashboard.unclaimedCount} claimed</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            {/* Import Hari Ini */}
            {isCurrentMonth && (
            <motion.div {...fadeIn} transition={{ delay: 0.1 }} whileHover={{ y: -2, transition: { type: 'spring', stiffness: 300 } }}>
              <Card className="relative overflow-hidden border-0 shadow-lg group cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-[#E14227] to-[#7E95B3] opacity-[0.04] group-hover:opacity-[0.08] transition-opacity" />
                <CardContent className="p-3 sm:p-4 relative">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Import Hari Ini</p>
                        {dashboard.trends.today && dashboard.trends.today.changePercent != null && dashboard.trends.today.direction !== 'same' && (
                          <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full ${dashboard.trends.today.direction === 'up' ? 'bg-[#F0D5C5] text-[#B8321E] dark:bg-[#1A1A1B]/60 dark:text-[#F07050]' : 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'}`}>
                            {dashboard.trends.today.direction === 'up' ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                            {Math.abs(dashboard.trends.today.changePercent)}%
                          </span>
                        )}
                      </div>
                      <p className="text-base sm:text-xl font-bold tracking-tight">
                        <AnimatedCounter value={dashboard.totals.importedToday} prefix="Rp" />
                      </p>
                      <p className="text-[10px] text-muted-foreground">{fmtNum(dashboard.totals.importedTodayQty)} items</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E14227] to-[#7E95B3] shadow-lg shadow-[#E14227]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  {/* Claimed vs Imported breakdown */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-[#E14227] rounded-full transition-all" style={{ width: dashboard.totals.importedToday > 0 ? `${Math.min((dashboard.totals.today / dashboard.totals.importedToday) * 100, 100)}%` : '0%' }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">{fmtRp(dashboard.totals.today)} claimed</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            )}
            {/* Import Minggu Ini */}
            {isCurrentMonth && (
            <motion.div {...fadeIn} transition={{ delay: 0.15 }} whileHover={{ y: -2, transition: { type: 'spring', stiffness: 300 } }}>
              <Card className="relative overflow-hidden border-0 shadow-lg group cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-orange-600 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity" />
                <CardContent className="p-3 sm:p-4 relative">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Import Minggu Ini</p>
                        {dashboard.trends.week && dashboard.trends.week.changePercent != null && dashboard.trends.week.direction !== 'same' && (
                          <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full ${dashboard.trends.week.direction === 'up' ? 'bg-[#F0D5C5] text-[#B8321E] dark:bg-[#1A1A1B]/60 dark:text-[#F07050]' : 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'}`}>
                            {dashboard.trends.week.direction === 'up' ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                            {Math.abs(dashboard.trends.week.changePercent)}%
                          </span>
                        )}
                      </div>
                      <p className="text-base sm:text-xl font-bold tracking-tight">
                        <AnimatedCounter value={dashboard.totals.importedWeek} prefix="Rp" />
                      </p>
                      <p className="text-[10px] text-muted-foreground">{fmtNum(dashboard.totals.importedWeekQty)} items</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <TrendingUp className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  {/* Claimed vs Imported breakdown */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-[#E14227] rounded-full transition-all" style={{ width: dashboard.totals.importedWeek > 0 ? `${Math.min((dashboard.totals.week / dashboard.totals.importedWeek) * 100, 100)}%` : '0%' }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">{fmtRp(dashboard.totals.week)} claimed</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
            )}
            {/* Import Bulan Ini */}
            <motion.div {...fadeIn} transition={{ delay: 0.2 }} whileHover={{ y: -2, transition: { type: 'spring', stiffness: 300 } }}>
              <Card className="relative overflow-hidden border-0 shadow-lg group cursor-default">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-violet-600 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity" />
                <CardContent className="p-3 sm:p-4 relative">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">Import Bulan Ini</p>
                        {dashboard.trends.month && dashboard.trends.month.changePercent != null && dashboard.trends.month.direction !== 'same' && (
                          <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded-full ${dashboard.trends.month.direction === 'up' ? 'bg-[#F0D5C5] text-[#B8321E] dark:bg-[#1A1A1B]/60 dark:text-[#F07050]' : 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'}`}>
                            {dashboard.trends.month.direction === 'up' ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                            {Math.abs(dashboard.trends.month.changePercent)}%
                          </span>
                        )}
                      </div>
                      <p className="text-base sm:text-xl font-bold tracking-tight">
                        <AnimatedCounter value={dashboard.totals.importedMonth} prefix="Rp" />
                      </p>
                      <p className="text-[10px] text-muted-foreground">{fmtNum(dashboard.totals.importedMonthQty)} items</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-lg shadow-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <BarChart3 className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  {/* Claimed vs Imported breakdown */}
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-[#E14227] rounded-full transition-all" style={{ width: dashboard.totals.importedMonth > 0 ? `${Math.min((dashboard.totals.month / dashboard.totals.importedMonth) * 100, 100)}%` : '0%' }} />
                    </div>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">{fmtRp(dashboard.totals.month)} claimed</span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* ─── TikTok Card ─── */}
            <motion.div {...fadeIn} transition={{ delay: 0.18 }}>
              <Card className="relative overflow-hidden border-0 shadow-lg group cursor-default glass-card">
                <div className="absolute inset-0 bg-gradient-to-br from-[#E14227]/5 via-[#D4956B]/3 to-[#B87333]/5 group-hover:from-[#E14227]/8 group-hover:via-[#D4956B]/5 group-hover:to-[#B87333]/8 transition-opacity pointer-events-none" />
                <CardContent className="relative p-4 sm:p-5">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">TikTok Bulan Ini</p>
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-[#E14227]/30 text-[#E14227]">Selesai</Badge>
                      </div>
                      <p className="text-base sm:text-xl font-bold tracking-tight">
                        <AnimatedCounter value={dashboard.totals.tiktokMonth ?? 0} prefix="Rp" />
                      </p>
                      <p className="text-[10px] text-muted-foreground">{fmtNum(dashboard.totals.tiktokMonthQty ?? 0)} items · Minggu: {fmtRp(dashboard.totals.tiktokWeek ?? 0)}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E14227] to-[#D4956B] shadow-lg shadow-[#E14227]/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ShoppingBag className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {isCurrentMonth && dashboard.lastWeekTotals && (
            <motion.div {...fadeIn} transition={{ delay: 0.25 }}>
              <Card className="relative overflow-hidden border-0 shadow-lg group cursor-default glass-card">
                <div className="absolute inset-0 bg-gradient-to-br from-[#E14227]/5 via-[#9DB1CC]/3 to-[#9DB1CC]/5 group-hover:from-[#E14227]/8 group-hover:via-[#9DB1CC]/5 group-hover:to-[#9DB1CC]/8 transition-opacity pointer-events-none" />
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#7E95B3] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                      <ArrowLeftRight className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">Minggu Ini vs Minggu Lalu</CardTitle>
                      <CardDescription className="text-[10px]">Perbandingan performa mingguan</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(() => {
                    const currentSettle = dashboard.totals.week
                    const lastSettle = dashboard.lastWeekTotals.settle
                    const currentQty = dashboard.totals.weekQty
                    const lastQty = dashboard.lastWeekTotals.qty
                    const currentTx = dashboard.totals.week ? (dashboard.crewStats.reduce((s, c) => s + c.weekStruk, 0)) : 0
                    const lastTx = dashboard.lastWeekTotals.transactions

                    const rows = [
                      {
                        label: 'Penjualan (Rp)',
                        current: currentSettle,
                        last: lastSettle,
                        format: (v: number) => fmtRp(v),
                      },
                      {
                        label: 'Items',
                        current: currentQty,
                        last: lastQty,
                        format: (v: number) => fmtNum(v),
                      },
                      {
                        label: 'Transaksi',
                        current: currentTx,
                        last: lastTx,
                        format: (v: number) => fmtNum(v),
                      },
                    ]

                    return rows.map((row) => {
                      const pctChange = row.last > 0
                        ? Math.round(((row.current - row.last) / row.last) * 10000) / 100
                        : row.current > 0 ? 100 : 0
                      const isUp = pctChange > 0
                      const isDown = pctChange < 0
                      const isSame = !isUp && !isDown

                      return (
                        <div key={row.label} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">{row.label}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm sm:text-base font-bold text-foreground tabular-nums">
                                <AnimatedCounter value={row.current} prefix={row.label.includes('Rp') ? 'Rp' : undefined} />
                              </span>
                              <span className="text-[10px] text-muted-foreground">vs</span>
                              <span className="text-xs font-medium text-muted-foreground tabular-nums">{row.format(row.last)}</span>
                            </div>
                          </div>
                          <div className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold ${
                            isSame
                              ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                              : isUp
                                ? 'bg-[#F0D5C5] text-[#B8321E] dark:bg-[#1A1A1B]/60 dark:text-[#F07050]'
                                : 'bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400'
                          }`}>
                            {isSame ? (
                              <Minus className="w-3 h-3" />
                            ) : isUp ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {isSame ? '0%' : `${isUp ? '+' : ''}${pctChange}%`}
                          </div>
                        </div>
                      )
                    })
                  })()}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ─── Data Insights Card ─── */}
          <motion.div {...fadeIn} transition={{ delay: 0.27 }}>
            <Card className="relative overflow-hidden border-0 shadow-lg group cursor-default glass-card">
              <div className="absolute inset-0 bg-gradient-to-br from-[#E14227]/5 via-[#9DB1CC]/3 to-[#9DB1CC]/5 group-hover:from-[#E14227]/8 group-hover:via-[#9DB1CC]/5 group-hover:to-[#9DB1CC]/8 transition-opacity pointer-events-none" />
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#9DB1CC] to-[#7E95B3] flex items-center justify-center shadow-md shadow-[#9DB1CC]/20">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-base leading-tight">Data Insights</CardTitle>
                    <CardDescription className="text-[10px]">Metrik bisnis utama dari data yang diimpor</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {(() => {
                    const { totalTransactions, totalSettle, totalQty } = dashboard.totals
                    const avgBasket = totalTransactions > 0 ? totalQty / totalTransactions : 0
                    const avgPrice = totalQty > 0 ? totalSettle / totalQty : 0
                    const totalClaimed = dashboard.claimedCount || 0
                    const totalUnclaimed = dashboard.unclaimedCount || 0
                    const claimRate = (totalClaimed + totalUnclaimed) > 0 ? (totalClaimed / (totalClaimed + totalUnclaimed)) * 100 : 0
                    const activeDays = new Set(dashboard.recentSales.map(s => s.tanggal)).size || 0

                    const insights = [
                      {
                        icon: ShoppingCart,
                        label: 'Avg. Basket Size',
                        value: avgBasket.toFixed(1),
                        suffix: ' items/tx',
                        color: 'from-[#E14227] to-[#B8321E]',
                        iconBg: 'bg-[#F0D5C5] dark:bg-[#1A1A1B]/60',
                        iconColor: 'text-[#B8321E] dark:text-[#F07050]',
                      },
                      {
                        icon: CircleDollarSign,
                        label: 'Avg. Price Point',
                        value: fmtRp(avgPrice),
                        suffix: '/item',
                        color: 'from-amber-500 to-orange-500',
                        iconBg: 'bg-amber-100 dark:bg-amber-950/60',
                        iconColor: 'text-amber-600 dark:text-amber-400',
                      },
                      {
                        icon: Target,
                        label: 'Claim Rate',
                        value: claimRate.toFixed(1),
                        suffix: '%',
                        color: 'from-[#9DB1CC] to-[#7E95B3]',
                        iconBg: 'bg-[#B5C7DB] dark:bg-[#1A1A1B]/60',
                        iconColor: 'text-[#7E95B3] dark:text-[#B5C7DB]',
                      },
                      {
                        icon: CalendarDays,
                        label: 'Hari Aktif',
                        value: String(activeDays),
                        suffix: ' hari',
                        color: 'from-rose-500 to-pink-600',
                        iconBg: 'bg-rose-100 dark:bg-rose-950/60',
                        iconColor: 'text-rose-600 dark:text-rose-400',
                      },
                    ]

                    return insights.map((item) => (
                      <motion.div
                        key={item.label}
                        whileHover={{ y: -2, transition: { type: 'spring', stiffness: 300 } }}
                        className={`rounded-xl p-3 ${item.iconBg} border border-border/30 transition-shadow hover:shadow-md`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shadow-sm`}>
                            <item.icon className="w-3.5 h-3.5 text-white" />
                          </div>
                          <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">{item.label}</p>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm sm:text-base font-bold text-foreground tabular-nums">
                            {item.label === 'Avg. Basket Size' ? (
                              <>{avgBasket.toFixed(1)}</>
                            ) : item.label === 'Avg. Price Point' ? (
                              <AnimatedCounter value={avgPrice} prefix="Rp" />
                            ) : item.label === 'Claim Rate' ? (
                              <>{claimRate.toFixed(1)}%</>
                            ) : (
                              <AnimatedCounter value={activeDays} />
                            )}
                          </span>
                          {item.label !== 'Claim Rate' && (
                            <span className="text-[9px] sm:text-[10px] text-muted-foreground">{item.suffix}</span>
                          )}
                        </div>
                      </motion.div>
                    ))
                  })()}
                </div>
              </CardContent>
            </Card>
          </motion.div>
          </div>

          {/* Top Crew Leaderboard */}
          <motion.div {...fadeIn} transition={{ delay: 0.3 }}>
            <Card className="border-0 shadow-lg overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20">
                      <Trophy className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">Top Crew Leaderboard</CardTitle>
                      <p className="text-[10px] text-muted-foreground">{isAchievement ? 'Peringkat berdasarkan pencapaian bulanan' : 'Peringkat kru berdasarkan total penjualan'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fetchDashboard()} title="Refresh">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <DashboardExport dashboard={dashboard} dashPeriod={dashPeriod} />
                    <div className="flex gap-1 bg-muted rounded-lg p-1">
                    {(['today', 'week', 'month', 'achievement'] as const).map(p => (
                      <button key={p} onClick={() => handleLeaderboardViewChange(p)}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${leaderboardView === p ? 'bg-white dark:bg-[#262627] shadow text-[#B8321E] dark:text-[#F07050]' : 'text-muted-foreground hover:text-foreground'}`}>
                        {p === 'today' ? 'Hari Ini' : p === 'week' ? 'Minggu' : p === 'month' ? 'Bulan' : 'Achievement'}
                      </button>
                    ))}
                  </div>
                </div>
                </div>
              </CardHeader>
              <CardContent>
                {displayCrewStats.length === 0 ? (
                  <div className="text-center py-12">
                    <motion.div
                      animate={{ y: [0, -8, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-[#F0D5C5] to-[#E6BAA3] dark:from-[#1A1A1B]/40 dark:to-[#1A1A1B]/40 flex items-center justify-center"
                    >
                      <BarChart3 className="w-10 h-10 text-[#E6BAA3] dark:text-[#E14227]" />
                    </motion.div>
                    <h3 className="text-base font-bold text-foreground mb-1">Belum Ada Data Penjualan</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-xs mx-auto">Upload file Excel dan posting penjualan pertama untuk melihat statistik</p>
                    <Button size="sm" variant="outline" className="border-[#E6BAA3] text-[#B8321E] hover:bg-[#F0D5C5] dark:border-[#B8321E] dark:text-[#F07050] dark:hover:bg-[#1A1A1B]/30" onClick={() => setActiveTab('claims')}>
                      <Upload className="w-3.5 h-3.5 mr-1.5" />Upload Penjualan
                    </Button>
                  </div>
                ) : (
                  <>
                  {/* Podium Section */}
                  <div className="relative mb-6">
                    {/* Background glow with vermillion accent + backdrop blur */}
                    <div className="absolute inset-0 bg-gradient-to-b from-[#E6BAA3]/50 via-[#F0D5C5]/30 to-transparent dark:from-[#E6BAA3]/15 dark:via-[#1A1A1B]/15 rounded-xl pointer-events-none backdrop-blur-sm" />

                    {/* Podium base / floor line */}
                    <div className="relative flex items-end justify-center gap-2 sm:gap-4 pt-2 pb-0">
                      {/* ─── 2nd Place ─── */}
                      {top3Crews[1] && (() => {
                        const crew = top3Crews[1]
                        const periodVal = isAchievement ? crew.crewMonthlyAchievement : leaderboardView === 'today' ? crew.todayTotal : leaderboardView === 'week' ? crew.weekTotal : crew.monthTotal
                        const periodQty = isAchievement ? crew.monthTotal : leaderboardView === 'today' ? crew.todayQty : leaderboardView === 'week' ? crew.weekQty : crew.monthQty
                        const { value: targetVal, label: targetLabel, pct: targetPct } = getPeriodTarget(crew)
                        return (
                          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, type: 'spring', stiffness: 180 }}
                            className="flex flex-col items-center flex-1 max-w-[150px]">
                            {/* Avatar + rank badge */}
                            <div className="relative mb-1.5 cursor-pointer" onClick={() => crew.photo && setCrewPhotoPreview({ name: crew.name, photo: crew.photo })}>
                              <Avatar className="w-11 h-11 sm:w-14 sm:h-14 border-2 border-[#B5C7DB] dark:border-[#7E95B3] shadow-md">
                                <AvatarImage src={crew.photo || ''} />
                                <AvatarFallback className="bg-gradient-to-br from-[#B5C7DB] to-[#9DB1CC] dark:from-[#7E95B3] dark:to-[#1A1A1B] text-white font-bold text-xs sm:text-sm">
                                  {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              {/* Rank number badge */}
                              <span className="absolute -top-2.5 -right-2.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-[#B5C7DB] to-[#7E95B3] dark:from-[#9DB1CC] dark:to-[#7E95B3] flex items-center justify-center text-white font-black text-xs sm:text-sm shadow-md border-2 border-white dark:border-[#1A1A1B]">2</span>
                            </div>
                            <p className="text-[11px] sm:text-xs font-semibold text-center max-w-[110px] truncate leading-tight">{crew.name}</p>
                            <p className="text-[10px] text-muted-foreground">{crew.groupName}</p>
                            {!isAchievement && targetVal !== null && (
                              <div className="w-full max-w-[120px] mt-1">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[8px] text-muted-foreground">{targetLabel}</span>
                                  <span className={`text-[9px] font-bold ${getTargetPctColor(targetPct)}`}>{targetPct}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(targetPct, 100)}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${getTargetBarColor(targetPct)}`} />
                                </div>
                                <p className="text-[8px] text-muted-foreground mt-0.5 text-center">{fmtRp(targetVal)}</p>
                              </div>
                            )}
                            <div className="mb-1.5" />
                            {/* Podium platform */}
                            <div className="w-full max-w-[110px] h-28 sm:h-40 rounded-t-xl bg-gradient-to-t from-[#B5C7DB] via-[#B5C7DB] to-[#B5C7DB] dark:from-[#7E95B3] dark:via-[#7E95B3] dark:to-[#9DB1CC] flex flex-col items-center justify-between pt-2.5 pb-2 shadow-lg shadow-[#9DB1CC]/20 dark:shadow-black/30 relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                              {/* Subtle platform bottom shadow */}
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[90%] h-4 bg-[#9DB1CC]/40 dark:bg-black/20 rounded-full blur-md" />
                              {/* Juara label */}
                              <span className="relative z-10 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#7E95B3] dark:text-[#B5C7DB] bg-[#B5C7DB]/70 dark:bg-[#262627]/60 px-2 py-0.5 rounded-full">Juara 2</span>
                              <div className="relative z-10 flex flex-col items-center">
                                <span className="text-[10px] sm:text-xs font-bold text-[#7E95B3] dark:text-[#B5C7DB]">{isAchievement ? `${Math.round(periodVal)}%` : fmtRp(periodVal)}</span>
                                <span className="text-[9px] text-[#7E95B3] dark:text-[#9DB1CC]">{isAchievement ? fmtRp(periodQty) : `${fmtNum(periodQty)} qty`}</span>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })()}

                      {/* ─── 1st Place (center, tallest) ─── */}
                      {top3Crews[0] && (() => {
                        const crew = top3Crews[0]
                        const periodVal = isAchievement ? crew.crewMonthlyAchievement : leaderboardView === 'today' ? crew.todayTotal : leaderboardView === 'week' ? crew.weekTotal : crew.monthTotal
                        const periodQty = isAchievement ? crew.monthTotal : leaderboardView === 'today' ? crew.todayQty : leaderboardView === 'week' ? crew.weekQty : crew.monthQty
                        const { value: targetVal, label: targetLabel, pct: targetPct } = getPeriodTarget(crew)
                        return (
                          <motion.div initial={{ opacity: 0, scale: 0.8, y: 50 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.1, type: 'spring', stiffness: 150, damping: 12 }}
                            className="flex flex-col items-center flex-1 max-w-[170px]">
                            {/* Crown bounce + glow */}
                            <motion.div animate={{ y: [0, -4, 0], scale: [1, 1.05, 1] }} transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }} className="mb-0.5 relative">
                              <div className="absolute inset-0 bg-[#E14227]/30 rounded-full blur-lg" />
                              <span className="relative text-2xl sm:text-3xl drop-shadow-lg">👑</span>
                            </motion.div>
                            {/* Avatar with rank badge */}
                            <div className="relative mb-1.5 cursor-pointer" onClick={() => crew.photo && setCrewPhotoPreview({ name: crew.name, photo: crew.photo })}>
                              <Avatar className="w-14 h-14 sm:w-18 sm:h-18 border-[3px] border-[#E14227] shadow-lg shadow-[#E14227]/30 ring-2 ring-[#E6BAA3]/50 dark:ring-[#B8321E]/30 ring-offset-2 ring-offset-background">
                                <AvatarImage src={crew.photo || ''} />
                                <AvatarFallback className="bg-gradient-to-br from-[#E14227] to-[#B8321E] text-white font-bold text-sm sm:text-base">
                                  {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              {/* Rank number badge – vermillion */}
                              <span className="absolute -top-2.5 -right-2.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-[#F07050] via-[#E14227] to-[#B8321E] flex items-center justify-center text-[#1A1A1B] dark:text-[#F0D5C5] font-black text-sm sm:text-base shadow-lg shadow-[#E14227]/40 border-2 border-[#E6BAA3] dark:border-[#B8321E]">1</span>
                              {/* Enhanced sparkle effect */}
                              <motion.span className="absolute -top-2 -left-2 text-sm" animate={{ opacity: [0, 1, 0], scale: [0.4, 1.3, 0.4], rotate: [0, 90, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>✨</motion.span>
                              <motion.span className="absolute -bottom-1 -right-2 text-xs" animate={{ opacity: [0, 1, 0], scale: [0.5, 1.1, 0.5], rotate: [0, -90, 0] }} transition={{ duration: 1.8, repeat: Infinity, delay: 0.5 }}>✨</motion.span>
                              <motion.span className="absolute -top-0.5 right-0 text-[10px]" animate={{ opacity: [0, 0.8, 0], scale: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, delay: 1 }}>⭐</motion.span>
                            </div>
                            <p className="text-xs sm:text-sm font-bold text-center max-w-[130px] truncate leading-tight text-[#B8321E] dark:text-[#F07050]">{crew.name}</p>
                            <p className="text-[10px] text-muted-foreground">{crew.groupName}</p>
                            {!isAchievement && targetVal !== null && (
                              <div className="w-full max-w-[140px] mt-1">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[8px] text-muted-foreground">{targetLabel}</span>
                                  <span className={`text-[9px] font-bold ${getTargetPctColor(targetPct)}`}>{targetPct}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(targetPct, 100)}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${getTargetBarColor(targetPct)}`} />
                                </div>
                                <p className="text-[8px] text-muted-foreground mt-0.5 text-center">{fmtRp(targetVal)}</p>
                              </div>
                            )}
                            <div className="mb-1.5" />
                            {/* Podium platform – tallest */}
                            <div className="w-full max-w-[130px] h-40 sm:h-56 rounded-t-xl bg-gradient-to-t from-[#B8321E] via-[#E14227] to-[#E6BAA3] dark:from-[#B8321E] dark:via-[#E14227] dark:to-[#F07050] flex flex-col items-center justify-between pt-3 pb-3 shadow-xl shadow-[#E14227]/30 dark:shadow-black/40 relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
                              {/* Pronounced platform bottom shadow */}
                              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-[80%] h-6 bg-[#E14227]/30 dark:bg-[#B8321E]/20 rounded-full blur-lg" />
                              {/* Vermillion-accented Juara 1 label */}
                              <span className="relative z-10 text-[10px] sm:text-xs font-black uppercase tracking-wider text-[#B8321E] dark:text-[#F0D5C5] bg-white/70 dark:bg-[#1A1A1B]/50 px-2.5 py-0.5 rounded-full shadow-sm">Juara 1</span>
                              <div className="relative z-10 flex flex-col items-center">
                                <span className="text-xs sm:text-sm font-bold text-white drop-shadow">{isAchievement ? `${Math.round(periodVal)}%` : fmtRp(periodVal)}</span>
                                <span className="text-[9px] text-[#F0D5C5]">{isAchievement ? fmtRp(periodQty) : `${fmtNum(periodQty)} qty`}</span>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })()}

                      {/* ─── 3rd Place ─── */}
                      {top3Crews[2] && (() => {
                        const crew = top3Crews[2]
                        const periodVal = isAchievement ? crew.crewMonthlyAchievement : leaderboardView === 'today' ? crew.todayTotal : leaderboardView === 'week' ? crew.weekTotal : crew.monthTotal
                        const periodQty = isAchievement ? crew.monthTotal : leaderboardView === 'today' ? crew.todayQty : leaderboardView === 'week' ? crew.weekQty : crew.monthQty
                        const { value: targetVal, label: targetLabel, pct: targetPct } = getPeriodTarget(crew)
                        return (
                          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 180 }}
                            className="flex flex-col items-center flex-1 max-w-[150px]">
                            {/* Avatar + rank badge */}
                            <div className="relative mb-1.5 cursor-pointer" onClick={() => crew.photo && setCrewPhotoPreview({ name: crew.name, photo: crew.photo })}>
                              <Avatar className="w-11 h-11 sm:w-14 sm:h-14 border-2 border-[#E6BAA3] dark:border-[#B8321E] shadow-md">
                                <AvatarImage src={crew.photo || ''} />
                                <AvatarFallback className="bg-gradient-to-br from-[#E6BAA3] to-[#D4956B] dark:from-[#B8321E] dark:to-[#1A1A1B] text-white font-bold text-xs sm:text-sm">
                                  {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              {/* Rank number badge */}
                              <span className="absolute -top-2.5 -right-2.5 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-[#E6BAA3] to-[#D4956B] dark:from-[#B8321E] dark:to-[#E14227] flex items-center justify-center text-white font-black text-xs sm:text-sm shadow-md border-2 border-white dark:border-[#1A1A1B]">3</span>
                            </div>
                            <p className="text-[11px] sm:text-xs font-semibold text-center max-w-[110px] truncate leading-tight">{crew.name}</p>
                            <p className="text-[10px] text-muted-foreground">{crew.groupName}</p>
                            {!isAchievement && targetVal !== null && (
                              <div className="w-full max-w-[120px] mt-1">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className="text-[8px] text-muted-foreground">{targetLabel}</span>
                                  <span className={`text-[9px] font-bold ${getTargetPctColor(targetPct)}`}>{targetPct}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(targetPct, 100)}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${getTargetBarColor(targetPct)}`} />
                                </div>
                                <p className="text-[8px] text-muted-foreground mt-0.5 text-center">{fmtRp(targetVal)}</p>
                              </div>
                            )}
                            <div className="mb-1.5" />
                            {/* Podium platform */}
                            <div className="w-full max-w-[110px] h-20 sm:h-32 rounded-t-xl bg-gradient-to-t from-[#E6BAA3] via-[#F0D5C5] to-[#F0EAD6] dark:from-[#B8321E] dark:via-[#E6BAA3] dark:to-[#E14227] flex flex-col items-center justify-between pt-2.5 pb-2 shadow-lg shadow-[#E6BAA3]/20 dark:shadow-black/30 relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                              {/* Subtle platform bottom shadow */}
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[90%] h-4 bg-[#E6BAA3]/40 dark:bg-black/20 rounded-full blur-md" />
                              {/* Juara label */}
                              <span className="relative z-10 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#B8321E] dark:text-[#F0D5C5] bg-[#F0D5C5]/70 dark:bg-[#1A1A1B]/50 px-2 py-0.5 rounded-full">Juara 3</span>
                              <div className="relative z-10 flex flex-col items-center">
                                <span className="text-[10px] sm:text-xs font-bold text-[#B8321E] dark:text-[#F0D5C5]">{isAchievement ? `${Math.round(periodVal)}%` : fmtRp(periodVal)}</span>
                                <span className="text-[9px] text-[#B8321E] dark:text-[#E6BAA3]">{isAchievement ? fmtRp(periodQty) : `${fmtNum(periodQty)} qty`}</span>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })()}
                    </div>

                    {/* Shared podium floor */}
                    <div className="mx-2 sm:mx-4 h-2 rounded-b-xl bg-gradient-to-r from-[#B5C7DB] via-[#E14227] to-[#E6BAA3] dark:from-[#7E95B3] dark:via-[#E14227] dark:to-[#E6BAA3] opacity-60" />
                  </div>

                  {/* Performance highlight bar for top crew */}
                  {top3Crews[0] && (() => {
                    const topCrew = top3Crews[0]
                    const periodVal = isAchievement ? topCrew.crewMonthlyAchievement : leaderboardView === 'today' ? topCrew.todayTotal : leaderboardView === 'week' ? topCrew.weekTotal : topCrew.monthTotal
                    const totalAllCrews = displayCrewStats.reduce((s, c) => s + (isAchievement ? c.crewMonthlyAchievement : leaderboardView === 'today' ? c.todayTotal : leaderboardView === 'week' ? c.weekTotal : c.monthTotal), 0)
                    const sharePct = totalAllCrews > 0 ? Math.round((periodVal / totalAllCrews) * 100) : 0
                    return (
                      <div className="mb-4 px-4 py-3 rounded-xl bg-gradient-to-r from-[#F0EAD6] to-[#F0D5C5] dark:from-[#1A1A1B]/30 dark:to-[#1A1A1B]/20 border border-[#E6BAA3]/50 dark:border-[#B8321E]/30">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm">🏆</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[#B8321E] dark:text-[#F0D5C5]">
                              <span className="font-bold">{topCrew.name}</span> {isAchievement ? 'memimpin dengan pencapaian' : 'memimpin dengan kontribusi'} <span className="font-bold">{sharePct}%</span> {isAchievement ? 'dari total pencapaian' : 'dari total penjualan'}
                            </p>
                            <div className="mt-1.5 h-2 bg-[#E6BAA3]/50 dark:bg-[#1A1A1B]/30 rounded-full overflow-hidden">
                              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(sharePct, 100)}%` }} transition={{ duration: 1, ease: 'easeOut', delay: 0.5 }}
                                className="h-full bg-gradient-to-r from-[#E14227] to-[#D4956B] rounded-full shadow-sm" />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-[#B8321E] dark:text-[#F07050]">{isAchievement ? `${Math.round(periodVal)}%` : fmtRp(periodVal)}</p>
                            <p className="text-[10px] text-[#B8321E]/70 dark:text-[#E14227]/70">{isAchievement ? `achievement bulanan` : `dari ${fmtRp(totalAllCrews)}`}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  </>
                )}

                {/* Full Ranking Table */}
                {displayCrewStats.length > 0 && (
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Full Ranking</p>
                      <p className="text-[10px] text-muted-foreground">{displayCrewStats.length} crew</p>
                    </div>
                    {/* Mobile Card View */}
                    <div className="md:hidden max-h-80 overflow-y-auto space-y-2 pr-1">
                      {displayCrewStats.map((crew, idx) => {
                        const periodVal = isAchievement ? crew.crewMonthlyAchievement : leaderboardView === 'today' ? crew.todayTotal : leaderboardView === 'week' ? crew.weekTotal : crew.monthTotal
                        const periodQty = isAchievement ? crew.monthTotal : leaderboardView === 'today' ? crew.todayQty : leaderboardView === 'week' ? crew.weekQty : crew.monthQty
                        const maxVal = displayCrewStats[0] ? (isAchievement ? displayCrewStats[0].crewMonthlyAchievement : leaderboardView === 'today' ? displayCrewStats[0].todayTotal : leaderboardView === 'week' ? displayCrewStats[0].weekTotal : displayCrewStats[0].monthTotal) : 1
                        const pct = maxVal > 0 ? Math.round((periodVal / maxVal) * 100) : 0
                        const rankMedal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                        const { value: targetVal, label: targetLabel, pct: targetPct } = getPeriodTarget(crew)
                        const accentColors = ['border-l-[#E14227]', 'border-l-[#9DB1CC]', 'border-l-[#E6BAA3]']
                        return (
                          <motion.div key={crew.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.03 }}
                            className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer border-l-[3px] ${idx < 3 ? accentColors[idx] + ' bg-gradient-to-r from-[#F0EAD6]/60 to-transparent dark:from-[#1A1A1B]/15 border-r-[#E6BAA3]/30 dark:border-r-[#B8321E]/15 border-t-[#E6BAA3]/30 dark:border-t-[#B8321E]/15 border-b-[#E6BAA3]/30 dark:border-b-[#B8321E]/15' : (idx % 2 === 0 ? 'bg-muted/20 dark:bg-muted/10 border-transparent' : 'bg-white dark:bg-[#262627] border-transparent')} hover:shadow-md hover:translate-x-0.5`}
                            onClick={() => setSelectedCrewDetail(crew)}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold">
                                {rankMedal ? <span>{rankMedal}</span> : <span className="text-muted-foreground">{idx + 1}</span>}
                              </div>
                              <Avatar className="w-8 h-8 shrink-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); if (crew.photo) setCrewPhotoPreview({ name: crew.name, photo: crew.photo }) }}>
                                <AvatarImage src={crew.photo || ''} />
                                <AvatarFallback className="text-[10px] bg-gradient-to-br from-[#E6BAA3] to-[#E14227] text-white">
                                  {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate">{crew.name}</p>
                                <p className="text-[10px] text-muted-foreground">{crew.groupName}</p>
                                {!isAchievement && targetVal !== null && (
                                  <div className="mt-0.5">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-[8px] text-muted-foreground">{targetLabel}: {fmtRp(targetVal)}</span>
                                      <span className={`text-[9px] font-bold ${getTargetPctColor(targetPct)}`}>{targetPct}%</span>
                                    </div>
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(targetPct, 100)}%` }} transition={{ duration: 0.8, delay: idx * 0.03 }}
                                        className={`h-full rounded-full ${getTargetBarColor(targetPct)}`} />
                                    </div>
                                  </div>
                                )}
                                {isAchievement && (
                                  <div className="mt-0.5">
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(targetPct, 100)}%` }} transition={{ duration: 0.8, delay: idx * 0.03 }}
                                        className={`h-full rounded-full ${getTargetBarColor(targetPct)}`} />
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="text-right shrink-0 pl-2">
                                <p className={`text-xs font-bold ${idx < 3 ? 'text-[#B8321E] dark:text-[#F07050]' : 'text-[#B2AC88] dark:text-[#B2AC88]'}`}>{isAchievement ? `${Math.round(periodVal)}%` : fmtRp(periodVal)}</p>
                                <p className="text-[10px] text-muted-foreground">{isAchievement ? fmtRp(periodQty) : `${fmtNum(periodQty)} qty`}</p>
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                    {/* Desktop Table View */}
                    <div className="hidden md:block max-h-80 overflow-y-auto">
                      <Table className="table-stripe table-sticky-head">
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-12 text-center">#</TableHead>
                            <TableHead>Crew</TableHead>
                            <TableHead>Group</TableHead>
                            <TableHead className="text-center">{isAchievement ? 'Achievement' : 'Qty'}</TableHead>
                            <TableHead className="w-[220px]">{isAchievement ? 'Achievement' : 'Progress Target'}</TableHead>
                            <TableHead className="text-right">{isAchievement ? 'Pencapaian' : 'Penjualan'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayCrewStats.map((crew, idx) => {
                            const periodVal = isAchievement ? crew.crewMonthlyAchievement : leaderboardView === 'today' ? crew.todayTotal : leaderboardView === 'week' ? crew.weekTotal : crew.monthTotal
                            const periodQty = isAchievement ? crew.monthTotal : leaderboardView === 'today' ? crew.todayQty : leaderboardView === 'week' ? crew.weekQty : crew.monthQty
                            const maxVal = displayCrewStats[0] ? (isAchievement ? displayCrewStats[0].crewMonthlyAchievement : leaderboardView === 'today' ? displayCrewStats[0].todayTotal : leaderboardView === 'week' ? displayCrewStats[0].weekTotal : displayCrewStats[0].monthTotal) : 1
                            const pct = maxVal > 0 ? Math.round((periodVal / maxVal) * 100) : 0
                            const rankMedal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                            const rowBg = idx < 3 ? 'bg-[#F0EAD6]/30 dark:bg-[#1A1A1B]/10' : (idx % 2 === 0 ? 'bg-muted/20 dark:bg-muted/5' : '')
                            const hoverBg = idx < 3 ? 'hover:bg-[#F0D5C5]/40 dark:hover:bg-[#1A1A1B]/20' : 'hover:bg-muted/40 dark:hover:bg-muted/10'
                            const borderAccent = idx === 0 ? 'border-l-[3px] border-l-[#E14227]' : idx === 1 ? 'border-l-[3px] border-l-[#9DB1CC]' : idx === 2 ? 'border-l-[3px] border-l-[#E6BAA3]' : 'border-l-[3px] border-l-transparent'
                            const { value: targetVal, label: targetLabel, pct: targetPct } = getPeriodTarget(crew)
                            return (
                              <TableRow key={crew.id} className={`cursor-pointer transition-all duration-200 ${rowBg} ${hoverBg} ${borderAccent}`} onClick={() => setSelectedCrewDetail(crew)}>
                                <TableCell className="text-center font-bold">
                                  {rankMedal ? <span className="text-base">{rankMedal}</span> : <span className="text-muted-foreground">{idx + 1}</span>}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2.5">
                                    <Avatar className={`w-8 h-8 ${idx === 0 ? 'ring-1 ring-[#E14227]' : ''} cursor-pointer`} onClick={(e) => { e.stopPropagation(); if (crew.photo) setCrewPhotoPreview({ name: crew.name, photo: crew.photo }) }}>
                                      <AvatarImage src={crew.photo || ''} />
                                      <AvatarFallback className="text-xs bg-gradient-to-br from-[#E6BAA3] to-[#E14227] text-white">
                                        {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-medium text-sm leading-tight">{crew.name}</p>
                                      <p className="text-[10px] text-muted-foreground">{crew.employeeId}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-[10px] font-normal">{crew.groupName}</Badge>
                                </TableCell>
                                <TableCell className="text-center text-sm tabular-nums">{isAchievement ? `${Math.round(periodQty)}%` : fmtNum(periodQty)}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(targetPct, 100)}%` }} transition={{ duration: 0.8, delay: idx * 0.03 }}
                                          className={`h-full rounded-full ${getTargetBarColor(targetPct)}`} />
                                      </div>
                                      <span className={`text-[10px] font-bold tabular-nums w-10 text-right ${getTargetPctColor(targetPct)}`}>{targetPct}%</span>
                                    </div>
                                    {!isAchievement && targetVal !== null && (
                                      <p className="text-[9px] text-muted-foreground">{targetLabel}: {fmtRp(targetVal)}</p>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className={`font-semibold tabular-nums ${idx < 3 ? 'text-[#B8321E] dark:text-[#F07050]' : ''}`}>{isAchievement ? `${Math.round(periodVal)}%` : fmtRp(periodVal)}</span>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Group Achievement Cards */}
          <motion.div {...fadeIn} transition={{ delay: 0.4 }}>
            <Card className="border-0 shadow-lg bg-gradient-to-br from-white via-[#F0D5C5]/30 to-[#B5C7DB]/20 dark:from-[#1A1A1B] dark:via-[#1A1A1B]/20 dark:to-[#1A1A1B]/10">
              <CardHeader className="pb-2 sm:pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                    <Target className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm sm:text-base truncate">Group & Zoning Performance</CardTitle>
                    <p className="text-[10px] text-muted-foreground truncate">Minggu {dashboard.dateInfo.currentWeek} ({dashboard.dateInfo.weekStart}–{dashboard.dateInfo.weekEnd} {monthNames[dashboard.dateInfo.currentMonth]} {dashboard.dateInfo.currentYear})</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {dashboard.groupAchievements.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">Belum ada group</p>
                ) : (
                  <>
                    {/* Mobile: Compact list rows */}
                    <div className="md:hidden space-y-2">
                      {dashboard.groupAchievements.map((g) => (
                        <motion.div key={g.id} whileTap={{ scale: 0.98 }}>
                          <button
                            type="button"
                            onClick={() => { setSelectedGroupDetail(g); setGroupDetailPeriod('daily') }}
                            className="w-full text-left bg-white/80 dark:bg-[#262627]/80 backdrop-blur-sm rounded-xl p-3 shadow-sm active:scale-[0.98] transition-all duration-200 hover:shadow-md"
                          >
                            <div className="flex items-center gap-2.5">
                              {/* Avatar + Mini ring */}
                              <div className="relative shrink-0">
                                <Avatar className="w-10 h-10 border border-[#E6BAA3]/60 dark:border-[#B8321E]/40">
                                  <AvatarImage src={g.logo || ''} />
                                  <AvatarFallback className="bg-gradient-to-br from-[#E6BAA3] to-[#9DB1CC] text-white font-bold text-[10px]">{g.name.split(' ').slice(-1)[0][0]}</AvatarFallback>
                                </Avatar>
                                <div className="absolute -inset-0.5">
                                  <CircularProgress value={g.monthlyAchievement} size={44} strokeWidth={2.5} showLabel={false} />
                                </div>
                              </div>
                              {/* Name + stats */}
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <p className="text-xs font-bold truncate">{g.name}</p>
                                  <AchievementBadge pct={g.monthlyAchievement} />
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                  <span><Users className="w-2.5 h-2.5 inline mr-0.5" />{g.crewCount}</span>
                                  <span className="truncate font-semibold text-foreground">{fmtRp(g.monthlyTotal)}</span>
                                </div>
                                {/* All weekly progress bars (up to 5 weeks) */}
                                <div className="grid grid-cols-5 gap-1.5">
                                  {g.weeklyDetails?.map((wd) => (
                                    <div key={wd.week} className="text-center">
                                      <div className="h-1.5 bg-muted/80 rounded-full overflow-hidden mb-0.5">
                                        <div
                                          className={`h-full rounded-full transition-all duration-700 ${wd.week === g.currentWeek ? 'bg-gradient-to-r from-[#E14227] to-[#D4956B]' : wd.achievement >= 100 ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`}
                                          style={{ width: `${Math.min(wd.achievement, 100)}%` }}
                                        />
                                      </div>
                                      <span className={`text-[8px] font-semibold tabular-nums ${wd.week === g.currentWeek ? 'text-[#E14227]' : 'text-muted-foreground'}`}>
                                        W{wd.week}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </button>
                        </motion.div>
                      ))}
                    </div>
                    {/* Tablet: 2-col grid */}
                    <div className="hidden md:grid lg:hidden md:grid-cols-2 gap-3">
                      {dashboard.groupAchievements.map((g) => (
                        <motion.div key={g.id} whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300 } }} whileTap={{ scale: 0.98 }}>
                          <Card
                            className="border-0 shadow-md bg-white/70 dark:bg-[#262627]/70 backdrop-blur-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#E14227]/50 dark:hover:ring-[#B8321E]/40 hover:shadow-xl transition-all duration-300"
                            onClick={() => { setSelectedGroupDetail(g); setGroupDetailPeriod('daily') }}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3 mb-3">
                                <div className="relative shrink-0">
                                  <Avatar className="w-10 h-10 border-2 border-[#E6BAA3] dark:border-[#B8321E]">
                                    <AvatarImage src={g.logo || ''} />
                                    <AvatarFallback className="bg-gradient-to-br from-[#E6BAA3] to-[#9DB1CC] text-white font-bold text-xs">
                                      {g.name.split(' ').slice(-1)[0][0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="absolute -inset-1">
                                    <CircularProgress value={g.monthlyAchievement} size={52} strokeWidth={3} showLabel={false} />
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-1">
                                    <p className="text-xs font-bold truncate">{g.name}</p>
                                    <AchievementBadge pct={g.monthlyAchievement} />
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5"><Users className="w-2.5 h-2.5 inline mr-0.5" />{g.crewCount} crew</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 mb-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Bulanan</p>
                                  <p className="text-sm font-bold truncate">{fmtRp(g.monthlyTotal)}</p>
                                  <p className="text-[10px] text-muted-foreground">Target: {fmtRp(g.monthlyTarget)}</p>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                {g.weeklyDetails?.map((wd) => (
                                  <div key={wd.week} className="space-y-0.5">
                                    <div className="flex justify-between items-center">
                                      <p className={`text-[10px] ${wd.week === g.currentWeek ? 'font-semibold text-[#E14227]' : 'text-muted-foreground'}`}>
                                        W{wd.week} ({wd.targetPct}%) tgl {wd.dateFrom}-{wd.dateTo}
                                      </p>
                                      <p className={`text-[10px] font-semibold ${wd.achievement >= 100 ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                                        {wd.achievement}%
                                      </p>
                                    </div>
                                    <Progress
                                      value={Math.min(wd.achievement, 100)}
                                      className={`h-1.5 ${wd.week === g.currentWeek ? '[&>div]:bg-gradient-to-r [&>div]:from-[#E14227] [&>div]:to-[#D4956B]' : ''}`}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-center gap-1 text-[10px] text-muted-foreground opacity-60">
                                <Eye className="w-3 h-3" />
                                <span>Lihat Detail</span>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                    {/* Desktop: 3-col grid with full cards */}
                    <div className="hidden lg:grid lg:grid-cols-2 gap-4">
                      {dashboard.groupAchievements.map((g) => (
                        <motion.div key={g.id} whileHover={{ y: -6, transition: { type: 'spring', stiffness: 300 } }} whileTap={{ scale: 0.98 }}>
                          <Card
                            className="border-0 shadow-md bg-white/70 dark:bg-[#262627]/70 backdrop-blur-md overflow-hidden cursor-pointer hover:ring-2 hover:ring-[#E14227]/50 dark:hover:ring-[#B8321E]/40 hover:shadow-xl transition-all duration-300"
                            onClick={() => { setSelectedGroupDetail(g); setGroupDetailPeriod('daily') }}
                          >
                            <CardContent className="p-5">
                              <div className="flex items-center gap-3 mb-4">
                                <Avatar className="w-12 h-12 border-2 border-[#E6BAA3] dark:border-[#B8321E]">
                                  <AvatarImage src={g.logo || ''} />
                                  <AvatarFallback className="bg-gradient-to-br from-[#E6BAA3] to-[#9DB1CC] text-white font-bold text-sm">
                                    {g.name.split(' ').slice(-1)[0][0]}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-bold text-sm">{g.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-[10px]"><Users className="w-3 h-3 mr-1" />{g.crewCount} crew</Badge>
                                    <AchievementBadge pct={g.monthlyAchievement} />
                                  </div>
                                </div>
                              </div>
                              {/* Monthly Achievement */}
                              <div className="flex items-center gap-4 mb-4">
                                <CircularProgress value={g.monthlyAchievement} size={72} strokeWidth={6} />
                                <div className="flex-1 space-y-2">
                                  <div>
                                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Bulanan</p>
                                    <p className="text-sm font-bold">{fmtRp(g.monthlyTotal)}</p>
                                    <p className="text-xs text-muted-foreground">Target: {fmtRp(g.monthlyTarget)}</p>
                                  </div>
                                </div>
                              </div>
                              {/* All Weekly Achievements (up to 5 weeks) */}
                              <div className="space-y-2">
                                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Achievement per Minggu</p>
                                {g.weeklyDetails?.map((wd) => (
                                  <div key={wd.week} className="space-y-0.5">
                                    <div className="flex justify-between items-center">
                                      <p className={`text-[10px] ${wd.week === g.currentWeek ? 'font-semibold text-[#E14227] dark:text-[#F07050]' : 'text-muted-foreground'}`}>
                                        Minggu {wd.week} ({wd.targetPct}%) · tgl {wd.dateFrom}-{wd.dateTo}
                                        {wd.week === g.currentWeek && <span className="ml-1 text-[8px] bg-[#E14227]/10 text-[#E14227] px-1 py-0.5 rounded">Sekarang</span>}
                                      </p>
                                      <p className={`text-[10px] font-semibold tabular-nums ${wd.achievement >= 100 ? 'text-emerald-600 dark:text-emerald-400' : wd.week === g.currentWeek ? 'text-[#E14227] dark:text-[#F07050]' : ''}`}>
                                        {wd.achievement}%
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Progress
                                        value={Math.min(wd.achievement, 100)}
                                        className={`h-2 flex-1 ${wd.week === g.currentWeek ? '[&>div]:bg-gradient-to-r [&>div]:from-[#E14227] [&>div]:to-[#D4956B]' : wd.achievement >= 100 ? '[&>div]:bg-emerald-400' : ''}`}
                                      />
                                    </div>
                                    <p className="text-[9px] text-muted-foreground tabular-nums">
                                      {fmtRp(wd.total)} / {fmtRp(wd.target)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                              {/* Monthly progress bar */}
                              <div className="mt-2">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Progress Bulanan</span>
                                  <span className="text-xs font-bold tabular-nums">{Math.round(g.monthlyAchievement)}%</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <motion.div initial={{ width: 0 }} animate={{ width: Math.min(g.monthlyAchievement, 100) + '%' }} transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                                    className="h-full rounded-full bg-gradient-to-r from-[#E6BAA3] to-[#9DB1CC] shadow-sm" />
                                </div>
                              </div>
                              {/* Click hint */}
                              <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-center gap-1 text-[10px] text-muted-foreground opacity-60">
                                <Eye className="w-3 h-3" />
                                <span>Lihat Detail Crew</span>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Sales Chart + Recent Activity — 2 columns on desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Sales Chart */}
            <motion.div {...fadeIn} transition={{ delay: 0.5 }}>
              <Card className="border-0 shadow-lg overflow-hidden h-full">
                <CardHeader className="pb-2 sm:pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#E14227]" />
                    <CardTitle className="text-sm sm:text-base">{isAchievement ? 'Achievement per Crew' : 'Penjualan per Crew'}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {displayCrewStats.length > 0 ? (
                    <div className="h-48 sm:h-56 min-h-[192px]">
                      <ResponsiveContainer width="100%" height="100%" minHeight={192}>
                        <BarChart data={displayCrewStats.map(c => ({
                          name: c.name.split(' ')[0],
                          value: isAchievement ? Math.round(c.crewMonthlyAchievement * 10) / 10 : leaderboardView === 'today' ? c.todayTotal : leaderboardView === 'week' ? c.weekTotal : c.monthTotal,
                          qty: isAchievement ? c.monthTotal : leaderboardView === 'today' ? c.todayQty : leaderboardView === 'week' ? c.weekQty : c.monthQty,
                        }))} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={40} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => isAchievement ? `${v}%` : v >= 1000000 ? `${(v / 1000000).toFixed(0)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : String(v)} />
                          <Tooltip formatter={(value) => isAchievement ? `${Number(value)}%` : fmtRp(Number(value))} labelStyle={{ fontWeight: 600 }} contentStyle={{ borderRadius: 12, border: '1px solid #F0EAD6', fontSize: 12 }} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36}>
                            {displayCrewStats.map((_, idx) => (
                              <Cell key={idx} fill={idx === 0 ? '#E14227' : idx === 1 ? '#9DB1CC' : idx === 2 ? '#B2AC88' : idx === 3 ? '#E6BAA3' : '#D4956B'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground text-sm">Belum ada data</p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Recent Activity */}
            <motion.div {...fadeIn} transition={{ delay: 0.6 }}>
              <Card className="border-0 shadow-lg h-full flex flex-col">
                <CardHeader className="pb-2 sm:pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                        <Clock className="w-4 h-4 text-white" />
                      </div>
                      <CardTitle className="text-sm sm:text-base">Recent Activity</CardTitle>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{Math.min(dashboard.recentSales.length, 5)} sales</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col min-h-0">
                  {dashboard.recentSales.length === 0 ? (
                    <div className="text-center py-8">
                      <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        className="inline-block"
                      >
                        <Clock className="w-10 h-10 mx-auto mb-2 text-muted-foreground/20" />
                      </motion.div>
                      <p className="text-sm text-muted-foreground">Belum ada aktivitas terbaru</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto max-h-[400px]">
                      {dashboard.recentSales.slice(0, 5).map((sale, i) => {
                        const isLast = i === Math.min(dashboard.recentSales.length, 5) - 1
                        return (
                        <motion.div key={sale.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                          className={"flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl transition-all duration-200 hover:bg-muted/60" + (isLast ? "" : " border-b border-border/15")}>
                        <Avatar className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 ring-1 ring-border/50">
                          <AvatarImage src={sale.crew?.photo || ''} />
                          <AvatarFallback className="text-[10px] sm:text-xs bg-gradient-to-br from-[#E6BAA3] to-[#9DB1CC] text-white">{(sale.crew?.name || '?')[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold truncate">{sale.crew?.name || 'Unknown'}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-mono h-4">{sale.kodeExtend}</Badge>
                            <span className="text-[10px] text-muted-foreground">{timeAgo(sale.tanggal)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs sm:text-sm font-bold text-[#B8321E] dark:text-[#F07050] tabular-nums">{fmtRp(sale.settle)}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtNum(sale.qty)} qty</p>
                        </div>
                      </motion.div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      ) : null}
      </LoadingOverlay>

      {/* ─── Crew Photo Preview Modal ─── */}
      <AnimatePresence>
        {crewPhotoPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setCrewPhotoPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative flex flex-col items-center gap-4 p-6 rounded-2xl bg-white dark:bg-[#262627] shadow-2xl border border-border/50"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setCrewPhotoPreview(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <Avatar className="w-28 h-28 sm:w-36 sm:h-36 border-4 border-[#E6BAA3] dark:border-[#B8321E] shadow-xl shadow-[#E14227]/20">
                <AvatarImage src={crewPhotoPreview.photo} className="object-cover" />
                <AvatarFallback className="text-2xl bg-gradient-to-br from-[#E6BAA3] to-[#E14227] text-white font-bold">
                  {crewPhotoPreview.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <p className="text-base font-bold text-foreground">{crewPhotoPreview.name}</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </TabsContent>
  )
})

export default DashboardTab
