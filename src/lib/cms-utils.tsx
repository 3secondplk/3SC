'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Medal, Trophy, Star, Award } from 'lucide-react'

// ─── Formatting Helpers ──────────────────────────────
export const fmtRp = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
export const fmtNum = (n: number) => new Intl.NumberFormat('id-ID').format(n)

// ─── Animation Presets ───────────────────────────────
export const fadeIn = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 } }
export const stagger = { animate: { transition: { staggerChildren: 0.06 } } }

// ─── WIB Date Helpers ────────────────────────────────
export function getWIBDate() {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utc + 7 * 3600000)
}

export function getWIBToday() {
  const d = getWIBDate()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
export const currentYear = new Date().getFullYear()

// ─── Smart Pagination Helper ─────────────────────────
export function getPageNumbers(currentPage: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (currentPage > 3) pages.push('...')
  const start = Math.max(2, currentPage - 2)
  const end = Math.min(totalPages - 1, currentPage + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  if (currentPage < totalPages - 2) pages.push('...')
  pages.push(totalPages)
  return pages
}

// ─── Claim Page Helpers ──────────────────────────────
export function timeAgo(dateStr: string): string {
  const ago = Date.now() - new Date(dateStr).getTime()
  if (ago < 60000) return 'baru saja'
  if (ago < 3600000) return `${Math.floor(ago / 60000)}m lalu`
  if (ago < 86400000) return `${Math.floor(ago / 3600000)}j lalu`
  return new Date(dateStr).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const deptColorMap = ['bg-[#E14227]', 'bg-amber-500', 'bg-purple-500', 'bg-[#9DB1CC]', 'bg-rose-500', 'bg-indigo-500', 'bg-[#9DB1CC]', 'bg-orange-500']
export function getDeptColor(dept: string): string {
  let hash = 0
  for (let i = 0; i < dept.length; i++) hash = dept.charCodeAt(i) + ((hash << 5) - hash)
  return deptColorMap[Math.abs(hash) % deptColorMap.length]
}

/** Helper: calculate week ranges for a given month.
 *  W1=1-7, W2=8-14, W3=15-21, W4=22-28, W5=29-end of month (only if month has 29+ days)
 *  Returns array of {week, start, end} for weeks that exist in the month.
 */
export function getWeekRangesForMonth(year: number, month: number): Array<{ week: number; start: number; end: number }> {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const ranges: Array<{ week: number; start: number; end: number }> = [
    { week: 1, start: 1, end: 7 },
    { week: 2, start: 8, end: 14 },
    { week: 3, start: 15, end: 21 },
    { week: 4, start: 22, end: 28 },
  ]
  if (daysInMonth > 28) {
    ranges.push({ week: 5, start: 29, end: daysInMonth })
  }
  return ranges
}

/** Get current week number (1-5) for a given date */
export function getWeekNumber(dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 7) return 1
  if (dayOfMonth <= 14) return 2
  if (dayOfMonth <= 21) return 3
  if (dayOfMonth <= 28) return 4
  return 5
}

export function getWeekRange(): { from: string; to: string } {
  const now = getWIBDate()
  const dayOfMonth = now.getDate()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()
  const currentWeek = getWeekNumber(dayOfMonth, daysInMonth)

  const ranges = getWeekRangesForMonth(currentYear, currentMonth)
  const wr = ranges.find(r => r.week === currentWeek)!

  const fmt = (d: number) => `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { from: fmt(wr.start), to: fmt(wr.end) }
}

export function getMonthRange(): { from: string; to: string } {
  const now = getWIBDate()
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const fmt = (d: number) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { from: fmt(1), to: fmt(lastDay) }
}

// ─── Safe Fetch with Timeout (8s) ────────────────────
export async function safeFetch(url: string, opts?: RequestInit, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ─── localStorage Filter Persistence ─────────────────
const STORAGE_KEY = 'cms-claim-filters'

export function loadClaimFilters(): Record<string, string> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveClaimFilters(filters: Record<string, string>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // Silently fail if localStorage is full or blocked
  }
}

// ─── Small Shared Components ─────────────────────────

export function AnimatedCounter({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const isNeg = value < 0
    let start = 0
    const end = Math.abs(value)
    const duration = 1200
    const stepTime = 16
    const steps = duration / stepTime
    const increment = end / steps
    const timer = setInterval(() => {
      start += increment
      if (start >= end) { setDisplay(isNeg ? -end : end); clearInterval(timer) }
      else setDisplay(Math.floor(start) * (isNeg ? -1 : 1))
    }, stepTime)
    return () => clearInterval(timer)
  }, [value])
  return <span>{prefix}{fmtNum(Math.abs(display))}{suffix}</span>
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-muted rounded-full w-full" style={{ maxWidth: i === 0 ? '80px' : '120px' }} />
        </td>
      ))}
    </tr>
  )
}

export function SkeletonCard() {
  return (
    <div className="p-3 rounded-lg border bg-white dark:bg-gray-900 animate-pulse">
      <div className="h-3 bg-muted rounded-full w-3/4 mb-2" />
      <div className="grid grid-cols-2 gap-2">
        <div className="h-2.5 bg-muted rounded-full w-12" />
        <div className="h-2.5 bg-muted rounded-full w-20" />
        <div className="h-2.5 bg-muted rounded-full w-12" />
        <div className="h-2.5 bg-muted rounded-full w-16" />
      </div>
    </div>
  )
}

export function AchievementBadge({ pct }: { pct: number }) {
  let color = 'text-sky-600 bg-sky-100 dark:bg-sky-950/50 dark:text-sky-400'
  let label = 'Bronze'
  let icon = <Medal className="w-4 h-4" />
  let shimmer = ''
  if (pct >= 100) { color = 'text-amber-600 bg-amber-100 dark:bg-amber-950/50 dark:text-amber-400'; label = '🏆 Legend'; icon = <Trophy className="w-4 h-4" />; shimmer = 'badge-shimmer' }
  else if (pct >= 75) { color = 'text-purple-600 bg-purple-100 dark:bg-purple-950/50 dark:text-purple-400'; label = '💎 Diamond'; icon = <Star className="w-4 h-4" />; shimmer = 'badge-shimmer' }
  else if (pct >= 50) { color = 'text-yellow-600 bg-yellow-100 dark:bg-yellow-950/50 dark:text-yellow-400'; label = '🥇 Gold'; icon = <Award className="w-4 h-4" />; shimmer = 'badge-shimmer' }
  else if (pct >= 25) { color = 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400'; label = '🥈 Silver'; icon = <Medal className="w-4 h-4" /> }
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm ${color} ${shimmer}`}>{icon}{label}</span>
}

export function CircularProgress({ value, size = 100, strokeWidth = 8, showLabel = true }: { value: number; size?: number; strokeWidth?: number; showLabel?: boolean }) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (Math.min(value, 100) / 100) * circumference
  const clampedVal = Math.min(Math.max(value, 0), 100)

  let strokeColor = '#dc2626'
  if (clampedVal >= 75) strokeColor = '#E14227'
  else if (clampedVal >= 50) strokeColor = '#d97706'
  else if (clampedVal >= 25) strokeColor = '#0891b2'

  const fontSize = size < 30 ? 'text-[8px]' : size < 50 ? 'text-[10px]' : size < 70 ? 'text-xs' : 'text-lg'

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
        <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }} animate={{ strokeDashoffset: offset }} transition={{ duration: 1.2, ease: 'easeOut' }}
          strokeDasharray={circumference} />
      </svg>
      {showLabel && (
        <div className="absolute flex flex-col items-center justify-center">
          <span className={`font-bold ${fontSize}`} style={{ color: strokeColor }}>{Math.round(clampedVal)}%</span>
        </div>
      )}
    </div>
  )
}
