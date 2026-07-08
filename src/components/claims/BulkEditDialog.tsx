'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Pencil, Loader2, X, Search, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import type { Crew } from '@/lib/cms-types'

interface BulkEditDialogProps {
  open: boolean
  onClose: () => void
  saleIds: string[]
  onSuccess: () => void
  crews: Crew[]
  programs: string[]
}

const EMPTY_FORM = {
  tanggal: '', dept: '', brand: '', modul: '', pembayaran: '', program: '', qty: '', settle: '', crewId: '',
}

export default function BulkEditDialog({ open, onClose, saleIds, onSuccess, crews, programs }: BulkEditDialogProps) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [crewSearch, setCrewSearch] = useState('')
  const [showCrewDropdown, setShowCrewDropdown] = useState(false)
  const crewDropdownRef = useRef<HTMLDivElement>(null)

  const selectedCrew = useMemo(() => {
    if (!form.crewId) return null
    return crews.find(c => c.id === form.crewId) || null
  }, [form.crewId, crews])

  const filteredCrews = useMemo(() => {
    if (!crewSearch) return crews.slice(0, 20)
    const q = crewSearch.toLowerCase()
    return crews.filter(c => c.name.toLowerCase().includes(q) || c.employeeId.toLowerCase().includes(q)).slice(0, 20)
  }, [crews, crewSearch])

  // Count active (filled) fields
  const activeFields = useMemo(() => {
    return Object.entries(form).filter(([k, v]) => v !== '' && !(k === 'crewId' && !v)).length
  }, [form])

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setCrewSearch('')
    setShowCrewDropdown(false)
  }

  // Close crew dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (crewDropdownRef.current && !crewDropdownRef.current.contains(e.target as Node)) {
        setShowCrewDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSave = async () => {
    if (activeFields === 0) {
      toast.error('Isi minimal 1 field untuk diubah')
      return
    }

    // Build updates object — only include filled fields
    const updates: Record<string, string | number | null> = {}
    if (form.tanggal) updates.tanggal = form.tanggal
    if (form.dept) updates.dept = form.dept
    if (form.brand) updates.brand = form.brand
    if (form.modul) updates.modul = form.modul
    if (form.pembayaran) updates.pembayaran = form.pembayaran
    if (form.program) updates.program = form.program
    if (form.qty) updates.qty = Number(form.qty)
    if (form.settle) updates.settle = Number(form.settle)
    if (form.crewId) updates.crewId = form.crewId

    setSaving(true)
    try {
      const res = await fetch('/api/claims/bulk-edit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds, updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal')

      toast.success(`✅ ${data.updated} penjualan berhasil diubah`)
      resetForm()
      onClose()
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah data')
    } finally {
      setSaving(false)
    }
  }

  const removeField = (field: string) => {
    setForm(f => ({ ...f, [field]: field === 'crewId' ? '' : '' }))
  }

  const updateField = (field: string, value: string) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  // Field config for the form
  const fields = [
    { key: 'tanggal', label: 'Tanggal', type: 'date', placeholder: 'YYYY-MM-DD' },
    { key: 'dept', label: 'Dept', type: 'text', placeholder: 'Dept...' },
    { key: 'brand', label: 'Brand', type: 'text', placeholder: 'Brand...' },
    { key: 'modul', label: 'Modul', type: 'text', placeholder: 'Modul...' },
    { key: 'pembayaran', label: 'Pembayaran', type: 'text', placeholder: 'Pembayaran...' },
    { key: 'program', label: 'Program', type: 'select', placeholder: 'Pilih program' },
    { key: 'qty', label: 'Qty', type: 'number', placeholder: '0' },
    { key: 'settle', label: 'Settle', type: 'number', placeholder: '0' },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { resetForm(); onClose() } }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#E14227] to-[#9DB1CC] flex items-center justify-center shadow-md">
              <Pencil className="w-4 h-4 text-white" />
            </div>
            <span>Edit {saleIds.length} Penjualan</span>
          </DialogTitle>
          <DialogDescription>
            Isi field yang ingin diubah. Field kosong = tidak diubah.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Active fields indicator */}
          {activeFields > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px] bg-[#E14227]/10 text-[#E14227] border-[#E14227]/20">
                {activeFields} field aktif
              </Badge>
              <span>akan diterapkan ke {saleIds.length} data</span>
            </div>
          )}

          {/* Field inputs */}
          <div className="grid grid-cols-2 gap-3">
            {fields.map(field => (
              <div key={field.key} className={`space-y-1 ${field.key === 'tanggal' ? 'col-span-2' : ''}`}>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">{field.label}</Label>
                  {form[field.key as keyof typeof form] && (
                    <button onClick={() => removeField(field.key)} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                {field.type === 'select' ? (
                  <Select value={form[field.key as keyof typeof form] || ''} onValueChange={v => updateField(field.key, v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.map(p => (
                        <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type}
                    value={form[field.key as keyof typeof form]}
                    onChange={e => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="h-9 text-xs"
                    step={field.type === 'number' ? 'any' : undefined}
                    min={field.type === 'number' ? 0 : undefined}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Crew reassignment */}
          <div className="space-y-1 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Reassign Crew</Label>
              {form.crewId && (
                <button onClick={() => removeField('crewId')} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {selectedCrew ? (
              <div className="flex items-center gap-2 h-9 px-2 rounded-md border bg-muted/30">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={selectedCrew.photo || ''} />
                  <AvatarFallback className="text-[8px]">{selectedCrew.name[0]}</AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium flex-1 truncate">{selectedCrew.name}</span>
                <button onClick={() => { setForm(f => ({ ...f, crewId: '' })); setCrewSearch('') }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative" ref={crewDropdownRef}>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={crewSearch}
                    onChange={e => { setCrewSearch(e.target.value); setShowCrewDropdown(true) }}
                    onFocus={() => setShowCrewDropdown(true)}
                    placeholder="Cari crew..."
                    className="h-9 text-xs pl-8"
                  />
                </div>
                {showCrewDropdown && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover shadow-lg">
                    {filteredCrews.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">Crew tidak ditemukan</div>
                    ) : (
                      filteredCrews.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setForm(f => ({ ...f, crewId: c.id })); setCrewSearch(c.name); setShowCrewDropdown(false) }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent transition-colors text-left"
                        >
                          <Avatar className="w-6 h-6">
                            <AvatarImage src={c.photo || ''} />
                            <AvatarFallback className="text-[8px]">{c.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{c.employeeId}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Preview of changes */}
          {activeFields > 0 && (
            <div className="rounded-lg border border-dashed border-[#E6BAA3] dark:border-[#B8321E]/30 bg-[#E14227]/5 dark:bg-[#B8321E]/5 p-3 space-y-1">
              <p className="text-[10px] font-semibold text-[#E14227] uppercase tracking-wider">Preview Perubahan</p>
              <div className="flex flex-wrap gap-1.5">
                {form.tanggal && <Badge variant="outline" className="text-[10px]">Tanggal → {form.tanggal}</Badge>}
                {form.dept && <Badge variant="outline" className="text-[10px]">Dept → {form.dept}</Badge>}
                {form.brand && <Badge variant="outline" className="text-[10px]">Brand → {form.brand}</Badge>}
                {form.modul && <Badge variant="outline" className="text-[10px]">Modul → {form.modul}</Badge>}
                {form.pembayaran && <Badge variant="outline" className="text-[10px]">Bayar → {form.pembayaran}</Badge>}
                {form.program && <Badge variant="outline" className="text-[10px]">Program → {form.program}</Badge>}
                {form.qty && <Badge variant="outline" className="text-[10px]">Qty → {form.qty}</Badge>}
                {form.settle && <Badge variant="outline" className="text-[10px]">Settle → {Number(form.settle).toLocaleString('id-ID')}</Badge>}
                {selectedCrew && <Badge variant="outline" className="text-[10px]">Crew → {selectedCrew.name}</Badge>}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { resetForm(); onClose() }} disabled={saving} className="text-xs">
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || activeFields === 0}
            className="bg-gradient-to-r from-[#E14227] to-[#9DB1CC] hover:from-[#B8321E] hover:to-[#7E95B3] text-white shadow-md shadow-[#E14227]/20 text-xs gap-1.5"
          >
            {saving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Menyimpan...</>
            ) : (
              <><Pencil className="w-3.5 h-3.5" /> Simpan Perubahan</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}