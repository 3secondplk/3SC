'use client'

import React, { useState } from 'react'
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Target, Layers, DollarSign, CalendarDays, AlertCircle, Check, X, Save } from 'lucide-react'
import { fmtRp } from '@/lib/cms-utils'
import { getWIBDate } from '@/lib/cms-utils'
import type { Group } from '@/lib/cms-types'

// ─── Helper: Get current week of month ───────────────────
function getCurrentWeek(): number {
  const day = getWIBDate().getDate()
  const daysInMonth = new Date(getWIBDate().getFullYear(), getWIBDate().getMonth() + 1, 0).getDate()
  if (day <= 7) return 1
  if (day <= 14) return 2
  if (day <= 21) return 3
  if (day <= 28) return 4
  return 5
}

// Week date ranges: W1=1-7, W2=8-14, W3=15-21, W4=22-28, W5=29-31
const weekDateRanges = [
  '1–7',
  '8–14',
  '15–21',
  '22–28',
  '29–31',
]

const weekBlockColors = [
  'border-[#E14227]/40 bg-[#F0D5C5]/80 dark:border-[#B8321E] dark:bg-[#1A1A1B]/30',
  'border-[#E6BAA3] bg-[#F0D5C5]/80 dark:border-[#E6BAA3] dark:bg-[#1A1A1B]/30',
  'border-[#9DB1CC] bg-[#B5C7DB]/80 dark:border-[#9DB1CC] dark:bg-[#1A1A1B]/30',
  'border-[#D4956B] bg-[#F0D5C5]/80 dark:border-[#D4956B] dark:bg-[#1A1A1B]/30',
  'border-[#B87333] bg-[#D4956B]/80 dark:border-[#B87333] dark:bg-[#1A1A1B]/30',
]

const weekActiveRingColors = [
  'ring-[#E14227] shadow-[#E14227]/20 dark:ring-[#F07050] dark:shadow-[#B8321E]/40',
  'ring-[#E6BAA3] shadow-[#E6BAA3]/20 dark:ring-[#E6BAA3] dark:shadow-[#E6BAA3]/40',
  'ring-[#9DB1CC] shadow-[#9DB1CC]/20 dark:ring-[#9DB1CC] dark:shadow-[#9DB1CC]/40',
  'ring-[#D4956B] shadow-[#D4956B]/20 dark:ring-[#D4956B] dark:shadow-[#D4956B]/40',
  'ring-[#B87333] shadow-[#B87333]/20 dark:ring-[#B87333] dark:shadow-[#B87333]/40',
]

const weekIcons = [
  'text-[#B8321E]',
  'text-[#C49060]',
  'text-[#7E95B3]',
  'text-[#B87D4F]',
  'text-[#B87333]',
]

