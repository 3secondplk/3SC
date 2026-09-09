// ─── CMS Crew Management System — Target Breakdown Engine ──────────────
//
// HIERARKI TARGET (realtime, tanpa snapshot):
//
//   Target Bulanan TOKO  (StoreConfig.monthlyTarget — sumber utama)
//     → Distribusi MINGGUAN   (week1..5Pct, Σ = 100%)
//       → Target HARIAN       (minggu dibagi rata ke tanggal dalam minggu tsb)
//         → ZONING / Group    (allocationPct, Σ = 100%)
//           → CREW HARIAN     (bobot shift dari ShiftType × jadwal CrewShift)
//
// BUSINESS RULE (dijamin oleh largest remainder allocation, uang integer Rupiah):
//   Σ Target Crew        = Target Group
//   Σ Target Group       = Target Toko
//   → tidak boleh ada selisih (0 Rupiah) di setiap level & periode.
//
// ATURAN PERIODE PER CREW (fix "target mingguan/bulanan sama rata"):
//   - Target MINGGUAN crew = Target mingguan GRUP ÷ jumlah crew di grup
//   - Target BULANAN  crew = Target bulanan  GRUP ÷ jumlah crew di grup
//   (split rata — TIDAK tergantung jadwal, karena jadwal antar crew tidak
//    selalu seimbang. Yang membedakan antar crew HANYA target HARIAN,
//    yang tetap mengikuti bobot shift per tanggal.)
//   Konsekuensi: Σ target harian satu crew selama seminggu ≠ target
//   mingguan crew tsb (ini BY DESIGN — harian operasional, mingguan/
//   bulanan porsi adil per crew).
//
// PRINSIP PENTING:
// - TIDAK ada snapshot target crew / histori assignment. Semua dihitung
//   realtime dari konfigurasi aktif + Crew.groupId + jadwal CrewShift.
// - Crew pindah zoning → otomatis mengikuti target zoning aktif saat ini.
// - Bobot shift CONFIGURABLE (tabel ShiftType), tidak di-hardcode.
// - Definisi minggu konsisten dengan app existing:
//   W1 = tgl 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–28, W5 = 29–akhir bulan.
//
// EDGE CASE (ditangani eksplisit):
// - Week 5 kosong (mis. Februari 28 hari) → bobot minggu tsb = 0, sisa
//   persentase otomatis terdistribusi ke minggu lain (largest remainder).
// - Grup tanpa SATU PUN baris jadwal pada tanggal tsb → fallback split
//   sama rata antar crew (perilaku legacy), agar app tetap jalan sebelum
//   jadwal diisi admin.
// - Grup dengan jadwal tapi Σ bobot = 0 (semua crew Off) → target grup
//   TIDAK terdistribusi (crew Off = 0). Jumlahnya dilaporkan eksplisit
//   via zeroWeightDates agar tidak ada "kebocoran" diam-diam.
// ────────────────────────────────────────────────────────────────────────

// ─────────────── Core: Largest Remainder Allocation ───────────────

/**
 * Membagi `total` (integer Rupiah) ke n penerima secara proporsional
 * terhadap `weights`, dengan garansi:
 *   - hasil integer
 *   - Σ hasil = total PERSIS (sisa pembulatan diberikan ke fraksi terbesar)
 *
 * weights boleh float (mis. persentase 33.3 atau bobot 0.5), tidak boleh
 * negatif (nilai negatif di-clamp ke 0).
 */
