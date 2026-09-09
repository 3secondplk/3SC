'use client'

import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  LayoutDashboard, Upload, Settings, Search, FileUp, Download, Moon,
  Keyboard, CornerDownLeft, HelpCircle, ArrowRight,
} from 'lucide-react'

// Detect Mac for ⌘ vs Ctrl display
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)

function modKey(label: string) {
  return isMac ? `⌘${label}` : `Ctrl+${label}`
}

// Styled keyboard key badge
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-muted border border-border text-[10px] font-mono font-medium leading-none">
      {children}
    </kbd>
  )
}

// Shortcut row
function ShortcutRow({ keys, description }: { keys: React.ReactNode[]; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 px-1">
      <span className="text-sm text-foreground/80">{description}</span>
      <div className="flex items-center gap-1 shrink-0">
        {keys.map((k, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="text-muted-foreground text-[10px]">+</span>}
            {k}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// Shortcut group
function ShortcutGroup({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-lg bg-[#E6BAA3] dark:bg-[#B8321E]/25 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-[#B8321E] dark:text-[#F07050]" />
        </div>
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h3>
      </div>
      <div className="space-y-0.5 pl-1 border-l-2 border-border/40 ml-2.5">
        {children}
      </div>
    </div>
  )
}

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function KeyboardShortcutsHelp({ open, onOpenChange }: KeyboardShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden glass-card">
        {/* Gradient header stripe */}
        <div className="h-1 bg-gradient-to-r from-[#E14227] via-[#9DB1CC] to-[#B8321E]" />

        <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E14227] to-[#7D95B5] flex items-center justify-center shadow-lg shadow-[#E14227]/20">
                <Keyboard className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-base">Keyboard Shortcuts</span>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  Navigate faster with keyboard shortcuts
                </p>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              List of all available keyboard shortcuts in the CMS application
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-4 sm:px-6 pb-5 sm:pb-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* Navigation */}
          <ShortcutGroup title="Navigation" icon={LayoutDashboard}>
            <ShortcutRow keys={[<Kbd key="1">1</Kbd>]} description="Switch to Dashboard" />
            <ShortcutRow keys={[<Kbd key="2">2</Kbd>]} description="Switch to Target & Jadwal" />
            <ShortcutRow keys={[<Kbd key="3">3</Kbd>]} description="Switch to Claims" />
            <ShortcutRow keys={[<Kbd key="4">4</Kbd>]} description="Switch to Export" />
            <ShortcutRow keys={[<Kbd key="5">5</Kbd>]} description="Switch to Management" />
            <ShortcutRow keys={[<Kbd key={modKey('K')}>{modKey('K')}</Kbd>]} description="Focus search input" />
          </ShortcutGroup>

          {/* Actions */}
          <ShortcutGroup title="Actions" icon={ArrowRight}>
            <ShortcutRow keys={[<Kbd key={modKey('U')}>{modKey('U')}</Kbd>]} description="Upload data (Claims tab)" />
            <ShortcutRow keys={[<Kbd key={modKey('E')}>{modKey('E')}</Kbd>]} description="Export CSV (Claims tab)" />
            <ShortcutRow keys={[<Kbd key="T">T</Kbd>]} description="Toggle theme" />
          </ShortcutGroup>

          {/* General */}
          <ShortcutGroup title="General" icon={HelpCircle}>
            <ShortcutRow keys={[<Kbd key="?">?</Kbd>]} description="Show this help panel" />
            <ShortcutRow keys={[<Kbd key="Esc">Esc</Kbd>]} description="Close dialog / Deselect all" />
          </ShortcutGroup>

          {/* Hint */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-muted/50 border border-border/40">
            <div className="w-5 h-5 rounded-md bg-muted flex items-center justify-center shrink-0">
              <HelpCircle className="w-3 h-3 text-muted-foreground" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Navigation shortcuts (<Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> <Kbd>T</Kbd> <Kbd>?</Kbd>) are disabled when typing in input fields or when a dialog is open.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
