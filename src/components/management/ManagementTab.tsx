'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts'
import { toast } from 'sonner'
import { Shield, Users, Target, DollarSign, Plus, Trash2, Edit2, Search, X, BarChart3, Download, Upload, Database, Loader2, CheckCircle2, Lock, ArrowUpDown, Sparkles, FileJson, CalendarDays, UserPlus, FolderOpen, FileSpreadsheet, Settings, Zap, Clock, RefreshCw, FileBarChart } from 'lucide-react'
import { fmtRp, fmtNum, fadeIn, stagger, safeFetch, getWIBDate, timeAgo } from '@/lib/cms-utils'
import type { Group, Crew } from '@/lib/cms-types'
import CrewForm from '@/components/management/CrewForm'
import GroupForm from '@/components/management/GroupForm'
import ActivityLogPanel from '@/components/management/ActivityLogPanel'
import ManagementReport from '@/components/management/ManagementReport'
import SettingsPanel from '@/components/management/SettingsPanel'
import LoadingOverlay from '@/components/ui/LoadingOverlay'

// ─── Lightweight CountUp Component ───────────────────────
function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let start = 0
    const end = Math.abs(value)
    const duration = 1000
    const stepTime = 16
    const steps = duration / stepTime
    const increment = end / steps
    const timer = setInterval(() => {
      start += increment
      if (start >= end) {
        setDisplay(end)
        clearInterval(timer)
      } else {
        setDisplay(Math.floor(start))
      }
    }, stepTime)
    return () => clearInterval(timer)
  }, [value])
  const formatted = format ? format(display) : fmtNum(display)
  return <span className="tabular-nums">{formatted}</span>
}

// ─── Helper: Get current week of month ───────────────────
function getCurrentWeek(): number {
  const day = getWIBDate().getDate()
  if (day <= 7) return 1
  if (day <= 14) return 2
  if (day <= 21) return 3
  return 4
}

// ─── Helper: Group color palette ─────────────────────────
const groupColors = [
  'from-[#E14227] to-[#D4956B]',
  'from-[#9DB1CC] to-[#7E95B3]',
  'from-[#B2AC88] to-[#8F8B6E]',
  'from-[#E6BAA3] to-[#D4956B]',
  'from-[#D4956B] to-[#B8321E]',
  'from-[#8F8B6E] to-[#6E6B50]',
]
function getGroupGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return groupColors[Math.abs(hash) % groupColors.length]
}

// ─── Top-3 Rank Accent Colors ────────────────────────────
function getRankAccentColor(index: number): string {
  if (index === 0) return 'border-l-[#E14227]'
  if (index === 1) return 'border-l-[#9DB1CC]'
  if (index === 2) return 'border-l-[#E6BAA3]'
  return ''
}

// ─── Department color helper (based on group name) ───────
const deptAccents = [
  { border: 'border-l-[#E14227]', bg: 'bg-[#E14227]/10 dark:bg-[#E14227]/20', pill: 'from-[#E14227] to-[#D4956B]' },
  { border: 'border-l-[#E6BAA3]', bg: 'bg-[#E6BAA3]/20 dark:bg-[#E6BAA3]/10', pill: 'from-[#E6BAA3] to-[#D4956B]' },
  { border: 'border-l-[#B2AC88]', bg: 'bg-[#B2AC88]/20 dark:bg-[#B2AC88]/10', pill: 'from-[#B2AC88] to-[#8F8B6E]' },
  { border: 'border-l-[#9DB1CC]', bg: 'bg-[#9DB1CC]/20 dark:bg-[#9DB1CC]/10', pill: 'from-[#9DB1CC] to-[#7E95B3]' },
  { border: 'border-l-[#D4956B]', bg: 'bg-[#D4956B]/20 dark:bg-[#D4956B]/10', pill: 'from-[#D4956B] to-[#B8321E]' },
  { border: 'border-l-[#8F8B6E]', bg: 'bg-[#8F8B6E]/20 dark:bg-[#8F8B6E]/10', pill: 'from-[#8F8B6E] to-[#6E6B50]' },
]
function getDeptStyle(groupName: string) {
  if (!groupName) return { border: 'border-l-gray-300', bg: '', pill: 'from-gray-500 to-gray-400' }
  let hash = 0
  for (let i = 0; i < groupName.length; i++) hash = groupName.charCodeAt(i) + ((hash << 5) - hash)
  return deptAccents[Math.abs(hash) % deptAccents.length]
}

// ─── Custom Tooltip for Chart ────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card px-3 py-2 rounded-lg shadow-xl border border-white/30 dark:border-white/10">
      <p className="text-xs font-semibold text-foreground mb-0.5">{label}</p>
      <p className="text-xs font-bold text-[#E14227]">{fmtRp(payload[0].value)}</p>
    </div>
  )
}

// ─── Activity Icon Helper ──────────────────────────────
function getActivityIcon(action: string) {
  const a = action.toLowerCase()
  if (a.includes('claim') || a.includes('unclaim')) return Zap
  if (a.includes('login')) return Shield
  if (a.includes('crew') || a.includes('add_crew') || a.includes('update_crew')) return UserPlus
  if (a.includes('group') || a.includes('add_group') || a.includes('update_group')) return Target
  if (a.includes('upload') || a.includes('import')) return Upload
  if (a.includes('delete') || a.includes('hapus')) return Trash2
  return Clock
}

function getActivityAccent(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('claim')) return 'border-l-[#E14227]'
  if (a.includes('login')) return 'border-l-[#9DB1CC]'
  if (a.includes('crew')) return 'border-l-[#D4956B]'
  if (a.includes('group')) return 'border-l-[#E6BAA3]'
  if (a.includes('upload') || a.includes('import')) return 'border-l-[#7E95B3]'
  if (a.includes('delete') || a.includes('hapus')) return 'border-l-[#B8321E]'
  return 'border-l-gray-400 dark:border-l-gray-400'
}

