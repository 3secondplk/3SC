// ─── CMS Crew Management System — Weekly Target Resolver ─────────
//
// Group week targets (week1Target..week5Target) were designed to be
// PERCENTAGES of the monthly target (see GroupForm: "Target Mingguan (%)").
// However some data (e.g. imported/legacy seeds) stores ABSOLUTE nominal
// Rp values instead — which made the achievement progress bars compute
// absurd targets (monthlyTarget × 35.000.000 / 100) and always show 0%.
//
// This resolver auto-detects the mode:
//   - "pct"     : every value ≤ 100  → week target = monthlyTarget × val / 100
//   - "nominal" : any value > 100    → week target = the value itself (Rp)
// and always returns both the absolute Rp amount per week and a display
// percentage per week (derived from the monthly target in nominal mode).

export type WeekTargetMode = 'pct' | 'nominal'

export interface ResolvedWeekTargets {
  mode: WeekTargetMode
  /** Display percentage per week (rounded). In nominal mode it is derived from monthlyTarget. */
  pcts: number[]
  /** Absolute Rp target per week. */
  amounts: number[]
}

export function resolveWeekTargets(
  monthlyTarget: number,
  weekTargets: number[],
): ResolvedWeekTargets {
  const vals = weekTargets.map(v => Number(v) || 0)

  // A single weekly allocation above 100 cannot be a percentage → nominal Rp
  const isNominal = vals.some(v => v > 100)

  if (isNominal) {
    const amounts = vals.map(v => Math.round(v))
    const pcts = monthlyTarget > 0
      ? amounts.map(a => Math.round((a / monthlyTarget) * 100))
      : vals.map(() => 0)
    return { mode: 'nominal', pcts, amounts }
  }

  return {
    mode: 'pct',
    pcts: vals,
    amounts: vals.map(p => Math.round((monthlyTarget * p) / 100)),
  }
}
