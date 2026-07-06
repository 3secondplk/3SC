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
  // Group raw targets for reference
  groupMonthlyTarget: number
  groupWeeklyTargetPcts: number[] // [W1%, W2%, W3%, W4%, W5%]
}

export interface GroupAchievement {
  id: string; name: string; logo: string | null
  monthlyTarget: number; monthlyTotal: number; monthlyAchievement: number
  weeklyTarget: number; weeklyTotal: number; weeklyAchievement: number
  weekTargetPct: number; currentWeek: number; crewCount: number
  // Per-crew target breakdown
  crewMonthlyTarget: number // monthlyTarget / crewCount
  weeklyTargetPcts: number[] // [W1%, W2%, W3%, W4%, W5%]
  crewWeeklyTargets: number[] // [W1, W2, W3, W4, W5] per-crew amounts
  // Per-week achievements (all 5 weeks)
  weeklyDetails: Array<{
    week: number // 1-5
    targetPct: number // e.g. 25 means 25%
    target: number // actual Rp target for this group
    total: number // actual sales Rp for this week
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
  crewStats: CrewStat[]; totals: {
    // Claimed-only period totals (sales assigned to crews)
    today: number; week: number; month: number; todayQty: number; weekQty: number; monthQty: number
    // ALL imported data totals (from Excel, including unclaimed)
    totalTransactions: number; totalSettle: number; totalQty: number
    importedToday: number; importedTodayQty: number
    importedWeek: number; importedWeekQty: number
    importedMonth: number; importedMonthQty: number
    // TikTok totals (Selesai only)
    tiktokToday: number; tiktokTodayQty: number
    tiktokWeek: number; tiktokWeekQty: number
    tiktokMonth: number; tiktokMonthQty: number
    tiktokAllTime: number
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
  // Target info
  crewMonthlyTarget: number
  crewCurrentWeekTarget: number
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
  group: { id: string; name: string; logo: string | null; monthlyTarget: number }
  period: string; periodKey: string
  crews: GroupDetailCrew[]
  groupTotal: { qty: number; settle: number; struk: number; basketSize: number; pricePoint: number }
  // Target info
  crewMonthlyTarget: number // monthlyTarget / crewCount
  weeklyTargetPcts: number[] // [W1%, W2%, W3%, W4%, W5%]
  crewWeeklyTargets: number[] // [W1, W2, W3, W4, W5] per-crew amounts
  currentWeek: number
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