function getActivityBg(action: string): string {
  const a = action.toLowerCase()
  if (a.includes('claim')) return 'bg-[#E14227]'
  if (a.includes('login')) return 'bg-[#9DB1CC]'
  if (a.includes('crew')) return 'bg-[#D4956B]'
  if (a.includes('group')) return 'bg-[#E6BAA3]'
  if (a.includes('upload') || a.includes('import')) return 'bg-[#7E95B3]'
  if (a.includes('delete') || a.includes('hapus')) return 'bg-[#B8321E]'
  return 'bg-gray-500'
}

interface ManagementTabProps {
  isAdmin: boolean
  mgmtLoading: boolean
  loginForm: { username: string; password: string }
  setLoginForm: (f: { username: string; password: string }) => void
  handleLogin: () => void
  groups: Group[]
  mgmtCrews: Crew[]
  mgmtSearch: string
  setMgmtSearch: (v: string) => void
  showAddCrew: boolean
  setShowAddCrew: (v: boolean) => void
  showAddGroup: boolean
  setShowAddGroup: (v: boolean) => void
  editCrew: Crew | null
  setEditCrew: (c: Crew | null) => void
  editGroup: Group | null
  setEditGroup: (g: Group | null) => void
  filteredMgmtCrews: Crew[]
  filteredGroups: Group[]
  handleSaveCrew: (data: { name: string; photo: string; employeeId: string; groupId: string; removePhoto?: boolean }) => void
  handleDeleteCrew: (id: string) => void
  handleSaveGroup: (data: { name: string; logo: string; monthlyTarget: number; week1Target: number; week2Target: number; week3Target: number; week4Target: number; week5Target: number; tiktokActive: boolean }) => void
  handleDeleteGroup: (id: string) => void
  setDeleteConfirm: (v: { type: 'crew' | 'group' | 'sale' | 'batch-sale'; ids?: string[]; id?: string; name: string } | null) => void
  onImportSuccess?: () => void
  adminName: string
  onPasswordChanged: () => void
  onDataCleared: () => void
}