export default function GroupForm({ group, onSave, onCancel }: {
  group?: Group
  onSave: (data: { name: string; logo: string; monthlyTarget: number; week1Target: number; week2Target: number; week3Target: number; week4Target: number; week5Target: number }) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: group?.name || '',
    logo: group?.logo || '',
    monthlyTarget: group?.monthlyTarget?.toString() || '',
    week1Target: group?.week1Target?.toString() || '20',
    week2Target: group?.week2Target?.toString() || '25',
    week3Target: group?.week3Target?.toString() || '25',
    week4Target: group?.week4Target?.toString() || '20',
    week5Target: group?.week5Target?.toString() || '10',
  })
  const [touched, setTouched] = useState(false)

  const currentWeek = getCurrentWeek()

  const weekKeys = ['week1Target', 'week2Target', 'week3Target', 'week4Target', 'week5Target'] as const
  const weekLabels = ['W1', 'W2', 'W3', 'W4', 'W5']

  const totalPct = weekKeys.reduce((sum, key) => sum + (Number(form[key]) || 0), 0)

  const monthlyTargetNum = Number(form.monthlyTarget) || 0

  const weekAllocations = (() => {
    if (!monthlyTargetNum || totalPct === 0) return weekKeys.map(() => 0)
    return weekKeys.map(key => {
      const pct = Number(form[key]) || 0
      return Math.round((pct / 100) * monthlyTargetNum)
    })
  })()

  const handleSubmit = () => {
    setTouched(true)
    if (!form.name) return
    onSave({
      name: form.name,
      logo: form.logo,
      monthlyTarget: monthlyTargetNum,
      week1Target: Number(form.week1Target) || 0,
      week2Target: Number(form.week2Target) || 0,
      week3Target: Number(form.week3Target) || 0,
      week4Target: Number(form.week4Target) || 0,
      week5Target: Number(form.week5Target) || 0,
    })
  }

  return (
    <>
      <DialogHeader className="dialog-header-gradient pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#E14227] to-[#D4956B] flex items-center justify-center shadow-lg shadow-[#E14227]/25 flex-shrink-0">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <DialogTitle className="text-lg">{group ? 'Edit Group' : 'Tambah Group Baru'}</DialogTitle>
            <DialogDescription className="text-xs mt-0.5">
              {group ? 'Perbarui target dan konfigurasi group' : 'Atur target penjualan mingguan dan bulanan'}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-3">
        {/* Group Name */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#E14227]" />
            Nama Group <span className="text-destructive text-[10px]">*</span>
          </Label>
          <div className="relative">
            <Input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Zone A - Premium"
              className={`pl-9 ${touched && !form.name ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : ''}`}
            />
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
            {touched && !form.name && (
              <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Nama group wajib diisi
              </p>
            )}
          </div>
        </div>

        {/* Logo URL */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#E14227]" />
            Logo (URL)
          </Label>
          <div className="relative">
            <Input
              value={form.logo}
              onChange={e => setForm({ ...form, logo: e.target.value })}
              placeholder="https://example.com/logo.png"
              className="pl-9"
            />
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
          </div>
        </div>

        {/* Monthly Target with Rp Preview */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-[#E14227]" />
            Target Bulanan (Rp) <span className="text-destructive text-[10px]">*</span>
          </Label>
          <div className="relative">
            <Input
              type="number"
              value={form.monthlyTarget}
              onChange={e => setForm({ ...form, monthlyTarget: e.target.value })}
              placeholder="50000000"
              className="pl-9 font-mono text-sm"
            />
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50 pointer-events-none" />
          </div>
          {monthlyTargetNum > 0 && (
            <div className="mt-1.5 px-3 py-2 rounded-lg bg-[#F0D5C5] dark:bg-[#1A1A1B]/30 border border-[#E6BAA3]/60 dark:border-[#B8321E]/40">
              <p className="text-[11px] text-muted-foreground mb-0.5">Preview target bulanan:</p>
              <p className="text-sm font-bold gradient-text tabular-nums">{fmtRp(monthlyTargetNum)}</p>
            </div>
          )}
        </div>

        <Separator />

        {/* Weekly Targets */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#E14227]" />
            <p className="text-sm font-semibold">Target Mingguan (%)</p>
            <span className="text-[10px] text-muted-foreground ml-auto">W1–W4 = 7 hari, W5 = sisa hari</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {weekKeys.map((key, i) => {
              const isCurrentWeek = i + 1 === currentWeek
              const val = Number(form[key]) || 0
              const allocation = weekAllocations[i]

              return (
                <div
                  key={key}
                  className={`relative rounded-xl border-2 p-2.5 text-center transition-all ${
                    weekBlockColors[i]
                  } ${
                    isCurrentWeek
                      ? `${weekActiveRingColors[i]} ring-2 shadow-lg scale-[1.02]`
                      : ''
                  }`}
                >

                  <div className="flex items-center justify-center gap-1 mb-1.5">
                    <span className={`text-[10px] font-bold ${weekIcons[i]}`}>{weekLabels[i]}</span>
                  </div>
                  <p className="text-[8px] text-muted-foreground mb-1.5">
                    {weekDateRanges[i]}
                  </p>
                  <Input
                    type="number"
                    value={form[key]}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className={`text-center h-9 text-sm font-semibold bg-white/80 dark:bg-[#1A1A1B]/80 border-white/60 dark:border-[#1A1A1B]/60 ${
                      val < 0 ? 'border-destructive' : ''
                    }`}
                  />
                  {allocation > 0 && (
                    <p className="text-[9px] text-muted-foreground mt-1.5 font-mono tabular-nums">
                      {fmtRp(allocation)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Total percentage indicator */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border bg-muted/30">
            <span className="text-xs text-muted-foreground">Total distribusi target</span>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold tabular-nums ${
                totalPct === 100
                  ? 'text-[#B8321E] dark:text-[#F07050]'
                  : totalPct > 100
                    ? 'text-[#C49060] dark:text-[#E6BAA3]'
                    : 'text-destructive'
              }`}>
                {totalPct}%
              </span>
              {totalPct === 100 ? (
                <Check className="w-4 h-4 text-[#B8321E]" />
              ) : totalPct > 100 ? (
                <AlertCircle className="w-4 h-4 text-[#C49060]" />
              ) : (
                <X className="w-4 h-4 text-destructive" />
              )}
            </div>
          </div>
        </div>

        {/* Target Summary */}
        {form.name && monthlyTargetNum > 0 && totalPct > 0 && (
          <div className="rounded-xl border bg-gradient-to-br from-[#F0D5C5]/80 to-[#B5C7DB]/50 dark:from-[#1A1A1B]/20 dark:to-[#1A1A1B]/10 p-3 space-y-2">
            <p className="text-xs font-semibold text-[#B8321E] dark:text-[#E6BAA3] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Ringkasan Target
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Group</span>
                <span className="font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bulanan</span>
                <span className="font-semibold gradient-text tabular-nums">{fmtRp(monthlyTargetNum)}</span>
              </div>
              {weekKeys.map((key, i) => (
                <div key={key} className="flex justify-between">
                  <span className="text-muted-foreground">{weekLabels[i]} <span className="text-[9px] opacity-60">({weekDateRanges[i]})</span></span>
                  <span className="font-medium tabular-nums">{fmtRp(weekAllocations[i])}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0 sm:justify-between">
        <p className="text-[10px] text-muted-foreground order-2 sm:order-1">
          <span className="text-destructive">*</span> Target bulanan wajib diisi
        </p>
        <div className="flex items-center gap-2 order-1 sm:order-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="text-xs hover:bg-muted/80"
          >
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!form.name}
            className="bg-gradient-to-r from-[#B8321E] to-[#9DB1CC] hover:from-[#B8321E] hover:to-[#7E95B3] text-white shadow-md shadow-[#E14227]/25 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed transition-all text-xs"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {group ? 'Simpan Perubahan' : 'Tambah Group'}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}