export function allocateByWeights(total: number, weights: number[]): number[] {
  const n = weights.length
  const result: number[] = new Array(n).fill(0)
  if (n === 0) return result

  const totalInt = Math.max(0, Math.round(Number(total) || 0))
  if (totalInt === 0) return result

  const safeWeights = weights.map(w => Math.max(0, Number(w) || 0))
  const sumW = safeWeights.reduce((s, w) => s + w, 0)

  // Semua bobot 0 → split sama rata (fallback aman)
  if (sumW <= 0) {
    const base = Math.floor(totalInt / n)
    let rem = totalInt - base * n
    for (let i = 0; i < n; i++) {
      result[i] = base + (rem > 0 ? 1 : 0)
      if (rem > 0) rem--
    }
    return result
  }

  const scaled = safeWeights.map(w => (totalInt * w) / sumW)
  const floors = scaled.map(v => Math.floor(v))
  let remainder = totalInt - floors.reduce((s, f) => s + f, 0)

  // Urutkan fraksi terbesar dulu → dapat +1 Rupiah
  const order = scaled
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  let k = 0
  while (remainder > 0) {
    result[order[k % n].i] += 1
    remainder--
    k++
  }
  // Guard float ekstrem (remainder negatif): tarik dari fraksi terkecil
  if (remainder < 0) {
    let j = 0
    while (remainder < 0) {
      result[order[order.length - 1 - (j % n)].i] -= 1
      remainder++
      j++
    }
  }

  for (let i = 0; i < n; i++) result[i] += floors[i]
  return result
}

// ─────────────── Calendar helpers (konsisten dengan app existing) ───────────────

/** Minggu ke-berapa dalam bulan (1–5): W1=1–7, W2=8–14, W3=15–21, W4=22–28, W5=29+ */
export function weekOfDay(dayOfMonth: number): number {
  if (dayOfMonth <= 7) return 1
  if (dayOfMonth <= 14) return 2
  if (dayOfMonth <= 21) return 3
  if (dayOfMonth <= 28) return 4
  return 5
}

/** Rentang tanggal [from, to] untuk minggu ke-`week` */
export function weekRange(week: number, daysInMonth: number): [number, number] {
  if (week <= 4) return [(week - 1) * 7 + 1, week * 7]
  return [29, daysInMonth]
}

