// ─── CMS Crew Management System — Shared Types ─────────

export interface CrewStat {
  id: string; name: string; photo: string | null; employeeId: string
  groupId: string; groupName: string; groupLogo: string | null
  todayTotal: number; todayQty: number; todayStruk: number
  weekTotal: number; weekQty: number; weekStruk: number
  monthTotal: number; monthQty: number; monthStruk: number
  allTimeTotal: number; allTimeQty: number; allTimeStruk: number
  transactionCount: number
  // Target info derived from group (monthlyTarget / crewCount)
  crewMonthlyTarget: number
  crewMonthlyAchievement: number // percentage
  crewWeeklyTargets: number[] // [W1, W2, W3, W4, W5] target amounts
  crewCurrentWeekTarget: number // this week's target amount
  crewWeeklyAchievement: number // percentage vs current week target
  // Per-week achievements for this crew (all 5 weeks)
  crewWeeklyDetails: Array<{
    week: number // 1-5
    targetPct: number // e.g. 25 means 25%
    target: number // target Rp for this crew this week
    total: number // actual sales Rp for this crew this week
    achievement: number // percentage achieved
    dateFrom: number // start day of month
    dateTo: number // end day of month
  }>
  currentWeek: number
  // Shift hari ini dari jadwal (null = belum dijadwalkan) — dari target engine
  crewShiftToday?: string | null
  // Target harian crew hari ini (dari target engine, realtime)
  crewTodayTarget?: number
  // Group raw targets for reference
  groupMonthlyTarget: number
  groupWeeklyTargetPcts: number[] // [W1%, W2%, W3%, W4%, W5%]
}

export interface GroupAchievement {
  id: string; name: string; logo: string | null
  monthlyTarget: number; monthlyTotal: number; tiktokMonthlyTotal: number; monthlyAchievement: number
  weeklyTarget: number; weeklyTotal: number; weeklyAchievement: number
  weekTargetPct: number; currentWeek: number; crewCount: number
  // Persentase alokasi zoning (dari StoreConfig) — null jika engine tidak aktif
  allocationPct?: number | null
  // Per-crew target breakdown
  crewMonthlyTarget: number // monthlyTarget / crewCount
  weeklyTargetPcts: number[] // [W1%, W2%, W3%, W4%, W5%]
  crewWeeklyTargets: number[] // [W1, W2, W3, W4, W5] per-crew amounts
  // Per-week achievements (all 5 weeks)
  weeklyDetails: Array<{
    week: number // 1-5
    targetPct: number // e.g. 25 means 25%
    target: number // actual Rp target for this group
    total: number // actual sales Rp for this week (Store + TikTok)
    tiktokTotal: number // TikTok-only sales Rp for this week
    achievement: number // percentage achieved
    dateFrom: number // start day of month
    dateTo: number // end day of month
  }>
}

export interface RecentSale {
  id: string; tanggal: string; kodeExtend: string; qty: number; settle: number
  crew: { name: string; photo: string | null; group: { name: string } }
}

export interface TrendData {
  previousValue: number; changePercent: number | null; direction: 'up' | 'down' | 'same'
}

export interface DashboardData {
  /** true = target crew dari engine breakdown Toko→Zoning→Shift→Crew */
  engineActive: boolean
  crewStats: CrewStat[]; totals: {
    // Claimed-only period totals (sales assigned to crews)
    today: number; week: number; month: number; todayQty: number; weekQty: number; monthQty: number
    // ALL imported data totals (from Excel, including unclaimed)
    totalTransactions: number; totalSettle: number; totalQty: number
    importedToday: number; importedTodayQty: number
    importedWeek: number; importedWeekQty: number
    importedMonth: number; importedMonthQty: number
    // TikTok totals (Pengiriman + Selesai)
    tiktokToday: number; tiktokTodayQty: number
    tiktokWeek: number; tiktokWeekQty: number
    tiktokMonth: number; tiktokMonthQty: number
    tiktokAllTime: number
    // TikTok weekly breakdown
    tiktokWeeklyBreakdown: Array<{ week: number; settle: number; qty: number; count: number; dateFrom: number; dateTo: number }>
  }
  trends: { today: TrendData; week: TrendData; month: TrendData }
  groupAchievements: GroupAchievement[]; topCrews: CrewStat[]; recentSales: RecentSale[]
  dateInfo: { today: string; currentWeek: number; weekStart: number; weekEnd: number; currentMonth: number; currentYear: number }
  lastWeekTotals: { settle: number; qty: number; transactions: number } | null
  claimedCount: number; unclaimedCount: number
}

export interface Crew {
  id: string; name: string; photo: string | null; employeeId: string; groupId: string
  group: { id: string; name: string }; totalSales: number; totalQty: number; todaySales: number; transactionCount: number
}

export interface Group {
  id: string; name: string; logo: string | null; monthlyTarget: number
  week1Target: number; week2Target: number; week3Target: number; week4Target: number; week5Target: number
  tiktokActive: boolean
  crewCount: number; crews: Crew[]
}

export interface ClaimSale {
  id: string; tanggal: string; kodeExtend: string; qty: number; settle: number
  idPenjualan: string | null
  brand: string; dept: string; modul: string; program: string; pembayaran: string
  createdAt: string; claimedAt: string | null
  crew: { id: string; name: string; employeeId: string; photo: string | null } | null
}

