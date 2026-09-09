'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { X, Zap, TrendingUp, BarChart3, Flame, Target, Calendar, CheckCircle2, AlertTriangle, ArrowUp, Shield, Award, ShoppingCart, CircleDollarSign } from 'lucide-react'
import { fmtRp, fmtNum, CircularProgress } from '@/lib/cms-utils'
import { shiftBadgeClass } from '@/components/management/TargetBreakdownPanel'
import type { CrewStat } from '@/lib/cms-types'

interface CrewDetailPanelProps {
  selectedCrewDetail: CrewStat | null
  setSelectedCrewDetail: (c: CrewStat | null) => void
  /** true = target crew dari engine breakdown (crewTodayTarget valid) */
  engineActive?: boolean
}

function getAchievementColor(pct: number) {
  if (pct >= 100) return { text: 'text-[#B8321E] dark:text-[#F07050]', bg: 'bg-[#F0D5C5] dark:bg-[#3A0D0A]/40', bar: 'bg-[#E14227]', ring: 'ring-[#E6BAA3] dark:ring-[#7A1A14]', gradient: 'from-[#E14227] to-[#9DB1CC]' }
  if (pct >= 75) return { text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', bar: 'bg-blue-500', ring: 'ring-blue-200 dark:ring-blue-800', gradient: 'from-blue-500 to-sky-500' }
  if (pct >= 50) return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', bar: 'bg-amber-500', ring: 'ring-amber-200 dark:ring-amber-800', gradient: 'from-amber-500 to-orange-500' }
  if (pct >= 25) return { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40', bar: 'bg-orange-500', ring: 'ring-orange-200 dark:ring-orange-800', gradient: 'from-orange-500 to-red-500' }
  return { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40', bar: 'bg-red-500', ring: 'ring-red-200 dark:ring-red-800', gradient: 'from-red-500 to-rose-500' }
}

function getAchievementEmoji(pct: number) {
  if (pct >= 150) return { emoji: '🏆', text: 'Luar Biasa!' }
  if (pct >= 120) return { emoji: '🔥', text: 'Fantastis!' }
  if (pct >= 100) return { emoji: '🎯', text: 'Tercapai!' }
  if (pct >= 75) return { emoji: '⭐', text: 'Hampir!' }
  if (pct >= 50) return { emoji: '💪', text: 'Terus Semangat!' }
  if (pct >= 25) return { emoji: '🌱', text: 'Mulai Tumbuh!' }
  return { emoji: '🚀', text: 'Ayo Mulai!' }
}

/** Mini sparkline bar chart for visualizing stat breakdown */
function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  return (
    <div className="flex items-end gap-[2px] h-5 sm:h-6">
      {values.map((v, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${Math.max((v / max) * 100, 4)}%` }}
          transition={{ duration: 0.5, delay: i * 0.08, ease: 'easeOut' }}
          className={`w-1 rounded-full ${color}`}
        />
      ))}
    </div>
  )
}

export default function CrewDetailPanel({ selectedCrewDetail, setSelectedCrewDetail, engineActive }: CrewDetailPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => setShowScrollTop(el.scrollTop > 300)
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  if (!selectedCrewDetail) return null

  const crew = selectedCrewDetail
  const monthColor = getAchievementColor(crew.crewMonthlyAchievement)
  const weekColor = getAchievementColor(crew.crewWeeklyAchievement)
  const monthEmoji = getAchievementEmoji(crew.crewMonthlyAchievement)
  const weekEmoji = getAchievementEmoji(crew.crewWeeklyAchievement)

  // ── Target harian (engine shift-aware, realtime) ──
  const todayTarget = crew.crewTodayTarget ?? 0
  const todayAch = todayTarget > 0 ? Math.min(Math.round((crew.todayTotal / todayTarget) * 100), 999) : 0
  const todayColor = getAchievementColor(todayAch)
  const todayEmoji = getAchievementEmoji(todayAch)
  const shiftToday = crew.crewShiftToday ?? null
  const showDailyTarget = engineActive === true

  return (
    <AnimatePresence>
      {selectedCrewDetail && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={() => setSelectedCrewDetail(null)} />
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-white dark:bg-gray-900 border-l shadow-2xl z-50 flex flex-col">

            {/* Scrollable content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-6">

              {/* ─── HEADER WITH GRADIENT BACKGROUND ─── */}
              <div className="relative bg-gradient-to-br from-[#B8321E] via-[#7E95B3] to-[#B8321E] px-4 pt-4 pb-6 sm:px-6 sm:pt-6 sm:pb-8 overflow-hidden">
                {/* Decorative background circles */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
                <div className="absolute top-4 left-1/2 w-16 h-16 bg-white/5 rounded-full" />

                {/* Close button */}
                <div className="flex items-center justify-between mb-5 relative z-10">
                  <span className="text-xs font-medium text-white/60 uppercase tracking-widest">Statistik Crew</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedCrewDetail(null)}
                    className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/15 rounded-full transition-all duration-200"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                {/* Crew info with larger avatar */}
                <div className="flex items-center gap-4 relative z-10">
                  <motion.div
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <Avatar className="w-14 h-14 sm:w-16 sm:h-16 border-3 border-white/30 shadow-xl">
                      <AvatarImage src={crew.photo || ''} />
                      <AvatarFallback className="bg-gradient-to-br from-[#E14227] to-[#D4956B] text-white font-bold text-xl">
                        {crew.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <motion.h3
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                      className="text-lg font-bold text-white truncate"
                    >
                      {crew.name}
                    </motion.h3>
                    <motion.p
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-sm text-white/75 truncate"
                    >
                      {crew.groupName}
                    </motion.p>
                    <motion.p
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-xs text-white/50 font-mono mt-0.5"
                    >
                      {crew.employeeId}
                    </motion.p>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 space-y-4">

                {/* ─── TARGET SECTION ─── */}
                <div className="p-3 sm:p-4 rounded-xl border bg-gradient-to-br from-[#F0D5C5]/50 to-amber-50/30 dark:from-[#3A0D0A]/20 dark:to-amber-950/10 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#7E95B3] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                      <Target className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Target Per Crew</p>
                      <p className="text-[10px] text-muted-foreground">{fmtRp(crew.groupMonthlyTarget)} grup ÷ {crew.groupName.split(' ')[0]} crew</p>
                    </div>
                  </div>

                  {/* Daily Target (dari engine breakdown — shift-aware) */}
                  {showDailyTarget && (
                    <div className="space-y-2 pb-2.5 border-b border-border/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">Target Hari Ini</span>
                          {shiftToday ? (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${shiftBadgeClass(shiftToday)}`}>
                              Shift {shiftToday}
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              Belum dijadwalkan
                            </span>
                          )}
                        </div>
                        <span className="text-sm font-bold">{fmtRp(todayTarget)}</span>
                      </div>
                      {todayTarget > 0 ? (
                        <>
                          <div className="h-2 bg-muted/80 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(todayAch, 100)}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                              className={`h-full rounded-full bg-gradient-to-r ${todayColor.gradient}`}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {fmtRp(crew.todayTotal)} dari {fmtRp(todayTarget)} ({todayAch}%)
                            {todayAch >= 100 && (
                              <span className="ml-1 text-[#B8321E] dark:text-[#F07050] font-medium">✅ {todayEmoji.text}</span>
                            )}
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          {shiftToday === 'O'
                            ? 'Shift OFF hari ini — tidak ada target penjualan.'
                            : shiftToday
                              ? 'Bobot shift 0 — tidak ada target penjualan hari ini.'
                              : 'Crew tidak dijadwalkan hari ini — target Rp0, porsi dialihkan ke crew ber-shift.'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Monthly Target with achievement emoji */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Target Bulanan</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{fmtRp(crew.crewMonthlyTarget)}</span>
                        <motion.span
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${monthColor.bg} ${monthColor.text} ${crew.crewMonthlyAchievement >= 100 ? 'badge-shimmer' : ''}`}
                        >
                          {monthEmoji.emoji} {crew.crewMonthlyAchievement}%
                        </motion.span>
                      </div>
                    </div>
                    <div className="h-2 sm:h-2.5 bg-muted/80 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(crew.crewMonthlyAchievement, 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`h-full rounded-full bg-gradient-to-r ${monthColor.gradient}`}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {fmtRp(crew.monthTotal)} dari {fmtRp(crew.crewMonthlyTarget)}
                      {crew.crewMonthlyAchievement >= 100 && (
                        <span className="ml-1 text-[#B8321E] dark:text-[#F07050] font-medium">✅ {monthEmoji.text}</span>
                      )}
                    </p>
                  </div>

                  {/* Weekly Targets Grid — All 4 weeks with per-week achievement */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">Target Mingguan</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {crew.crewWeeklyDetails?.map((wd) => {
                        const isCurrentWeek = wd.week === crew.currentWeek
                        const wColor = getAchievementColor(wd.achievement)

                        return (
                          <motion.div
                            key={wd.week}
                            whileHover={{ y: -1 }}
                            className={"text-center p-1.5 sm:p-2 rounded-lg border transition-colors overflow-hidden min-w-0 " + (
                              isCurrentWeek
                                ? `${wColor.bg} ${wColor.ring} ring-1`
                                : wd.achievement >= 100
                                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                  : 'bg-white dark:bg-gray-800 border-border/50'
                            )}
                          >
                            <p className="text-[9px] text-muted-foreground font-medium">W{wd.week}</p>
                            <p className="text-[10px] sm:text-xs font-bold tabular-nums truncate">{fmtRp(wd.target)}</p>
                            <p className={`text-[9px] font-bold ${isCurrentWeek ? wColor.text : wd.achievement >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                              {wd.achievement}%
                            </p>
                            <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(wd.achievement, 100)}%` }}
                                transition={{ duration: 0.6, delay: wd.week * 0.1 }}
                                className={`h-full rounded-full ${isCurrentWeek ? `bg-gradient-to-r ${wColor.gradient}` : wd.achievement >= 100 ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`}
                              />
                            </div>
                            <p className="text-[8px] text-muted-foreground mt-0.5 tabular-nums truncate">{fmtRp(wd.total)}</p>
                            <p className="text-[7px] text-muted-foreground/60">tgl {wd.dateFrom}-{wd.dateTo}</p>
                          </motion.div>
                        )
                      })}
                    </div>
                    {crew.crewWeeklyAchievement >= 100 && (
                      <div className="flex items-center gap-1.5 text-[#B8321E] dark:text-[#F07050]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-semibold">Target Minggu {crew.currentWeek} tercapai! {weekEmoji.emoji}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── PERFORMANCE STATS WITH SPARKLINES ─── */}
                <div className="space-y-3">
                  {[
                    { label: 'Hari Ini', value: crew.todayTotal, qty: crew.todayQty, struk: crew.todayStruk, icon: Zap, color: 'from-[#E14227] to-[#7E95B3]', barColor: 'bg-[#F07050]', sparkData: [crew.todayQty, crew.todayStruk, crew.todayTotal > 0 ? 1 : 0] },
                    { label: 'Minggu Ini', value: crew.weekTotal, qty: crew.weekQty, struk: crew.weekStruk, icon: TrendingUp, color: 'from-amber-500 to-orange-600', barColor: 'bg-amber-400', sparkData: [crew.weekQty, crew.weekStruk, Math.round(crew.weekTotal / 100000)] },
                    { label: 'Bulan Ini', value: crew.monthTotal, qty: crew.monthQty, struk: crew.monthStruk, icon: BarChart3, color: 'from-purple-500 to-violet-600', barColor: 'bg-purple-400', sparkData: [crew.monthQty, crew.monthStruk, Math.round(crew.monthTotal / 100000)] },
                    { label: 'All Time', value: crew.allTimeTotal, qty: crew.allTimeQty, struk: crew.allTimeStruk, icon: Flame, color: 'from-[#9DB1CC] to-[#7E95B3]', barColor: 'bg-[#9DB1CC]', sparkData: [crew.allTimeQty, crew.allTimeStruk, Math.round(crew.allTimeTotal / 100000)] },
                  ].map((s, i) => {
                    const basketSize = s.struk > 0 ? (s.qty / s.struk).toFixed(2) : '0.00'
                    const pricePoint = s.qty > 0 ? Math.round(s.value / s.qty) : 0

                    return (
                      <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                        <div className="flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border bg-gradient-to-r from-white to-[#F0EAD6]/50 dark:from-gray-800 dark:to-gray-900">
                          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center shrink-0 shadow-md`}>
                            <s.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-muted-foreground">{s.label}</p>
                            <p className="font-bold">{fmtRp(s.value)}</p>
                          </div>
                          <MiniSparkline values={s.sparkData} color={s.barColor} />
                          <div className="flex flex-col items-end gap-0.5 shrink-0">
                            <Badge variant="outline" className="text-[10px] px-1.5">{fmtNum(s.qty)} qty</Badge>
                            <span className="text-[10px] text-muted-foreground">{fmtNum(s.struk)} struk</span>
                          </div>
                        </div>
                        {/* Basket Size & Price Point in styled cards */}
                        <div className="ml-10 sm:ml-13 mt-1 sm:mt-1.5 flex items-center gap-2 px-0.5">
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/30">
                            <ShoppingCart className="w-3 h-3 text-purple-500" />
                            <span className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold tabular-nums">
                              {basketSize}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E6BAA3]/40 dark:bg-[#7E95B3]/10 border border-[#9DB1CC]/30 dark:border-[#7E95B3]/20">
                            <CircleDollarSign className="w-3 h-3 text-[#7E95B3]" />
                            <span className="text-[10px] text-[#7E95B3] dark:text-[#9DB1CC] font-semibold tabular-nums">
                              {fmtRp(pricePoint)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>

                {/* ─── TOTAL TRANSACTIONS WITH GRADIENT BACKGROUND ─── */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="relative p-4 sm:p-5 rounded-xl overflow-hidden bg-gradient-to-br from-[#B8321E] via-[#7E95B3] to-[#B8321E] text-white"
                >
                  {/* Decorative elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/3" />

                  <div className="relative z-10 text-center space-y-2">
                    <div className="flex items-center justify-center gap-1.5 text-white/70">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Total Transaksi (item rows)</span>
                    </div>
                    <motion.p
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="text-2xl sm:text-3xl font-bold tabular-nums"
                    >
                      {fmtNum(crew.transactionCount)}
                    </motion.p>
                    <div className="flex items-center justify-center gap-3">
                      <div className="flex items-center gap-1 text-white/60">
                        <Award className="w-3 h-3" />
                        <span className="text-[10px] font-medium">{fmtNum(crew.allTimeStruk)} struk unik</span>
                      </div>
                      <div className="w-px h-3 bg-white/20" />
                      <div className="flex items-center gap-1 text-white/60">
                        <BarChart3 className="w-3 h-3" />
                        <span className="text-[10px] font-medium">{fmtNum(crew.allTimeQty)} total qty</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

              </div>
            </div>

            {/* ─── SCROLL TO TOP BUTTON ─── */}
            <AnimatePresence>
              {showScrollTop && (
                <motion.button
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="absolute bottom-20 md:bottom-5 left-5 w-10 h-10 rounded-full bg-white dark:bg-gray-800 border shadow-lg shadow-black/10 flex items-center justify-center hover:bg-[#F0EAD6] dark:hover:bg-gray-700 transition-colors z-10"
                >
                  <ArrowUp className="w-4 h-4 text-[#B8321E] dark:text-[#F07050]" />
                </motion.button>
              )}
            </AnimatePresence>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