export function daysInMonthOf(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/** Format yyyy-mm-dd dari komponen tanggal (tanpa timezone shifting) */
export function isoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Parse "yyyy-mm-dd" → { year, monthIndex, day } */
export function parseISODate(s: string): { year: number; monthIndex: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  if (!m) return null
  const year = Number(m[1])
  const monthIndex = Number(m[2]) - 1
  const day = Number(m[3])
  if (monthIndex < 0 || monthIndex > 11) return null
  const dim = daysInMonthOf(year, monthIndex)
  if (day < 1 || day > dim) return null
  return { year, monthIndex, day }
}

/** "Tanggal saat ini" versi WIB (yyyy-mm-dd) — dipakai route server */
export function wibTodayString(now: Date = new Date()): string {
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const wib = new Date(utc + 7 * 3600000)
  return isoDate(wib.getFullYear(), wib.getMonth(), wib.getDate())
}

/** Komponen tanggal WIB saat ini */
export function wibNowParts(now: Date = new Date()): { year: number; monthIndex: number; day: number } {
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const wib = new Date(utc + 7 * 3600000)
  return { year: wib.getFullYear(), monthIndex: wib.getMonth(), day: wib.getDate() }
}

/**
 * Index hari dalam seminggu (0=Senin .. 6=Minggu) untuk tanggal tertentu.
 * Dipakai untuk bobot distribusi harian per hari (Senin..Minggu).
 */
export function weekdayIndexMon0(year: number, monthIndex: number, day: number): number {
  return (new Date(year, monthIndex, day).getDay() + 6) % 7
}

// ─────────────── Level 1–2: Toko → Minggu → Harian ───────────────

export interface StoreDailyTarget {
  date: string // yyyy-mm-dd
  day: number // 1..31
  week: number // 1..5
  target: number // Rupiah (integer)
}

export interface StorePeriodTargets {
  monthly: number
  weekly: number[] // [W1..W5], Σ = monthly (week tanpa tanggal → 0)
  daily: StoreDailyTarget[] // Σ = monthly
}

/**
 * Target Bulanan Toko → per minggu (pct, largest remainder) → per tanggal
 * (distribusi dalam minggu memakai BOBOT HARI — Senin..Minggu, mis.
 * Sen 3 / Sab 4.5 / Min 4.5 — dinormalisasi sehingga Σ harian = target
 * mingguan PERSIS; jika semua bobot 0 → split rata).
 * Σ daily = Σ weekly = monthly.
 */
export function computeStoreDailyTargets(
  monthlyTarget: number,
  weekPcts: number[], // [w1..w5]
  year: number,
  monthIndex: number, // 0-based
  dayPcts?: number[], // [Sen,Sel,Rab,Kam,Jum,Sab,Min] — bobot relatif (opsional)
): StorePeriodTargets {
  const total = Math.max(0, Math.round(Number(monthlyTarget) || 0))
  const dim = daysInMonthOf(year, monthIndex)
  const pcts = [0, 1, 2, 3, 4].map(i => Math.max(0, Number(weekPcts?.[i]) || 0))
  const dayWeightsCfg = [0, 1, 2, 3, 4, 5, 6].map(i => Math.max(0, Number(dayPcts?.[i]) || 0))
  const dayWeightSum = dayWeightsCfg.reduce((s, w) => s + w, 0)

  // Week tanpa satu pun tanggal (mis. W5 di Feb 28 hari) → bobot 0
  const weekHasDays = [1, 2, 3, 4, 5].map(w => {
    const [from, to] = weekRange(w, dim)
    return from <= dim // ada minimal 1 tanggal
  })
  const effectivePcts = pcts.map((p, i) => (weekHasDays[i] ? p : 0))

  const weekly = allocateByWeights(total, effectivePcts)

  const daily: StoreDailyTarget[] = []
  for (let w = 1; w <= 5; w++) {
    if (weekly[w - 1] <= 0 && !weekHasDays[w - 1]) continue
    const [from, to] = weekRange(w, dim)
    const dayNums: number[] = []
    for (let d = from; d <= Math.min(to, dim); d++) dayNums.push(d)
    if (dayNums.length === 0) continue
    // Bobot per tanggal: dari konfigurasi per-hari (Senin..Minggu).
    // Semua bobot 0 / tidak dikonfigurasi → split rata (weight 1).
    const weights = dayWeightSum > 0
      ? dayNums.map(d => dayWeightsCfg[weekdayIndexMon0(year, monthIndex, d)])
      : dayNums.map(() => 1)
    const amounts = allocateByWeights(weekly[w - 1], weights)
    dayNums.forEach((d, idx) => {
      daily.push({ date: isoDate(year, monthIndex, d), day: d, week: w, target: amounts[idx] })
    })
  }
  daily.sort((a, b) => a.day - b.day)

  return { monthly: total, weekly, daily }
}

// ─────────────── Level 3: Toko Harian → Zoning (Group) ───────────────

/** Target harian toko → per group berdasarkan allocationPct. Σ = storeDaily. */
export function allocateGroupDaily(storeDaily: number, allocationPcts: number[]): number[] {
  return allocateByWeights(storeDaily, allocationPcts)
}

// ─────────────── Level 4: Zoning → Crew (bobot shift) ───────────────

/**
 * Target harian group → per crew berdasarkan bobot shift pada tanggal tsb.
 * - Crew Off / bobot 0 → target 0.
 * - Σ bobot > 0 → Σ crew = groupDaily PERSIS.
 * - Σ bobot = 0 (semua Off / tanpa jadwal terisi) → semua 0 + ditandai
 *   `unassignedAmount` agar grup tetap transparan (tidak ada leak diam-diam).
 *
 * HANYA untuk level HARIAN. Target mingguan & bulanan crew dihitung
 * terpisah sebagai split rata (lihat allocateCrewEven).
 */
export function allocateCrewDaily(
  groupDaily: number,
  shiftWeights: number[],
): { amounts: number[]; unassignedAmount: number } {
  const sumW = shiftWeights.reduce((s, w) => s + Math.max(0, Number(w) || 0), 0)
  if (sumW <= 0) {
    // Semua crew Off (atau tanpa bobot) → target tidak terdistribusi
    return { amounts: shiftWeights.map(() => 0), unassignedAmount: Math.max(0, Math.round(groupDaily || 0)) }
  }
  return { amounts: allocateByWeights(groupDaily, shiftWeights), unassignedAmount: 0 }
}

/**
 * Split RATA target grup ke seluruh crew dalam grup (largest remainder,
 * integer Rupiah, Σ hasil = total PERSIS).
 * Dipakai untuk target MINGGUAN & BULANAN per crew — semua crew dalam
 * grup mendapat porsi sama besar, apa pun jadwalnya.
 */
export function allocateCrewEven(groupTotal: number, crewCount: number): number[] {
  return allocateByWeights(groupTotal, new Array(Math.max(0, crewCount)).fill(1))
}

// ─────────────── Full month computation (engine utama) ───────────────

export interface EngineGroupInput {
  id: string
  allocationPct: number
  crewIds: string[]
}

export interface MonthTargetInput {
  year: number
  monthIndex: number // 0-based
  storeMonthlyTarget: number
  weekPcts: number[] // [w1..w5]
  /** Bobot harian Senin..Minggu (mis. 3,3,3,3,3,4.5,4.5). Opsional → rata. */
  dayPcts?: number[] // [Sen,Sel,Rab,Kam,Jum,Sab,Min]
  groups: EngineGroupInput[] // urutan stabil (createdAt asc) → deterministik
  /** key: `${crewId}|${yyyy-mm-dd}` → shiftCode. Crew tanpa entry = belum dijadwalkan. */
  shiftByCrewDate: Map<string, string>
  /** shiftCode → weight (dari tabel ShiftType aktif) */
  weightByCode: Map<string, number>
}

export interface EngineCrewTarget {
  crewId: string
  groupId: string
  monthly: number
  weekly: number[] // [W1..W5]
  daily: Map<string, number> // yyyy-mm-dd → amount
  shiftByDate: Map<string, string> // shift efektif pada tanggal tsb ("" = tanpa jadwal)
}

export interface EngineGroupTarget {
  groupId: string
  allocationPct: number
  monthly: number
  weekly: number[] // [W1..W5]
  daily: Map<string, number> // yyyy-mm-dd → amount
  crews: Map<string, EngineCrewTarget>
  /** tanggal dg jadwal terisi tapi Σ bobot = 0 → target grup tak terdistribusi */
  zeroWeightDates: Map<string, number> // date → unassigned amount
  /** tanggal tanpa SATU PUN baris jadwal → fallback split rata (legacy) */
  legacyEqualSplitDates: Set<string>
}

export interface MonthTargetResult {
  year: number
  monthIndex: number
  store: StorePeriodTargets
  groups: Map<string, EngineGroupTarget>
  /** verifikasi cepat: Σ crew monthly (hanya grup dengan crew) */
  sumCrewMonthly: number
  sumGroupMonthly: number // Σ target bulanan grup (hasil alokasi)
  balancedMonthly: boolean // Σ crew == Σ group == store
}

/**
 * Hitung SELURUH breakdown target satu bulan secara realtime.
 * Dipakai dashboard, group-detail, dan API breakdown.
 */
export function computeMonthTargets(input: MonthTargetInput): MonthTargetResult {
  const { year, monthIndex } = input
  const store = computeStoreDailyTargets(
    input.storeMonthlyTarget,
    input.weekPcts,
    year,
    monthIndex,
    input.dayPcts,
  )

  const groups = new Map<string, EngineGroupTarget>()
  for (const g of input.groups) {
    groups.set(g.id, {
      groupId: g.id,
      allocationPct: g.allocationPct,
      monthly: 0,
      weekly: [0, 0, 0, 0, 0],
      daily: new Map(),
      crews: new Map(),
      zeroWeightDates: new Map(),
      legacyEqualSplitDates: new Set(),
    })
    for (const crewId of g.crewIds) {
      groups.get(g.id)!.crews.set(crewId, {
        crewId,
        groupId: g.id,
        monthly: 0,
        weekly: [0, 0, 0, 0, 0],
        daily: new Map(),
        shiftByDate: new Map(),
      })
    }
  }

  for (const dayTarget of store.daily) {
    const date = dayTarget.date

    // ── Toko harian → Group harian (allocation %) ──
    const allocs = input.groups.map(g => g.allocationPct)
    const groupAmounts = allocateGroupDaily(dayTarget.target, allocs)

    for (let gi = 0; gi < input.groups.length; gi++) {
      const gInput = input.groups[gi]
      const gTarget = groups.get(gInput.id)!
      const amount = groupAmounts[gi]
      gTarget.daily.set(date, (gTarget.daily.get(date) || 0) + amount)
      gTarget.monthly += amount
      gTarget.weekly[dayTarget.week - 1] += amount

      const crewIds = gInput.crewIds
      if (crewIds.length === 0) continue

      // Bobot shift tiap crew pada tanggal ini
      const shiftCodes: (string | null)[] = crewIds.map(cid => {
        const code = input.shiftByCrewDate.get(`${cid}|${date}`) || null
        return code
      })
      const hasAnyRow = shiftCodes.some(c => c !== null)
      const weights = shiftCodes.map(c => (c !== null ? Math.max(0, input.weightByCode.get(c) ?? 0) : 0))

      let crewAmounts: number[]
      if (!hasAnyRow) {
        // Grup benar-benar belum dijadwalkan → fallback split rata (legacy)
        crewAmounts = allocateByWeights(amount, crewIds.map(() => 1))
        gTarget.legacyEqualSplitDates.add(date)
      } else {
        const res = allocateCrewDaily(amount, weights)
        crewAmounts = res.amounts
        if (res.unassignedAmount > 0) {
          gTarget.zeroWeightDates.set(date, (gTarget.zeroWeightDates.get(date) || 0) + res.unassignedAmount)
        }
      }

      for (let ci = 0; ci < crewIds.length; ci++) {
        const crewTarget = gTarget.crews.get(crewIds[ci])!
        const amt = crewAmounts[ci] || 0
        crewTarget.daily.set(date, (crewTarget.daily.get(date) || 0) + amt)
        crewTarget.shiftByDate.set(date, shiftCodes[ci] || '')
      }
    }
  }

  // ── Level 4b: Target MINGGUAN & BULANAN per crew = split rata grup ──
  // Jadwal tidak selalu seimbang → weekly/monthly TIDAK diakumulasi dari
  // harian (yang shift-weighted), melainkan dibagi rata: target grup ÷
  // jumlah crew. Yang membedakan antar crew hanya target harian.
  for (const gInput of input.groups) {
    const gTarget = groups.get(gInput.id)!
    const crewIds = gInput.crewIds
    if (crewIds.length === 0) continue

    // Mingguan: split rata tiap minggu (Σ crew minggu-W = grup minggu-W)
    for (let w = 0; w < 5; w++) {
      if (gTarget.weekly[w] <= 0) continue
      const shares = allocateCrewEven(gTarget.weekly[w], crewIds.length)
      crewIds.forEach((cid, i) => {
        gTarget.crews.get(cid)!.weekly[w] = shares[i] || 0
      })
    }

    // Bulanan: split rata (Σ crew bulanan = grup bulanan)
    if (gTarget.monthly > 0) {
      const monthShares = allocateCrewEven(gTarget.monthly, crewIds.length)
      crewIds.forEach((cid, i) => {
        gTarget.crews.get(cid)!.monthly = monthShares[i] || 0
      })
    }
  }

  // ── Verifikasi balance ──
  let sumCrewMonthly = 0
  let sumGroupMonthly = 0
  for (const g of groups.values()) {
    sumGroupMonthly += g.monthly
    for (const c of g.crews.values()) sumCrewMonthly += c.monthly
  }

  return {
    year,
    monthIndex,
    store,
    groups,
    sumCrewMonthly,
    sumGroupMonthly,
    balancedMonthly: sumCrewMonthly === sumGroupMonthly && sumGroupMonthly === store.monthly,
  }
}

/** Helper: shift weight lookup (case-insensitive, kode tidak dikenal = 0) */
export function buildWeightMap(shiftTypes: Array<{ code: string; weight: number; isActive: boolean }>): Map<string, number> {
  const m = new Map<string, number>()
  for (const st of shiftTypes) {
    if (st.isActive) m.set(st.code.toUpperCase(), Math.max(0, Number(st.weight) || 0))
  }
  return m
}