export interface GroupDetailCrew {
  id: string; name: string; photo: string | null; employeeId: string
  totalQty: number; totalSettle: number; totalStruk: number
  basketSize: number; pricePoint: number; itemCount: number
  // Target info (per-crew — dari target engine bila aktif)
  crewMonthlyTarget: number
  crewCurrentWeekTarget: number
  crewShiftToday?: string | null
  // Target harian crew hari ini (dari target engine, realtime)
  crewTodayTarget?: number
  crewMonthlyAchievement: number
  crewWeeklyAchievement: number
  // Per-week achievements (all 5 weeks)
  crewWeeklyDetails: Array<{
    week: number
    targetPct: number
    target: number
    total: number
    achievement: number
    dateFrom: number
    dateTo: number
  }>
}

export interface GroupDetailData {
  group: { id: string; name: string; logo: string | null; monthlyTarget: number; allocationPct?: number | null }
  period: string; periodKey: string
  crews: GroupDetailCrew[]
  groupTotal: { qty: number; settle: number; struk: number; basketSize: number; pricePoint: number }
  // Target info
  crewMonthlyTarget: number // monthlyTarget / crewCount
  weeklyTargetPcts: number[] // [W1%, W2%, W3%, W4%, W5%]
  crewWeeklyTargets: number[] // [W1, W2, W3, W4, W5] per-crew amounts
  currentWeek: number
  // Target harian (engine realtime Toko→Zoning→Shift→Crew)
  engineActive?: boolean
  todayIso?: string // yyyy-mm-dd WIB
  groupTodayTarget?: number // target harian zoning hari ini
  // Detail Report Summary — Penjualan Brand & Dept (isolated per zoning, claim crew only)
  reportSummary: {
    rows: Array<{ brand: string; dept: string; qty: number; netto: number; struk: number }>
    totalQty: number
    totalNetto: number
  }
}

export interface ScanResult {
  tanggal: string; kodeExtend: string; qty: number; settle: number
  brand: string; dept: string; modul: string; pembayaran: string; program: string
}

/** Shape of persisted claim filters in localStorage */
export interface ClaimFilters {
  claimDateFrom: string
  claimDateTo: string
  claimSearch: string
  claimFilterProgram: string
  claimFilterCrew: string
  claimShowClaimed: 'unclaimed' | 'claimed' | 'all'
}

/** Delete confirmation dialog state */
export interface DeleteConfirmState {
  type: 'crew' | 'group' | 'sale' | 'batch-sale'
  ids?: string[]
  id?: string
  name: string
}

// ─── Target Breakdown (Toko → Zoning → Shift → Crew) ───────────────────────

export interface ShiftTypeItem {
  id: string; code: string; label: string; weight: number
  sortOrder: number; isActive: boolean
}

export interface StoreConfigData {
  id?: string
  monthlyTarget: number
  week1Pct: number; week2Pct: number; week3Pct: number; week4Pct: number; week5Pct: number
  /** Bobot relatif per hari (Senin..Minggu) — Σ bebas, dinormalisasi engine */
  dayPcts?: number[]
  updatedAt?: string
}

export interface GroupAllocationItem {
  id: string; name: string; logo: string | null
  allocationPct: number
  derivedMonthlyTarget: number
  crewCount: number
}

export interface BreakdownCrewRow {
  id: string; name: string; employeeId: string; photo: string | null
  shiftCode: string | null // null = belum dijadwalkan
  shiftLabel: string | null
  shiftWeight: number
  todayTarget: number
  weeklyTarget: number
  monthlyTarget: number
}

export interface BreakdownGroupRow {
  id: string; name: string; logo: string | null
  allocationPct: number
  monthlyTarget: number
  weeklyTarget: number
  todayTarget: number
  unassignedToday: number // target tak terdistribusi (semua crew Off)
  legacyEqualSplitToday: boolean // fallback split rata (belum ada jadwal)
  sumCrewToday: number
  balancedToday: boolean
  crews: BreakdownCrewRow[]
}

export interface BreakdownData {
  engineActive: boolean
  message?: string
  year: number; month: number; daysInMonth: number
  focusDate: string; focusWeek: number
  config: { monthlyTarget: number; weekPcts: number[]; dayPcts?: number[] } | null
  shiftTypes: ShiftTypeItem[]
  allocationSum: number
  store: {
    monthlyTarget: number
    weeklyTargets: number[]
    weeklyPcts: number[]
    todayTarget: number
    dailyTargets: Array<{ date: string; day: number; week: number; target: number }>
  } | null
  groups: BreakdownGroupRow[]
  checks: {
    today: { sumCrew: number; sumGroup: number; store: number; balanced: boolean }
    monthly: { sumCrew: number; sumGroup: number; store: number; balanced: boolean }
  } | null
}

export interface ScheduleEntry {
  crewId: string; tanggal: string; shiftCode: string | null
}

export interface ScheduleData {
  year: number; month: number; daysInMonth: number
  crews: Array<{
    id: string; name: string; employeeId: string; photo: string | null
    groupId: string; group: { id: string; name: string }
  }>
  shiftTypes: ShiftTypeItem[]
  shifts: ScheduleEntry[]
}