const ManagementTab = React.memo(function ManagementTab({
  isAdmin, mgmtLoading, loginForm, setLoginForm, handleLogin,
  groups, mgmtCrews, mgmtSearch, setMgmtSearch,
  showAddCrew, setShowAddCrew, showAddGroup, setShowAddGroup,
  editCrew, setEditCrew, editGroup, setEditGroup,
  filteredMgmtCrews, filteredGroups,
  handleSaveCrew, handleDeleteCrew, handleSaveGroup, handleDeleteGroup,
  setDeleteConfirm, onImportSuccess,
  adminName, onPasswordChanged, onDataCleared,
}: ManagementTabProps) {
  const currentWeek = getCurrentWeek()

  // ── Recent Activity State ──
  const [recentActivity, setRecentActivity] = useState<Array<{ action: string; description: string; crewName: string | null; adminName: string; createdAt: string }>>([])
  const [activityLoading, setActivityLoading] = useState(false)

  // Fetch recent activity on mount when admin
  const fetchRecentActivity = React.useCallback(async () => {
    setActivityLoading(true)
    try {
      const res = await fetch('/api/activity-log?limit=5')
      if (res.ok) {
        const data = await res.json()
        setRecentActivity(Array.isArray(data) ? data.slice(0, 5) : [])
      }
    } catch {
      // Silent fail for activity log
    } finally {
      setActivityLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) fetchRecentActivity()
  }, [isAdmin, fetchRecentActivity])

  // Memoized sorted crew data for chart (BUGFIX: avoid mutating prop array)
  const sortedCrewsForChart = useMemo(() =>
    [...mgmtCrews].sort((a, b) => b.totalSales - a.totalSales),
    [mgmtCrews]
  )

  // Memoized chart data derived from sorted crews
  const chartData = useMemo(() =>
    sortedCrewsForChart.map(c => ({ name: c.name.split(' ')[0], sales: c.totalSales, group: c.group?.name })),
    [sortedCrewsForChart]
  )

  return (
    <TabsContent value="management" className="mt-4 sm:mt-6 pb-24 md:pb-8">
      {!isAdmin ? (
        /* ═══════════════════════════════════════════════════
           ADMIN LOGIN SECTION
           ═══════════════════════════════════════════════════ */
        <motion.div {...fadeIn} className="max-w-md mx-auto px-4">
          <div className="login-gradient-border">
            <Card className="border-0 shadow-2xl overflow-hidden">
              {/* Animated gradient header with dot pattern */}
              <div className="login-dot-overlay bg-gradient-to-br from-[#E14227] via-[#B8321E] to-[#7E95B3] p-8 text-center relative">
                {/* Decorative floating orbs */}
                <div className="absolute top-3 left-4 w-8 h-8 rounded-full bg-white/10 blur-sm animate-float-icon-1" />
                <div className="absolute top-6 right-6 w-5 h-5 rounded-full bg-white/8 blur-sm animate-float-icon-2" />
                <div className="absolute bottom-4 left-1/2 w-6 h-6 rounded-full bg-white/6 blur-sm animate-float-icon-3" />
                <motion.div
                  className="w-20 h-20 mx-auto rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center mb-4 shadow-lg shadow-[#B8321E]/30"
                  animate={{ y: [0, -6, 0], rotate: [0, -2, 2, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Lock className="w-10 h-10 text-white animate-lock-bob" />
                </motion.div>
                <motion.h2
                  className="text-2xl font-bold text-white"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  Admin Login
                </motion.h2>
                <motion.p
                  className="text-[#E6BAA3] text-sm mt-1.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  Masuk untuk mengelola crew dan group
                </motion.p>
              </div>
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Username</Label>
                  <Input id="username" placeholder="admin" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
                  <Input id="password" type="password" placeholder="••••••" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()} className="h-11" />
                </div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button onClick={handleLogin} className="w-full h-11 bg-gradient-to-r from-[#E14227] to-[#B8321E] hover:from-[#B8321E] hover:to-[#8F8B6E] text-white shadow-lg shadow-[#E14227]/25 font-semibold text-sm transition-all duration-200">
                    <Shield className="w-4 h-4 mr-2" />Masuk
                  </Button>
                </motion.div>
                <p className="text-[10px] text-center text-muted-foreground pt-1">Hubungi admin untuk akses</p>
              </CardContent>
              {/* Powered by footer */}
              <div className="px-6 pb-4 pt-0">
                <div className="border-t border-dashed border-border/50 pt-3 flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#E14227]" />
                  <span className="text-[10px] text-muted-foreground font-medium">Powered by 3SC CMS</span>
                  <Sparkles className="w-3 h-3 text-[#E14227]" />
                </div>
              </div>
            </Card>
          </div>
        </motion.div>
      ) : (
        <LoadingOverlay loading={mgmtLoading} label="Memuat data management...">
        <motion.div {...stagger} className="space-y-6">
          <Tabs defaultValue="crews">
            {/* ═══════════════════════════════════════════════════
                AKTIVITAS TERKINI — Activity Timeline Quick View
                ═══════════════════════════════════════════════════ */}
            {isAdmin && (
              <motion.div {...fadeIn} transition={{ delay: 0.02 }}>
                <div className="glass-card rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                        <Clock className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">Aktivitas Terkini</h3>
                        <p className="text-[10px] text-muted-foreground">5 aksi terakhir</p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-[#E14227] hover:bg-[#E14227]/10 dark:hover:text-[#F07050] dark:hover:bg-[#E14227]/20"
                      onClick={fetchRecentActivity}
                      disabled={activityLoading}
                      title="Refresh aktivitas"
                    >
                      <motion.div
                        animate={activityLoading ? { rotate: 360 } : { rotate: 0 }}
                        transition={activityLoading ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
                      >
                        <RefreshCw className="w-4 h-4" />
                      </motion.div>
                    </Button>
                  </div>

                  {activityLoading && recentActivity.length === 0 ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                    </div>
                  ) : recentActivity.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-xs text-muted-foreground">Belum ada aktivitas</p>
                    </div>
                  ) : (
                    <>
                      {/* Mobile: Horizontal scrolling row */}
                      <div className="sm:hidden overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
                        <div className="flex gap-2.5" style={{ minWidth: 'max-content' }}>
                          {recentActivity.map((item, i) => {
                            const ActionIcon = getActivityIcon(item.action)
                            const accentColor = getActivityAccent(item.action)
                            return (
                              <motion.div
                                key={item.createdAt + i}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`flex-shrink-0 w-[200px] rounded-lg border-l-[3px] ${accentColor} bg-white/60 dark:bg-gray-900/40 backdrop-blur-sm border border-border/40 dark:border-border/20 p-2.5`}
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`w-6 h-6 rounded-md flex items-center justify-center ${getActivityBg(item.action)}`}>
                                    <ActionIcon className="w-3 h-3 text-white" />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground font-medium truncate flex-1">{timeAgo(item.createdAt)}</span>
                                </div>
                                <p className="text-[11px] font-semibold text-foreground leading-tight line-clamp-2">{item.description}</p>
                                {item.adminName && (
                                  <p className="text-[9px] text-muted-foreground mt-1 truncate">oleh {item.adminName}</p>
                                )}
                              </motion.div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Desktop: Vertical mini-list */}
                      <div className="hidden sm:block space-y-2">
                        {recentActivity.map((item, i) => {
                          const ActionIcon = getActivityIcon(item.action)
                          const accentColor = getActivityAccent(item.action)
                          return (
                            <motion.div
                              key={item.createdAt + i}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.06 }}
                              className={`flex items-center gap-3 rounded-lg border-l-[3px] ${accentColor} bg-white/50 dark:bg-gray-900/30 backdrop-blur-sm border border-border/30 dark:border-border/15 px-3.5 py-2.5 transition-colors hover:bg-white/80 dark:hover:bg-gray-900/50`}
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${getActivityBg(item.action)}`}>
                                <ActionIcon className="w-3.5 h-3.5 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-foreground truncate">{item.description}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  <span className="font-medium">{item.adminName || 'Sistem'}</span>
                                  <span className="mx-1.5 opacity-40">•</span>
                                  <span>{timeAgo(item.createdAt)}</span>
                                </p>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {/* ═══════════════════════════════════════════════════
                MANAGEMENT SUMMARY STATS — Glassmorphism
                ═══════════════════════════════════════════════════ */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Total Crew', value: mgmtCrews.length, icon: Users, gradient: 'from-[#E14227] to-[#9DB1CC]', shadow: 'shadow-[#E14227]/20', accent: 'border-l-[#E14227]', format: (n: number) => fmtNum(n) },
                { label: 'Total Group', value: groups.length, icon: Target, gradient: 'from-[#E6BAA3] to-[#D4956B]', shadow: 'shadow-[#E6BAA3]/20', accent: 'border-l-[#E6BAA3]', format: (n: number) => fmtNum(n) },
                { label: 'Total Sales', value: mgmtCrews.reduce((s, c) => s + c.totalSales, 0), icon: DollarSign, gradient: 'from-[#9DB1CC] to-[#7E95B3]', shadow: 'shadow-[#9DB1CC]/20', accent: 'border-l-[#9DB1CC]', format: (n: number) => fmtRp(n) },
              ].map((s, i) => (
                <motion.div key={i} whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}>
                  <Card className={`glass-stat border-l-[3px] ${s.accent} overflow-hidden`}>
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                        <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${s.gradient} ${s.shadow} shadow-lg flex items-center justify-center`}>
                          <s.icon className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <p className="text-sm sm:text-lg font-bold tracking-tight truncate">
                        <CountUp value={s.value} format={s.format} />
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Tabs List */}
            <TabsList className="bg-muted/80 backdrop-blur-sm rounded-xl p-1">
              <TabsTrigger value="crews" className="rounded-lg data-[state=active]:bg-[#E14227] data-[state=active]:text-white transition-all"><Users className="w-4 h-4 mr-2" />Crew</TabsTrigger>
              <TabsTrigger value="groups" className="rounded-lg data-[state=active]:bg-[#E14227] data-[state=active]:text-white transition-all"><Target className="w-4 h-4 mr-2" />Group / Zoning</TabsTrigger>
              <TabsTrigger value="report" className="rounded-lg data-[state=active]:bg-[#E14227] data-[state=active]:text-white transition-all"><FileBarChart className="w-4 h-4 mr-2" />Laporan</TabsTrigger>
              <TabsTrigger value="settings" className="rounded-lg data-[state=active]:bg-[#E14227] data-[state=active]:text-white transition-all"><Settings className="w-4 h-4 mr-2" />Pengaturan</TabsTrigger>
            </TabsList>

            {/* Management Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari crew, ID, atau group..."
                value={mgmtSearch}
                onChange={e => setMgmtSearch(e.target.value)}
                className="pl-10 h-10 w-full glass-stat"
              />
              {mgmtSearch && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setMgmtSearch('')}
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              )}
            </div>

            {/* ═══════════════════════════════════════════════════
                CREW MANAGEMENT
                ═══════════════════════════════════════════════════ */}
            <TabsContent value="crews" className="mt-4">
              <motion.div {...fadeIn} className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{filteredMgmtCrews.length}</span> crew terdaftar
                    {mgmtSearch && <span className="ml-1 text-xs">• filter: <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{mgmtSearch}</span></span>}
                  </p>
                  <Dialog open={showAddCrew} onOpenChange={setShowAddCrew}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-[#E14227] hover:bg-[#B8321E] text-white shadow-md shadow-[#E14227]/20 transition-all"><Plus className="w-4 h-4 mr-1" />Tambah Crew</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <CrewForm groups={groups} onSave={handleSaveCrew} onCancel={() => setShowAddCrew(false)} />
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Crew Table Container */}
                <Card className="border-0 shadow-lg overflow-hidden glass-card">
                  {/* ─── Mobile Card View ─── */}
                  <div className="md:hidden p-3 space-y-2.5 max-h-[500px] overflow-y-auto">
                    <AnimatePresence mode="popLayout">
                      {filteredMgmtCrews.map((crew, idx) => {
                        const deptStyle = getDeptStyle(crew.group?.name || '')
                        return (
                          <motion.div
                            key={crew.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: idx * 0.03, duration: 0.2 }}
                            whileHover={{ x: 3, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                            className={`relative border-l-[3px] ${deptStyle.border} ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : `${deptStyle.bg}`} rounded-lg p-3 transition-all duration-200 hover:shadow-md`}
                          >
                            <div className="flex items-center gap-2.5 mb-2.5">
                              <Avatar className="w-10 h-10 ring-2 ring-[#E6BAA3] dark:ring-[#B8321E] ring-offset-1">
                                <AvatarImage src={crew.photo || ''} />
                                <AvatarFallback className="text-xs bg-gradient-to-br from-[#E14227] to-[#D4956B] text-white font-bold">
                                  {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{crew.name}</p>
                                <p className="text-[11px] text-muted-foreground font-mono">{crew.employeeId}</p>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[#E14227]/10 dark:hover:bg-[#E14227]/20" onClick={() => { setEditCrew(crew); setShowAddCrew(true) }}>
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeleteConfirm({ type: 'crew', id: crew.id, name: crew.name })}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              {crew.group?.name ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-gradient-to-r ${deptStyle.pill} shadow-sm`}>
                                  {crew.group.name}
                                </span>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">No Group</Badge>
                              )}
                              <span className="font-bold text-foreground text-sm">{fmtRp(crew.totalSales)}</span>
                            </div>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>

                    {/* Empty State: Crew */}
                    {filteredMgmtCrews.length === 0 && (
                      <motion.div {...fadeIn} className="py-12 text-center">
                        <div className="relative inline-block mb-4">
                          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E6BAA3] to-[#9DB1CC] dark:from-[#E14227]/20 dark:to-[#9DB1CC]/20 flex items-center justify-center mx-auto shadow-inner">
                            <UserPlus className="w-9 h-9 text-[#E14227]" />
                          </div>
                          <motion.div
                            animate={{ y: [0, -6, 0], rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 4, repeat: Infinity }}
                            className="absolute -top-2 -right-2"
                          >
                            <Users className="w-5 h-5 text-[#E6BAA3] opacity-60 animate-float-icon-1" />
                          </motion.div>
                          <motion.div
                            animate={{ y: [0, -5, 0], rotate: [0, -8, 0] }}
                            transition={{ duration: 3.5, repeat: Infinity, delay: 0.5 }}
                            className="absolute -bottom-1 -left-3"
                          >
                            <Target className="w-4 h-4 text-[#B2AC88] opacity-60 animate-float-icon-2" />
                          </motion.div>
                        </div>
                        <p className="text-sm font-semibold text-muted-foreground mb-1">
                          {mgmtSearch ? 'Tidak ditemukan crew yang cocok' : 'Belum ada crew terdaftar'}
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          {mgmtSearch ? 'Coba ubah kata kunci pencarian' : 'Mulai dengan menambahkan crew pertama'}
                        </p>
                      </motion.div>
                    )}
                  </div>

                  {/* ─── Desktop Table View ─── */}
                  <div className="hidden md:block overflow-x-auto max-h-[500px] overflow-y-auto">
                    <Table className="table-stripe table-sticky-head">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>
                            <span className="inline-flex items-center gap-1">Crew <ArrowUpDown className="w-3 h-3 opacity-40" /></span>
                          </TableHead>
                          <TableHead>ID Karyawan</TableHead>
                          <TableHead>Group</TableHead>
                          <TableHead className="text-right">
                            <span className="inline-flex items-center gap-1 justify-end">Total Sales <ArrowUpDown className="w-3 h-3 opacity-40" /></span>
                          </TableHead>
                          <TableHead className="text-right w-24">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMgmtCrews.map((crew, idx) => {
                          const rankAccent = getRankAccentColor(idx)
                          return (
                            <motion.tr
                              key={crew.id}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: idx * 0.02 }}
                              whileHover={{ x: 2, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
                              className={`border-l-[3px] ${rankAccent} transition-all duration-200 hover:shadow-md cursor-default`}
                            >
                              <TableCell className="text-xs font-bold text-muted-foreground/60 tabular-nums">
                                {idx + 1}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="w-9 h-9 ring-2 ring-[#E6BAA3] dark:ring-[#B8321E] ring-offset-1 ring-offset-background">
                                    <AvatarImage src={crew.photo || ''} />
                                    <AvatarFallback className="text-xs bg-gradient-to-br from-[#E14227] to-[#D4956B] text-white font-bold">
                                      {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-semibold text-sm">{crew.name}</span>
                                  {idx < 3 && (
                                    <span className="text-[10px] font-bold">
                                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">{crew.employeeId}</TableCell>
                              <TableCell>
                                {crew.group?.name ? (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold text-white bg-gradient-to-r ${getDeptStyle(crew.group.name).pill} shadow-sm`}>
                                    {crew.group.name}
                                  </span>
                                ) : (
                                  <Badge variant="outline" className="text-xs opacity-60">—</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right text-sm font-bold tabular-nums">{fmtRp(crew.totalSales)}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[#E14227]/10 dark:hover:bg-[#E14227]/20" onClick={() => { setEditCrew(crew); setShowAddCrew(true) }}>
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => setDeleteConfirm({ type: 'crew', id: crew.id, name: crew.name })}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </motion.tr>
                          )
                        })}
                        {filteredMgmtCrews.length === 0 && (
                          <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">{mgmtSearch ? 'Tidak ditemukan crew yang cocok' : 'Belum ada crew'}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </Card>

                {/* ═══════════════════════════════════════════════════
                    CREW PERFORMANCE CHART — Glass Card
                    ═══════════════════════════════════════════════════ */}
                {mgmtCrews.length > 0 && (
                  <motion.div {...fadeIn} transition={{ delay: 0.2 }}>
                    <Card className="border-0 shadow-lg overflow-hidden glass-card">
                      {/* Gradient header with icon badge */}
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-lg shadow-[#E14227]/20">
                            <BarChart3 className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-sm font-bold">Performa Crew</CardTitle>
                            <p className="text-[10px] text-muted-foreground">Total Sales per crew — sorted descending</p>
                          </div>
                          <Badge variant="outline" className="ml-auto text-[10px] tabular-nums font-semibold">
                            {mgmtCrews.length} crew
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="h-[240px] w-full relative">
                          {/* Grid background pattern */}
                          <div className="absolute inset-0 bg-dot-pattern opacity-40 rounded-lg pointer-events-none" />
                          <div className="relative h-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0 0 / 0.5)" />
                                <XAxis type="number" tickFormatter={v => v >= 1000000 ? `${(v / 1000000).toFixed(1)}jt` : v >= 1000 ? `${(v / 1000).toFixed(0)}rb` : String(v)} fontSize={11} />
                                <YAxis type="category" dataKey="name" width={80} fontSize={11} tick={{ fill: 'oklch(0.4 0 0)' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="sales" radius={[0, 6, 6, 0]}>
                                  {sortedCrewsForChart.map((_, i) => (
                                    <Cell key={i} fill={['#E14227', '#B8321E', '#D4956B', '#E6BAA3', '#9DB1CC', '#B5C7DB'][i % 6]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}

                {/* Edit Crew Dialog */}
                <Dialog open={showAddCrew && !!editCrew} onOpenChange={open => { if (!open) { setEditCrew(null); setShowAddCrew(false) } }}>
                  <DialogContent>
                    {editCrew && (
                      <CrewForm crew={editCrew} groups={groups} onSave={handleSaveCrew} onCancel={() => { setEditCrew(null); setShowAddCrew(false) }} />
                    )}
                  </DialogContent>
                </Dialog>
              </motion.div>
            </TabsContent>

            {/* ═══════════════════════════════════════════════════
                GROUP MANAGEMENT
                ═══════════════════════════════════════════════════ */}
            <TabsContent value="groups" className="mt-4">
              <motion.div {...fadeIn} className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{filteredGroups.length}</span> group terdaftar
                    {mgmtSearch && <span className="ml-1 text-xs">• filter: <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{mgmtSearch}</span></span>}
                  </p>
                  <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-[#E14227] hover:bg-[#B8321E] text-white shadow-md shadow-[#E14227]/20 transition-all"><Plus className="w-4 h-4 mr-1" />Tambah Group</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <GroupForm onSave={handleSaveGroup} onCancel={() => setShowAddGroup(false)} />
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <AnimatePresence mode="popLayout">
                    {filteredGroups.map(group => {
                      const gradient = getGroupGradient(group.name)
                      const weekTargets = [
                        { w: 1, t: group.week1Target },
                        { w: 2, t: group.week2Target },
                        { w: 3, t: group.week3Target },
                        { w: 4, t: group.week4Target },
                        { w: 5, t: group.week5Target ?? 0 },
                      ]
                      const currentWeekTarget = weekTargets[currentWeek - 1]?.t || 0

                      return (
                        <motion.div
                          key={group.id}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                          transition={{ duration: 0.25 }}
                        >
                          <Card className="border-0 shadow-md overflow-hidden glass-card hover:shadow-xl transition-all duration-300">
                            {/* Gradient header */}
                            <div className={`bg-gradient-to-r ${gradient} p-4 flex items-center gap-3 relative overflow-hidden`}>
                              {/* Decorative background circle */}
                              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-white/10" />
                              <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />
                              <Avatar className="w-12 h-12 border-2 border-white/30 shadow-lg relative z-10">
                                <AvatarImage src={group.logo || ''} />
                                <AvatarFallback className="bg-white/20 backdrop-blur-sm text-white font-bold text-lg">
                                  {group.name.split(' ').slice(-1)[0][0]}
                                </AvatarFallback>
                              </Avatar>
                              <div className="relative z-10">
                                <p className="font-bold text-sm text-white">{group.name}</p>
                                <p className="text-[11px] text-white/80">{group.crewCount} crew • Target: {fmtRp(group.monthlyTarget)}</p>
                              </div>
                            </div>
                            <CardContent className="p-4 space-y-3">
                              {/* Weekly Progress Bar */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Progress Week {currentWeek}</p>
                                  <p className="text-[10px] font-bold text-[#E14227] dark:text-[#F07050]">{currentWeekTarget}%</p>
                                </div>
                                <div className="w-full h-2.5 rounded-full bg-muted/60 overflow-hidden">
                                  <motion.div
                                    className="h-full rounded-full weekly-progress-gradient"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${currentWeekTarget}%` }}
                                    transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                                  />
                                </div>
                              </div>

                              {/* Week target cards with current week highlight */}
                              <div className="grid grid-cols-4 gap-1.5">
                                {weekTargets.map(week => (
                                  <div
                                    key={week.w}
                                    className={`text-center p-2 rounded-lg transition-all duration-200 ${
                                      week.w === currentWeek
                                        ? 'bg-[#E14227]/10 dark:bg-[#E14227]/20 ring-1 ring-[#E14227]/30 dark:ring-[#E14227]/50 shadow-sm'
                                        : 'bg-muted/40'
                                    }`}
                                  >
                                    <div className="flex items-center justify-center gap-1 mb-0.5">
                                      <CalendarDays className={`w-2.5 h-2.5 ${week.w === currentWeek ? 'text-[#E14227] dark:text-[#F07050]' : 'text-muted-foreground/50'}`} />
                                      <p className={`text-[9px] font-semibold uppercase ${week.w === currentWeek ? 'text-[#E14227] dark:text-[#F07050]' : 'text-muted-foreground/60'}`}>
                                        W{week.w}
                                      </p>
                                    </div>
                                    <p className={`text-sm font-bold tabular-nums ${week.w === currentWeek ? 'text-[#B8321E] dark:text-[#E6BAA3]' : 'text-foreground'}`}>
                                      {week.t}%
                                    </p>
                                    {week.w === currentWeek && (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="w-1 h-1 rounded-full bg-[#E14227] mx-auto mt-0.5"
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* Action buttons */}
                              <div className="flex gap-2 pt-1">
                                <Button size="sm" variant="outline" className="flex-1 h-9 hover:bg-[#E14227]/10 dark:hover:bg-[#E14227]/20 transition-colors" onClick={() => { setEditGroup(group); setShowAddGroup(true) }}>
                                  <Edit2 className="w-3.5 h-3.5 mr-1" />Edit
                                </Button>
                                <Button size="sm" variant="outline" className="h-9 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors" onClick={() => setDeleteConfirm({ type: 'group', id: group.id, name: group.name })}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>

                  {/* Empty State: Groups */}
                  {groups.length === 0 && (
                    <motion.div {...fadeIn} className="col-span-2 py-12 text-center">
                      <div className="relative inline-block mb-4">
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#E6BAA3] to-[#D4956B] dark:from-[#E6BAA3]/40 dark:to-[#D4956B]/40 flex items-center justify-center mx-auto shadow-inner">
                          <FolderOpen className="w-9 h-9 text-[#D4956B]" />
                        </div>
                        <motion.div
                          animate={{ y: [0, -7, 0], rotate: [0, 5, -5, 0] }}
                          transition={{ duration: 3.5, repeat: Infinity }}
                          className="absolute -top-2 -right-2"
                        >
                          <Target className="w-5 h-5 text-[#E14227] opacity-60 animate-float-icon-1" />
                        </motion.div>
                        <motion.div
                          animate={{ y: [0, -5, 0], rotate: [0, -6, 0] }}
                          transition={{ duration: 3, repeat: Infinity, delay: 0.4 }}
                          className="absolute -bottom-1 -left-3"
                        >
                          <Users className="w-4 h-4 text-[#9DB1CC] opacity-60 animate-float-icon-3" />
                        </motion.div>
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground mb-1">Belum ada group terdaftar</p>
                      <p className="text-xs text-muted-foreground/70">Mulai dengan menambahkan group pertama</p>
                    </motion.div>
                  )}
                </div>

                {/* Edit Group Dialog */}
                <Dialog open={showAddGroup && !!editGroup} onOpenChange={open => { if (!open) { setEditGroup(null); setShowAddGroup(false) } }}>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    {editGroup && (
                      <GroupForm group={editGroup} onSave={handleSaveGroup} onCancel={() => { setEditGroup(null); setShowAddGroup(false) }} />
                    )}
                  </DialogContent>
                </Dialog>
              </motion.div>
            </TabsContent>
            {/* ═══════════════════════════════════════════════════
                LAPORAN (REPORT) TAB
                ═══════════════════════════════════════════════════ */}
            <TabsContent value="report" className="mt-4">
              <ManagementReport crews={mgmtCrews} groups={groups} isAdmin={isAdmin} />
            </TabsContent>

            {/* ═══════════════════════════════════════════════════
                SETTINGS TAB
                ═══════════════════════════════════════════════════ */}
            <TabsContent value="settings" className="mt-4">
              <SettingsPanel
                isAdmin={isAdmin}
                adminName={adminName}
                onPasswordChanged={onPasswordChanged}
                onDataCleared={onDataCleared}
              />
            </TabsContent>
          </Tabs>

          {/* ═══════════════════════════════════════════════════
              DATA MIGRATION SECTION
              ═══════════════════════════════════════════════════ */}
          <DataMigrationSection onImportSuccess={onImportSuccess} />

          {/* ═══════════════════════════════════════════════════
              ACTIVITY LOG PANEL
              ═══════════════════════════════════════════════════ */}
          <AnimatePresence>
            <ActivityLogPanel isAdmin={isAdmin} />
          </AnimatePresence>

        </motion.div>
        </LoadingOverlay>
      )}
    </TabsContent>
  )
})

export default ManagementTab

// ─── Data Migration Sub-Component ───────────────────────────
interface ImportSummary {
  groups: { imported: number; skipped: number; total: number }
  crews: { imported: number; skipped: number; total: number }
  sales: { imported: number; skipped: number; total: number }
  clearExisting: boolean
}

interface DataMigrationSectionProps {
  onImportSuccess?: () => void
}

// ─── Crew CSV Import Result ────────────────────────────
interface CrewImportResult {
  imported: number
  skipped: number
  errors: string[]
}

function DataMigrationSection({ onImportSuccess }: DataMigrationSectionProps) {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<ImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Crew CSV Import State ───
  const [crewImporting, setCrewImporting] = useState(false)
  const [crewImportResult, setCrewImportResult] = useState<CrewImportResult | null>(null)
  const crewCsvInputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    setExporting(true)
    try {
      const r = await safeFetch('/api/data/export')
      if (!r.ok) { toast.error('Gagal mengekspor data'); return }
      const blob = await r.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      const dateStr = new Date().toISOString().split('T')[0]
      link.download = `cms-backup-${dateStr}.json`
      link.click()
      URL.revokeObjectURL(link.href)
      toast.success('Data berhasil diekspor')
    } catch { toast.error('Gagal mengekspor data') }
    finally { setExporting(false) }
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.json')) {
      toast.error('File harus berformat JSON')
      e.target.value = ''
      return
    }
    setImportFile(file)
    setImportResult(null)
    setShowImportConfirm(true)
    e.target.value = ''
  }

  const handleConfirmImport = async () => {
    if (!importFile) return
    setShowImportConfirm(false)
    setImporting(true)
    setImportResult(null)
    try {
      const r = await safeFetch('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: await importFile.text(),
      })
      const d = await r.json()
      if (d.error) { toast.error(d.error); return }
      setImportResult(d.summary)
      const totalImported = d.summary.groups.imported + d.summary.crews.imported + d.summary.sales.imported
      toast.success(`Import berhasil! ${totalImported} data diimpor`)
      onImportSuccess?.()
    } catch { toast.error('Gagal mengimpor data') }
    finally { setImporting(false); setImportFile(null) }
  }

  // ─── Crew CSV Template Download ───
  const handleDownloadTemplate = () => {
    const csvContent = 'name,employee_id,photo,group\nAhmad Rizki,EMP001,,Sales A\nBudi Santoso,EMP002,https://example.com/photo.jpg,Sales B\n'
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'template-crew-import.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  // ─── Crew CSV Import Handler ───
  const handleCrewCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
      toast.error('File harus berformat CSV atau XLSX')
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 5MB')
      e.target.value = ''
      return
    }
    setCrewImporting(true)
    setCrewImportResult(null)
    const formData = new FormData()
    formData.append('file', file)
    safeFetch('/api/crews/batch-import', {
      method: 'POST',
      body: formData,
    }).then(async r => {
      const d = await r.json()
      if (d.error) {
        toast.error(d.error)
        return
      }
      setCrewImportResult({ imported: d.imported, skipped: d.skipped, errors: d.errors || [] })
      if (d.imported > 0) {
        toast.success(`Berhasil mengimpor ${d.imported} crew`)
        onImportSuccess?.()
      }
      if (d.errors && d.errors.length > 0) {
        toast.warning(`${d.errors.length} baris bermasalah`)
      }
      if (d.skipped > 0) {
        toast.info(`${d.skipped} duplikat dilewati`)
      }
    }).catch(() => {
      toast.error('Gagal mengimpor crew')
    }).finally(() => {
      setCrewImporting(false)
      e.target.value = ''
    })
  }

  // Determine the active step
  const activeStep = importing ? 2 : importResult ? 3 : 1

  return (
    <motion.div {...fadeIn} transition={{ delay: 0.3 }}>
      <Card className="border-0 shadow-lg overflow-hidden glass-card">
        {/* Header with gradient icon */}
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-lg shadow-[#E14227]/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-sm font-bold">Data Migration</CardTitle>
              <p className="text-[10px] text-muted-foreground">Export & import data untuk migrasi database</p>
            </div>
            {/* Step indicators */}
            <div className="hidden sm:flex items-center gap-2">
              {[
                { num: 1, label: 'Pilih' },
                { num: 2, label: 'Proses' },
                { num: 3, label: 'Selesai' },
              ].map((step, i) => (
                <React.Fragment key={step.num}>
                  <motion.div
                    animate={{
                      scale: activeStep >= step.num ? 1 : 0.9,
                      backgroundColor: activeStep >= step.num ? '#E14227' : 'transparent',
                    }}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors duration-500 ${
                      activeStep >= step.num ? 'text-white shadow-md shadow-[#E14227]/30' : 'text-muted-foreground border border-muted'
                    }`}
                  >
                    {activeStep > step.num ? (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}>✓</motion.span>
                    ) : (
                      step.num
                    )}
                  </motion.div>
                  {i < 2 && (
                    <div className={`w-6 h-0.5 rounded-full transition-colors duration-500 ${activeStep > step.num ? 'bg-[#E14227]' : 'bg-muted'}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            {/* ─── Export Card ─── */}
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <div className="p-4 rounded-xl border border-[#E14227]/20 dark:border-[#E14227]/30 bg-gradient-to-br from-[#E14227]/10 to-white dark:from-[#E14227]/10 dark:to-transparent space-y-3 h-full glass-stat">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E14227] to-[#B8321E] dark:from-[#B8321E] dark:to-[#8F8B6E] flex items-center justify-center shadow-lg shadow-[#E14227]/20">
                    <Download className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Export Data</p>
                    <p className="text-[10px] text-muted-foreground">Download semua data sebagai JSON</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Menyertakan groups, crews, dan semua data penjualan. File dapat digunakan untuk backup atau migrasi.
                </p>
                <Button
                  size="sm"
                  className="w-full bg-gradient-to-r from-[#E14227] to-[#B8321E] hover:from-[#B8321E] hover:to-[#8F8B6E] text-white shadow-md shadow-[#E14227]/20 transition-all"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Mengekspor...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-1.5" />Export JSON</>
                  )}
                </Button>
              </div>
            </motion.div>

            {/* ─── Import Card ─── */}
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <div className="p-4 rounded-xl border border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-br from-amber-50/70 to-white dark:from-amber-950/20 dark:to-transparent space-y-3 h-full glass-stat">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 dark:from-amber-500 dark:to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">Import Data</p>
                    <p className="text-[10px] text-muted-foreground">Upload file JSON untuk migrasi</p>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Upload file backup JSON. Data duplikat akan dilewati. Data groups & crews di-upsert berdasarkan nama.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Mengimpor...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-1.5" />Import JSON</>
                  )}
                </Button>
              </div>
            </motion.div>
          </div>

          {/* ─── Crew CSV Import Section ─── */}
          <motion.div {...fadeIn} transition={{ delay: 0.4 }} className="mt-4">
            <div className="p-4 rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/70 to-white dark:from-violet-950/20 dark:to-transparent space-y-3 glass-stat">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 dark:from-violet-500 dark:to-violet-700 flex items-center justify-center shadow-lg shadow-violet-500/20">
                  <FileSpreadsheet className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Import Crew CSV</p>
                  <p className="text-[10px] text-muted-foreground">Tambah banyak crew sekaligus dari file CSV/XLSX</p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Upload file CSV atau XLSX dengan kolom: <span className="font-mono bg-muted px-1 rounded text-[10px]">name</span> (wajib),{' '}
                <span className="font-mono bg-muted px-1 rounded text-[10px]">employee_id</span>,{' '}
                <span className="font-mono bg-muted px-1 rounded text-[10px]">photo</span>,{' '}
                <span className="font-mono bg-muted px-1 rounded text-[10px]">group</span>. Maksimal 500 baris.
              </p>
              <input
                ref={crewCsvInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleCrewCsvFile}
                className="hidden"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-400 dark:hover:bg-violet-950/30 transition-all"
                  onClick={() => crewCsvInputRef.current?.click()}
                  disabled={crewImporting}
                >
                  {crewImporting ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Mengimpor...</>
                  ) : (
                    <><FileSpreadsheet className="w-4 h-4 mr-1.5" />Import Crew CSV</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={handleDownloadTemplate}
                  disabled={crewImporting}
                >
                  <Download className="w-4 h-4 mr-1.5" />Unduh Template
                </Button>
              </div>
            </div>
          </motion.div>

          {/* ─── Crew CSV Import Result ─── */}
          <AnimatePresence>
            {crewImportResult && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="mt-3 p-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50/80 to-violet-100/50 dark:from-violet-950/30 dark:to-violet-900/20"
              >
                <div className="flex items-center gap-3 mb-3">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-violet-500 flex items-center justify-center shadow-lg shadow-violet-500/30"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </motion.div>
                  <div>
                    <p className="text-sm font-bold text-violet-700 dark:text-violet-400">
                      {crewImportResult.imported > 0 ? `Import Berhasil: ${crewImportResult.imported} Crew` : 'Tidak Ada Crew Diimpor'}
                    </p>
                    {crewImportResult.skipped > 0 && (
                      <p className="text-[10px] text-muted-foreground">{crewImportResult.skipped} duplikat dilewati</p>
                    )}
                  </div>
                </div>
                {crewImportResult.errors.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                    <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Peringatan:</p>
                    {crewImportResult.errors.slice(0, 10).map((err, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground">{err}</p>
                    ))}
                    {crewImportResult.errors.length > 10 && (
                      <p className="text-[10px] text-muted-foreground">...dan {crewImportResult.errors.length - 10} lainnya</p>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Import Result with Animated Checkmark ─── */}
          <AnimatePresence>
            {importResult && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                className="mt-5 p-5 rounded-xl border border-[#E14227]/20 dark:border-[#E14227]/30 bg-gradient-to-br from-[#E14227]/10 to-[#9DB1CC]/10 dark:from-[#E14227]/10 dark:to-[#9DB1CC]/10"
              >
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E14227] to-[#D4956B] flex items-center justify-center shadow-lg shadow-[#E14227]/30"
                  >
                    <CheckCircle2 className="w-5 h-5 text-white animate-check-scale" />
                  </motion.div>
                  <div>
                    <p className="text-sm font-bold text-[#B8321E] dark:text-[#F07050]">Import Berhasil!</p>
                    <p className="text-[10px] text-[#E14227]/70 dark:text-[#F07050]/70">Data telah diproses dan disimpan</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Groups', data: importResult.groups, icon: Target },
                    { label: 'Crews', data: importResult.crews, icon: Users },
                    { label: 'Sales', data: importResult.sales, icon: FileJson },
                  ].map(item => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-center p-3 rounded-lg bg-white/60 dark:bg-black/20 backdrop-blur-sm border border-[#E14227]/15 dark:border-[#E14227]/20">
                      <item.icon className="w-4 h-4 mx-auto mb-1 text-[#E14227]" />
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">{item.label}</p>
                      <motion.p
                        className="text-lg font-bold text-[#B8321E] dark:text-[#F07050] tabular-nums"
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.3 }}
                      >
                        {item.data.imported}
                      </motion.p>
                      <p className="text-[9px] text-muted-foreground">{item.data.skipped} duplikat dilewati</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Import Confirmation Dialog */}
      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Konfirmasi Import Data</AlertDialogTitle>
            <AlertDialogDescription>
              Anda akan mengimpor data dari file <span className="font-semibold">{importFile?.name}</span>.
              Data duplikat akan dilewati secara otomatis. Data groups & crews yang sudah ada akan dipertahankan (upsert by nama).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowImportConfirm(false); setImportFile(null) }}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmImport} className="bg-[#E14227] hover:bg-[#B8321E]">
              Lanjutkan Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
