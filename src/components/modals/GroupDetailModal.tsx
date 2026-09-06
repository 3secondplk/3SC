'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { X, Users, Package, DollarSign, ShoppingCart, Layers, Percent, Target, Eye, Receipt, BarChart3 } from 'lucide-react'
import { fmtRp, fmtNum } from '@/lib/cms-utils'
import type { GroupAchievement, GroupDetailData } from '@/lib/cms-types'

// ─── Detail Report Summary — Penjualan Brand & Dept per Zoning ───
// Isolated per zoning (modal ini), berdasarkan CLAIM penjualan crew.
function ZoningReportSummary({ data, loading, groupName }: { data: GroupDetailData | null; loading: boolean; groupName: string }) {
  if (loading || !data) {
    return (
      <div className="rounded-xl border border-border/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-[#9DB1CC]/10 to-transparent border-b border-border/40">
          <div className="w-6 h-6 rounded-md bg-muted animate-pulse" />
          <div className="h-3 w-40 bg-muted rounded animate-pulse" />
        </div>
        <div className="p-3 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 bg-muted/70 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const hasRows = data.reportSummary.rows.length > 0
  return (
    <div className="rounded-xl border border-border/40 dark:border-border/20 overflow-hidden bg-white/40 dark:bg-gray-900/20">
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 bg-gradient-to-r from-[#9DB1CC]/15 via-[#E14227]/5 to-transparent border-b border-border/40 dark:border-border/20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 shrink-0 rounded-md bg-gradient-to-br from-[#9DB1CC] to-[#B8321E] flex items-center justify-center shadow-sm">
            <Receipt className="w-3 h-3 text-white" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-foreground truncate leading-tight">Report Summary — Brand &amp; Dept</h4>
            <p className="text-[9px] text-muted-foreground truncate">Penjualan per Brand &amp; Dept &bull; klaim crew &bull; {data.period}</p>
          </div>
        </div>
        {hasRows && (
          <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
            {data.reportSummary.rows.length} item &bull; Qty <b className="text-foreground">{fmtNum(data.reportSummary.totalQty)}</b>
          </span>
        )}
      </div>

      {hasRows ? (
        <div className="max-h-72 overflow-y-auto">
          <Table className="table-sticky-head">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8 text-[9px] uppercase tracking-wider">#</TableHead>
                <TableHead className="text-[9px] uppercase tracking-wider">Brand</TableHead>
                <TableHead className="text-[9px] uppercase tracking-wider">Dept</TableHead>
                <TableHead className="text-right text-[9px] uppercase tracking-wider">Qty</TableHead>
                <TableHead className="text-right text-[9px] uppercase tracking-wider">Netto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.reportSummary.rows.map((r, i) => (
                <TableRow key={`${r.brand}-${r.dept}-${i}`} className="transition-colors hover:bg-muted/30">
                  <TableCell className="text-[9px] text-muted-foreground/60 tabular-nums">{i + 1}</TableCell>
                  <TableCell className="text-[11px] font-bold max-w-[110px] truncate">{r.brand}</TableCell>
                  <TableCell className="text-[11px] max-w-[130px] truncate">{r.dept}</TableCell>
                  <TableCell className="text-[11px] text-right tabular-nums">{fmtNum(r.qty)}</TableCell>
                  <TableCell className="text-[11px] text-right font-bold text-[#E14227] tabular-nums">{fmtRp(r.netto)}</TableCell>
                </TableRow>
              ))}
              {/* Zoning total footer */}
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={3} className="text-[11px] font-bold">Total {groupName}</TableCell>
                <TableCell className="text-[11px] text-right tabular-nums font-bold">{fmtNum(data.reportSummary.totalQty)}</TableCell>
                <TableCell className="text-[11px] text-right tabular-nums font-bold text-[#E14227]">{fmtRp(data.reportSummary.totalNetto)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="py-6 text-center">
          <BarChart3 className="w-7 h-7 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-xs text-muted-foreground">Belum ada penjualan crew yang diklaim pada periode ini</p>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">Summary hanya menghitung penjualan yang sudah diklaim crew</p>
        </div>
      )}
    </div>
  )
}

interface GroupDetailModalProps {
  selectedGroupDetail: GroupAchievement | null
  setSelectedGroupDetail: (g: GroupAchievement | null) => void
  groupDetailData: GroupDetailData | null
  groupDetailPeriod: 'daily' | 'weekly' | 'monthly'
  setGroupDetailPeriod: (p: 'daily' | 'weekly' | 'monthly') => void
  groupDetailLoading: boolean
}

function getAchievementColor(pct: number) {
  if (pct >= 100) return { text: 'text-[#B8321E] dark:text-[#F07050]', bg: 'bg-[#F0D5C5] dark:bg-[#3A0D0A]/40', bar: 'bg-[#E14227]' }
  if (pct >= 75) return { text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40', bar: 'bg-blue-500' }
  if (pct >= 50) return { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40', bar: 'bg-amber-500' }
  if (pct >= 25) return { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40', bar: 'bg-orange-500' }
  return { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40', bar: 'bg-red-500' }
}

export default function GroupDetailModal({
  selectedGroupDetail, setSelectedGroupDetail,
  groupDetailData, groupDetailPeriod, setGroupDetailPeriod, groupDetailLoading,
}: GroupDetailModalProps) {
  return (
    <AnimatePresence>
      {selectedGroupDetail && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={() => setSelectedGroupDetail(null)} />
          {/* ── MOBILE: Bottom Sheet ── */}
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-[60px] top-[12vh] sm:hidden bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl z-50 flex flex-col"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar className="w-8 h-8 border border-[#E6BAA3] dark:border-[#7A1A14] shrink-0">
                  <AvatarImage src={selectedGroupDetail.logo || ''} />
                  <AvatarFallback className="bg-gradient-to-br from-[#E14227] to-[#9DB1CC] text-white font-bold text-[10px]">
                    {selectedGroupDetail.name.split(' ').slice(-1)[0][0]}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold truncate">{selectedGroupDetail.name}</h3>
                  <p className="text-[10px] text-muted-foreground">Performa Crew</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Period filter pills */}
                <div className="flex items-center bg-muted/80 rounded-lg p-0.5">
                  {([['daily', 'H'], ['weekly', 'M'], ['monthly', 'B']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setGroupDetailPeriod(key)}
                      className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                        groupDetailPeriod === key
                          ? 'bg-white dark:bg-gray-700 text-[#B8321E] dark:text-[#F07050] shadow-sm'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedGroupDetail(null)}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {groupDetailLoading || !groupDetailData ? (
                <div className="space-y-3 animate-pulse">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-14 bg-muted rounded-xl" />
                  ))}
                </div>
              ) : (
                <>
                  {/* Period label */}
                  <p className="text-[11px] text-muted-foreground text-center">
                    Periode: <span className="font-semibold text-foreground">{groupDetailData.period}</span>
                  </p>

                  {/* ── Mobile: Scrollable Summary Chips ── */}
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
                    {[
                      { label: 'Qty', value: fmtNum(groupDetailData.groupTotal.qty), icon: Package, color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200/50 dark:border-amber-800/30' },
                      { label: 'Penjualan', value: fmtRp(groupDetailData.groupTotal.settle), icon: DollarSign, color: 'text-[#B8321E] dark:text-[#F07050] bg-[#F0D5C5]/50 dark:bg-[#3A0D0A]/20 border-[#E6BAA3]/50 dark:border-[#B8321E]/30' },
                      { label: 'Struk', value: fmtNum(groupDetailData.groupTotal.struk), icon: ShoppingCart, color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200/50 dark:border-purple-800/30' },
                      { label: 'Basket', value: groupDetailData.groupTotal.basketSize.toFixed(2), icon: Layers, color: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border-rose-200/50 dark:border-rose-800/30' },
                      { label: 'Price', value: fmtRp(groupDetailData.groupTotal.pricePoint), icon: Percent, color: 'text-[#7E95B3] dark:text-[#9DB1CC] bg-[#B5C7DB]/30 dark:bg-[#7E95B3]/20 border-[#9DB1CC]/50 dark:border-[#7E95B3]/30' },
                    ].map((s, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shrink-0 ${s.color}`}>
                          <s.icon className="w-3 h-3 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[8px] leading-none opacity-70">{s.label}</p>
                            <p className="text-[11px] font-bold truncate leading-tight mt-0.5">{s.value}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* ── Detail Report Summary: Brand & Dept (isolated per zoning) ── */}
                  <ZoningReportSummary data={groupDetailData} loading={groupDetailLoading} groupName={selectedGroupDetail.name} />

                  {/* ── Target Per Crew (collapsed) ── */}
                  {(groupDetailData.crewMonthlyTarget > 0) && (
                    <div className="p-3 rounded-xl border bg-gradient-to-br from-[#F0D5C5]/30 to-amber-50/20 dark:from-[#3A0D0A]/10 dark:to-amber-950/5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#E14227] to-[#7E95B3] flex items-center justify-center shadow-sm">
                            <Target className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-[10px] font-semibold">Target/Crew</span>
                        </div>
                        <span className="text-[10px] font-bold text-[#B8321E] dark:text-[#F07050]">{fmtRp(groupDetailData.crewMonthlyTarget)}</span>
                      </div>
                      {/* Week dots */}
                      <div className="flex gap-1.5">
                        {groupDetailData.weeklyTargetPcts.map((pct, i) => {
                          const target = groupDetailData.crewWeeklyTargets[i] || 0
                          const isCurrentWeek = (i + 1) === groupDetailData.currentWeek
                          return (
                            <div
                              key={i}
                              className={`flex-1 text-center py-1.5 rounded-lg border text-[8px] transition-colors ${
                                isCurrentWeek
                                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 ring-1 ring-amber-300/50 font-bold'
                                  : 'bg-white dark:bg-gray-800 border-border/50'
                              }`}
                            >
                              <p className="text-muted-foreground">W{i + 1}</p>
                              <p className="font-bold tabular-nums mt-0.5">{fmtRp(target)}</p>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Crew List (compact mobile cards) ── */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Users className="w-3.5 h-3.5 text-[#E14227]" />
                      <h4 className="font-bold text-xs">Crew ({groupDetailData.crews.length})</h4>
                    </div>

                    {groupDetailData.crews.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p className="text-xs">Belum ada data crew</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {groupDetailData.crews.map((c, idx) => {
                          const aColor = getAchievementColor(c.crewMonthlyAchievement)
                          return (
                            <motion.div
                              key={c.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.04 }}
                              className={`rounded-xl border p-2.5 ${
                                idx === 0
                                  ? 'bg-amber-50/40 dark:bg-amber-950/10 border-amber-200/40 dark:border-amber-800/20'
                                  : 'bg-white dark:bg-gray-800/80'
                              }`}
                            >
                              {/* Row 1: Rank + Avatar + Name + Achievement */}
                              <div className="flex items-center gap-2">
                                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-br from-[#E14227] to-[#7E95B3] text-white text-[9px] font-bold shrink-0">
                                  {idx + 1}
                                </div>
                                <Avatar className="w-7 h-7 shrink-0">
                                  <AvatarImage src={c.photo || ''} />
                                  <AvatarFallback className="text-[8px] bg-[#E6BAA3] dark:bg-[#3A0D0A] text-[#B8321E] dark:text-[#E6BAA3]">
                                    {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-bold truncate leading-tight">{c.name}</p>
                                  <p className="text-[9px] text-muted-foreground font-mono">{c.employeeId}</p>
                                </div>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${aColor.bg} ${aColor.text}`}>
                                  {groupDetailPeriod === 'monthly' ? c.crewMonthlyAchievement : c.crewWeeklyAchievement}%
                                </span>
                              </div>

                              {/* Row 2: Stats row (inline) */}
                              <div className="mt-2 flex items-center gap-1 text-[9px]">
                                <span className={`flex-1 text-center py-1 rounded-md ${idx === 0 ? 'bg-[#F0D5C5]/60 dark:bg-[#3A0D0A]/30' : 'bg-muted/50'}`}>
                                  <p className="text-muted-foreground leading-none">Jual</p>
                                  <p className={`font-bold tabular-nums mt-0.5 ${idx === 0 ? 'text-[#B8321E] dark:text-[#E6BAA3]' : ''}`}>{fmtRp(c.totalSettle)}</p>
                                </span>
                                <span className="flex-1 text-center py-1 rounded-md bg-muted/50">
                                  <p className="text-muted-foreground leading-none">{groupDetailPeriod === 'monthly' ? 'Target Bulan' : 'Target W' + groupDetailData.currentWeek}</p>
                                  <p className="font-bold tabular-nums mt-0.5">{fmtRp(groupDetailPeriod === 'monthly' ? c.crewMonthlyTarget : c.crewCurrentWeekTarget)}</p>
                                </span>
                                <span className="flex-1 text-center py-1 rounded-md bg-muted/50">
                                  <p className="text-muted-foreground leading-none">Qty</p>
                                  <p className="font-bold tabular-nums mt-0.5">{fmtNum(c.totalQty)}</p>
                                </span>
                                <span className="flex-1 text-center py-1 rounded-md bg-purple-50 dark:bg-purple-950/30">
                                  <p className="text-purple-600 dark:text-purple-400 leading-none">Bsk</p>
                                  <p className="font-bold tabular-nums mt-0.5 text-purple-700 dark:text-purple-300">{c.basketSize.toFixed(1)}</p>
                                </span>
                              </div>

                              {/* Achievement bar */}
                              {(groupDetailPeriod === 'monthly' ? c.crewMonthlyTarget : c.crewCurrentWeekTarget) > 0 && (
                                <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(groupDetailPeriod === 'monthly' ? c.crewMonthlyAchievement : c.crewWeeklyAchievement, 100)}%` }}
                                    transition={{ duration: 0.5, delay: idx * 0.04 }}
                                    className={`h-full rounded-full ${aColor.bar}`}
                                  />
                                </div>
                              )}
                              {/* Per-week achievements mini bars */}
                              {c.crewWeeklyDetails && c.crewWeeklyDetails.length > 0 && (
                                <div className="mt-1.5 grid grid-cols-4 gap-1">
                                  {c.crewWeeklyDetails.map((wd) => {
                                    const isCurrentWeek = wd.week === groupDetailData.currentWeek
                                    return (
                                      <div key={wd.week} className="text-center">
                                        <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full rounded-full ${isCurrentWeek ? 'bg-gradient-to-r from-[#E14227] to-[#D4956B]' : wd.achievement >= 100 ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`}
                                            style={{ width: `${Math.min(wd.achievement, 100)}%` }}
                                          />
                                        </div>
                                        <p className={`text-[7px] font-semibold mt-0.5 ${isCurrentWeek ? 'text-[#E14227]' : 'text-muted-foreground'}`}>
                                          W{wd.week} {wd.achievement}%
                                        </p>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </motion.div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>

          {/* ── TABLET / DESKTOP: Centered Dialog ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="hidden sm:flex fixed inset-6 md:inset-10 lg:inset-16 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl z-50 overflow-hidden flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b bg-gradient-to-r from-[#F0D5C5] to-[#E6BAA3]/30 dark:from-gray-800 dark:to-gray-900 shrink-0">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10 border-2 border-[#E6BAA3] dark:border-[#7A1A14]">
                  <AvatarImage src={selectedGroupDetail.logo || ''} />
                  <AvatarFallback className="bg-gradient-to-br from-[#E14227] to-[#9DB1CC] text-white font-bold">
                    {selectedGroupDetail.name.split(' ').slice(-1)[0][0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-base sm:text-lg font-bold">{selectedGroupDetail.name}</h3>
                  <p className="text-xs text-muted-foreground">Detail Performa Crew per Periode</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-muted/80 rounded-lg p-0.5">
                  {([['daily', 'Harian'], ['weekly', 'Mingguan'], ['monthly', 'Bulanan']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setGroupDetailPeriod(key)}
                      className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-md transition-all duration-200 ${
                        groupDetailPeriod === key
                          ? 'bg-white dark:bg-gray-700 text-[#B8321E] dark:text-[#F07050] shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSelectedGroupDetail(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {groupDetailLoading || !groupDetailData ? (
                <div className="space-y-4 animate-pulse">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-20 bg-muted rounded-xl" />
                    ))}
                  </div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 bg-muted rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-6">
                  <p className="text-sm text-muted-foreground text-center">
                    Periode: <span className="font-semibold text-foreground">{groupDetailData.period}</span>
                  </p>

                  {/* Target Per Crew Summary */}
                  {(groupDetailData.crewMonthlyTarget > 0) && (
                    <div className="p-3 sm:p-4 rounded-xl border bg-gradient-to-br from-[#F0D5C5]/50 to-amber-50/30 dark:from-[#3A0D0A]/20 dark:to-amber-950/10 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#7E95B3] flex items-center justify-center shadow-md shadow-[#E14227]/20">
                          <Target className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Target Per Crew</p>
                          <p className="text-[10px] text-muted-foreground">
                            {fmtRp(selectedGroupDetail.monthlyTarget)} grup ÷ {selectedGroupDetail.crewCount} crew = {fmtRp(groupDetailData.crewMonthlyTarget)}/crew/bulan
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {groupDetailData.weeklyTargetPcts.map((pct, i) => {
                          const target = groupDetailData.crewWeeklyTargets[i] || 0
                          const isCurrentWeek = (i + 1) === groupDetailData.currentWeek
                          return (
                            <div
                              key={i}
                              className={`text-center p-2 rounded-lg border transition-colors ${
                                isCurrentWeek
                                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 ring-1 ring-amber-300/50'
                                  : 'bg-white dark:bg-gray-800 border-border/50'
                              }`}
                            >
                              <p className="text-[9px] text-muted-foreground font-medium">W{i + 1}</p>
                              <p className="text-[9px] text-muted-foreground">{pct}%</p>
                              <p className="text-xs font-bold tabular-nums">{fmtRp(target)}</p>
                              {isCurrentWeek && (
                                <span className="text-[8px] font-bold text-amber-600 dark:text-amber-400 uppercase">Sekarang</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Group Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
                    {[
                      { label: 'Total Qty', value: fmtNum(groupDetailData.groupTotal.qty), icon: Package, gradient: 'from-amber-500 to-orange-600', shadow: 'shadow-amber-500/20' },
                      { label: 'Total Penjualan', value: fmtRp(groupDetailData.groupTotal.settle), icon: DollarSign, gradient: 'from-[#E14227] to-[#7E95B3]', shadow: 'shadow-[#E14227]/20' },
                      { label: 'Total Struk', value: fmtNum(groupDetailData.groupTotal.struk), icon: ShoppingCart, gradient: 'from-purple-500 to-violet-600', shadow: 'shadow-purple-500/20' },
                      { label: 'Basket Size', value: groupDetailData.groupTotal.basketSize.toFixed(2), icon: Layers, gradient: 'from-rose-500 to-pink-600', shadow: 'shadow-rose-500/20' },
                      { label: 'Price Point', value: fmtRp(groupDetailData.groupTotal.pricePoint), icon: Percent, gradient: 'from-[#9DB1CC] to-[#7E95B3]', shadow: 'shadow-[#9DB1CC]/20' },
                    ].map((s, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                        <div className="p-2 sm:p-3 rounded-xl border bg-gradient-to-br from-white to-[#F0EAD6]/50 dark:from-gray-800 dark:to-gray-900 text-center">
                          <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${s.gradient} ${s.shadow} shadow flex items-center justify-center mx-auto mb-1.5`}>
                            <s.icon className="w-4 h-4 text-white" />
                          </div>
                          <p className="text-[10px] text-muted-foreground">{s.label}</p>
                          <p className="text-sm font-bold truncate">{s.value}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* ── Detail Report Summary: Brand & Dept (isolated per zoning) ── */}
                  <ZoningReportSummary data={groupDetailData} loading={groupDetailLoading} groupName={selectedGroupDetail.name} />

                  {/* Crew List */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-[#E14227]" />
                      <h4 className="font-bold text-sm">Daftar Crew ({groupDetailData.crews.length})</h4>
                    </div>

                    {groupDetailData.crews.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">Belum ada data crew untuk periode ini</p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden md:block rounded-xl border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead className="text-[10px] uppercase tracking-wider">#</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider">Crew</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider text-right">Penjualan</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider text-right">{groupDetailPeriod === 'monthly' ? 'Target Bulan' : `Target W${groupDetailData.currentWeek}`}</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider text-right">Achievement</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider text-center">Weekly</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider text-right">Qty</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider text-right">Struk</TableHead>
                                <TableHead className="text-[10px] uppercase tracking-wider text-right">Basket</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {groupDetailData.crews.map((c, idx) => {
                                const displayAchievement = groupDetailPeriod === 'monthly' ? c.crewMonthlyAchievement : c.crewWeeklyAchievement
                                const aColor = getAchievementColor(displayAchievement)
                                return (
                                  <TableRow key={c.id} className={`transition-colors ${idx === 0 ? 'bg-amber-50/50 dark:bg-amber-950/10' : 'hover:bg-muted/50'}`}>
                                    <TableCell>
                                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[#E14227] to-[#7E95B3] text-white text-[10px] font-bold">
                                        {idx + 1}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <Avatar className="w-7 h-7">
                                          <AvatarImage src={c.photo || ''} />
                                          <AvatarFallback className="text-[9px] bg-[#E6BAA3] dark:bg-[#3A0D0A] text-[#B8321E] dark:text-[#E6BAA3]">
                                            {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <p className="text-xs font-semibold">{c.name}</p>
                                          <p className="text-[10px] text-muted-foreground font-mono">{c.employeeId}</p>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-bold tabular-nums text-[#B8321E] dark:text-[#F07050]">{fmtRp(c.totalSettle)}</TableCell>
                                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{fmtRp(groupDetailPeriod === 'monthly' ? c.crewMonthlyTarget : c.crewCurrentWeekTarget)}</TableCell>
                                    <TableCell className="text-right">
                                      <span className={`text-xs font-bold ${aColor.text}`}>{displayAchievement}%</span>
                                    </TableCell>
                                    <TableCell>
                                      {c.crewWeeklyDetails && c.crewWeeklyDetails.length > 0 ? (
                                        <div className="flex items-center gap-1.5">
                                          {c.crewWeeklyDetails.map((wd) => {
                                            const isCurrentWeek = wd.week === groupDetailData.currentWeek
                                            return (
                                              <div key={wd.week} className="text-center min-w-[32px]">
                                                <div className="h-1 bg-muted/60 rounded-full overflow-hidden mb-0.5">
                                                  <div
                                                    className={`h-full rounded-full ${isCurrentWeek ? 'bg-gradient-to-r from-[#E14227] to-[#D4956B]' : wd.achievement >= 100 ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`}
                                                    style={{ width: `${Math.min(wd.achievement, 100)}%` }}
                                                  />
                                                </div>
                                                <p className={`text-[8px] font-semibold ${isCurrentWeek ? 'text-[#E14227]' : 'text-muted-foreground'}`}>
                                                  W{wd.week} {wd.achievement}%
                                                </p>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground">—</span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right text-xs font-medium tabular-nums">{fmtNum(c.totalQty)}</TableCell>
                                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{fmtNum(c.totalStruk)}</TableCell>
                                    <TableCell className="text-right text-xs tabular-nums font-medium text-purple-600 dark:text-purple-400">{c.basketSize.toFixed(2)}</TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Tablet cards (sm) */}
                        <div className="md:hidden sm:grid sm:grid-cols-2 gap-3">
                          {groupDetailData.crews.map((c, idx) => {
                            const displayAchievement = groupDetailPeriod === 'monthly' ? c.crewMonthlyAchievement : c.crewWeeklyAchievement
                            const aColor = getAchievementColor(displayAchievement)
                            return (
                              <motion.div key={c.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}>
                                <div className={`p-3 rounded-xl border ${idx === 0 ? 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-800/30' : 'bg-white dark:bg-gray-800'}`}>
                                  <div className="flex items-center gap-2 mb-2.5">
                                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[#E14227] to-[#7E95B3] text-white text-[10px] font-bold shrink-0">{idx + 1}</div>
                                    <Avatar className="w-8 h-8">
                                      <AvatarImage src={c.photo || ''} />
                                      <AvatarFallback className="text-[9px] bg-[#E6BAA3] dark:bg-[#3A0D0A] text-[#B8321E] dark:text-[#E6BAA3]">
                                        {c.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-bold truncate">{c.name}</p>
                                      <p className="text-[10px] text-muted-foreground font-mono">{c.employeeId}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${aColor.bg} ${aColor.text}`}>{displayAchievement}%</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <div className="text-center p-1.5 rounded-lg bg-[#F0D5C5] dark:bg-[#3A0D0A]/30">
                                      <p className="text-[9px] text-muted-foreground">Penjualan</p>
                                      <p className="text-xs font-bold tabular-nums text-[#B8321E] dark:text-[#E6BAA3]">{fmtRp(c.totalSettle)}</p>
                                    </div>
                                    <div className="text-center p-1.5 rounded-lg bg-muted/50">
                                      <p className="text-[9px] text-muted-foreground">{groupDetailPeriod === 'monthly' ? 'Target Bulan' : `Target W${groupDetailData.currentWeek}`}</p>
                                      <p className="text-xs font-bold tabular-nums">{fmtRp(groupDetailPeriod === 'monthly' ? c.crewMonthlyTarget : c.crewCurrentWeekTarget)}</p>
                                    </div>
                                    <div className="text-center p-1.5 rounded-lg bg-muted/50">
                                      <p className="text-[9px] text-muted-foreground">Qty</p>
                                      <p className="text-xs font-bold tabular-nums">{fmtNum(c.totalQty)}</p>
                                    </div>
                                    <div className="text-center p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                                      <p className="text-[9px] text-purple-600 dark:text-purple-400">Basket</p>
                                      <p className="text-xs font-bold tabular-nums text-purple-700 dark:text-purple-300">{c.basketSize.toFixed(2)}</p>
                                    </div>
                                  </div>
                                  {(groupDetailPeriod === 'monthly' ? c.crewMonthlyTarget : c.crewCurrentWeekTarget) > 0 && (
                                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(displayAchievement, 100)}%` }}
                                        transition={{ duration: 0.6, delay: idx * 0.05 }}
                                        className={`h-full rounded-full ${aColor.bar}`}
                                      />
                                    </div>
                                  )}
                                  {/* Per-week achievements mini bars */}
                                  {c.crewWeeklyDetails && c.crewWeeklyDetails.length > 0 && (
                                    <div className="mt-1.5 grid grid-cols-4 gap-1">
                                      {c.crewWeeklyDetails.map((wd) => {
                                        const isCurrentWeek = wd.week === groupDetailData.currentWeek
                                        return (
                                          <div key={wd.week} className="text-center">
                                            <div className="h-1 bg-muted/60 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full ${isCurrentWeek ? 'bg-gradient-to-r from-[#E14227] to-[#D4956B]' : wd.achievement >= 100 ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`}
                                                style={{ width: `${Math.min(wd.achievement, 100)}%` }}
                                              />
                                            </div>
                                            <p className={`text-[7px] font-semibold mt-0.5 ${isCurrentWeek ? 'text-[#E14227]' : 'text-muted-foreground'}`}>
                                              W{wd.week} {wd.achievement}%
                                            </p>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
