import { PrismaClient } from '@prisma/client'
import * as crypto from 'crypto'

const db = new PrismaClient()

// ─────────────────────────────────────────────────────────
// Helper: format date as YYYY-MM-DD
// ─────────────────────────────────────────────────────────
function formatDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ─────────────────────────────────────────────────────────
// Date ranges
// ─────────────────────────────────────────────────────────
const today = new Date()
const todayStr = formatDate(today)

function daysAgo(n: number): string {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return formatDate(d)
}

// This week (0-6 days ago)
const thisWeekDates = [0, 1, 2, 3, 4, 5, 6].map(daysAgo)

// Earlier this month (7-28 days ago)
const earlierThisMonthDates = [7, 10, 14, 18, 21, 25, 28].map(daysAgo)

// ─────────────────────────────────────────────────────────
// Product catalog – realistic Indonesian retail items
// ─────────────────────────────────────────────────────────
interface Product {
  kodeExtend: string
  brand: string
  dept: string
  modul: string
  hjp: number // unit price
}

const products: Product[] = [
  // ── F&B ──
  { kodeExtend: 'FN001', brand: 'Indomie', dept: 'F&B', modul: 'Mi Instan', hjp: 3500 },
  { kodeExtend: 'FN002', brand: 'Aqua', dept: 'F&B', modul: 'Air Mineral', hjp: 5000 },
  { kodeExtend: 'FN003', brand: 'Teh Botol Sosro', dept: 'F&B', modul: 'Minuman Ringan', hjp: 7000 },
  { kodeExtend: 'FN004', brand: 'Kapal Api', dept: 'F&B', modul: 'Kopi Sachet', hjp: 2500 },
  { kodeExtend: 'FN005', brand: 'Ultra Milk', dept: 'F&B', modul: 'Susu UHT', hjp: 18000 },
  { kodeExtend: 'FN006', brand: 'ABC Kecap', dept: 'F&B', modul: 'Bumbu & Saus', hjp: 14000 },
  { kodeExtend: 'FN007', brand: 'Chitato', dept: 'F&B', modul: 'Snack', hjp: 12000 },
  { kodeExtend: 'FN008', brand: 'Nescafe', dept: 'F&B', modul: 'Kopi Sachet', hjp: 3500 },
  { kodeExtend: 'FN009', brand: 'Pocari Sweat', dept: 'F&B', modul: 'Minuman Isotonik', hjp: 8500 },
  { kodeExtend: 'FN010', brand: 'Tango Wafer', dept: 'F&B', modul: 'Biskuit', hjp: 10000 },
  { kodeExtend: 'FN011', brand: 'Le Minerale', dept: 'F&B', modul: 'Air Mineral', hjp: 4500 },
  { kodeExtend: 'FN012', brand: 'Sari Roti', dept: 'F&B', modul: 'Roti', hjp: 17000 },
  { kodeExtend: 'FN013', brand: 'Nutrisari', dept: 'F&B', modul: 'Minuman Serbuk', hjp: 3000 },
  { kodeExtend: 'FN014', brand: 'Roma Kelapa', dept: 'F&B', modul: 'Biskuit', hjp: 8000 },

  // ── Health & Beauty ──
  { kodeExtend: 'HB001', brand: 'Wardah', dept: 'Health & Beauty', modul: 'Skincare Wajah', hjp: 55000 },
  { kodeExtend: 'HB002', brand: 'Pond\'s', dept: 'Health & Beauty', modul: 'Pembersih Wajah', hjp: 32000 },
  { kodeExtend: 'HB003', brand: 'Vaseline', dept: 'Health & Beauty', modul: 'Body Lotion', hjp: 28000 },
  { kodeExtend: 'HB004', brand: 'Garnier', dept: 'Health & Beauty', modul: 'Masker Wajah', hjp: 22000 },
  { kodeExtend: 'HB005', brand: 'Sunsilk', dept: 'Health & Beauty', modul: 'Shampoo', hjp: 25000 },
  { kodeExtend: 'HB006', brand: 'Dove', dept: 'Health & Beauty', modul: 'Sabun Mandi', hjp: 30000 },
  { kodeExtend: 'HB007', brand: 'Nivea Men', dept: 'Health & Beauty', modul: 'Face Wash', hjp: 38000 },
  { kodeExtend: 'HB008', brand: 'Emina', dept: 'Health & Beauty', modul: 'Lipstik', hjp: 45000 },
  { kodeExtend: 'HB009', brand: 'Himalaya', dept: 'Health & Beauty', modul: 'Face Scrub', hjp: 42000 },
  { kodeExtend: 'HB010', brand: 'L\'Oreal Paris', dept: 'Health & Beauty', modul: 'Serum Wajah', hjp: 95000 },

  // ── Fashion ──
  { kodeExtend: 'FS001', brand: 'Eiger', dept: 'Fashion', modul: 'Tas Ransel', hjp: 350000 },
  { kodeExtend: 'FS002', brand: 'Cotton On', dept: 'Fashion', modul: 'Kaos', hjp: 150000 },
  { kodeExtend: 'FS003', brand: 'Specs', dept: 'Fashion', modul: 'Sepatu Olahraga', hjp: 450000 },
  { kodeExtend: 'FS004', brand: 'H&M', dept: 'Fashion', modul: 'Celana Jeans', hjp: 550000 },
  { kodeExtend: 'FS005', brand: 'Padini', dept: 'Fashion', modul: 'Blouse', hjp: 250000 },
  { kodeExtend: 'FS006', brand: 'Executive', dept: 'Fashion', modul: 'Kemeja', hjp: 320000 },
  { kodeExtend: 'FS007', brand: 'Nike', dept: 'Fashion', modul: 'Sandal', hjp: 280000 },

  // ── Home Care ──
  { kodeExtend: 'HC001', brand: 'Molto', dept: 'Home Care', modul: 'Pewangi', hjp: 15000 },
  { kodeExtend: 'HC002', brand: 'Rinso', dept: 'Home Care', modul: 'Deterjen', hjp: 22000 },
  { kodeExtend: 'HC003', brand: 'Sunlight', dept: 'Home Care', modul: 'Sabun Cuci Piring', hjp: 12000 },
  { kodeExtend: 'HC004', brand: 'Baygon', dept: 'Home Care', modul: 'Pembasmi Serangga', hjp: 35000 },
  { kodeExtend: 'HC005', brand: 'Daia', dept: 'Home Care', modul: 'Deterjen', hjp: 11000 },
  { kodeExtend: 'HC006', brand: 'Soffell', dept: 'Home Care', modul: 'Lotion Anti Nyamuk', hjp: 28000 },
  { kodeExtend: 'HC007', brand: 'Hit', dept: 'Home Care', modul: 'Insektisida', hjp: 32000 },

  // ── Baby ──
  { kodeExtend: 'BB001', brand: 'Pampers', dept: 'Baby', modul: 'Popok Bayi', hjp: 85000 },
  { kodeExtend: 'BB002', brand: 'Dancow', dept: 'Baby', modul: 'Susu Formula', hjp: 125000 },
  { kodeExtend: 'BB003', brand: 'Bebelac', dept: 'Baby', modul: 'Susu Formula', hjp: 135000 },
  { kodeExtend: 'BB004', brand: 'Mituto', dept: 'Baby', modul: 'Tisu Bayi', hjp: 18000 },
  { kodeExtend: 'BB005', brand: 'Cussons Baby', dept: 'Baby', modul: 'Sabun Bayi', hjp: 24000 },
  { kodeExtend: 'BB006', brand: 'Sweety', dept: 'Baby', modul: 'Popok Bayi', hjp: 65000 },
  { kodeExtend: 'BB007', brand: 'Promina', dept: 'Baby', modul: 'Makanan Bayi', hjp: 15000 },

  // ── Personal Care ──
  { kodeExtend: 'PC001', brand: 'Gilette', dept: 'Personal Care', modul: 'Pisau Cukur', hjp: 45000 },
  { kodeExtend: 'PC002', brand: 'Oral-B', dept: 'Personal Care', modul: 'Sikat Gigi', hjp: 28000 },
  { kodeExtend: 'PC003', brand: 'Lifebuoy', dept: 'Personal Care', modul: 'Sabun Mandi', hjp: 14000 },
  { kodeExtend: 'PC004', brand: 'Close Up', dept: 'Personal Care', modul: 'Pasta Gigi', hjp: 16000 },
  { kodeExtend: 'PC005', brand: 'Clear', dept: 'Personal Care', modul: 'Shampoo', hjp: 26000 },
  { kodeExtend: 'PC006', brand: 'Mentholatum', dept: 'Personal Care', modul: 'Lip Care', hjp: 20000 },
  { kodeExtend: 'PC007', brand: 'GIV', dept: 'Personal Care', modul: 'Deodoran', hjp: 19000 },
]

// ─────────────────────────────────────────────────────────
// Payment methods & programs
// ─────────────────────────────────────────────────────────
const pembayaranOptions = ['QRIS', 'Cash', 'Debit BCA', 'Kredit', 'ShopeePay']
const programOptions: (string | null)[] = ['Promo Awal Bulan', 'Flash Sale', 'Member Promo', 'Weekend Deal', null, null, null, null] // 50% chance of null
const channelStockOptions: (string | null)[] = ['Store', 'Online', 'Marketplace', null]

// ─────────────────────────────────────────────────────────
// Simple seeded pseudo-random for deterministic data
// ─────────────────────────────────────────────────────────
let seed = 42
function pseudoRandom(): number {
  seed = (seed * 16807 + 0) % 2147483647
  return seed / 2147483647
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(pseudoRandom() * arr.length)]
}
function randInt(min: number, max: number): number {
  return Math.floor(pseudoRandom() * (max - min + 1)) + min
}

// ─────────────────────────────────────────────────────────
// Generate a single transaction (1-5 items, same receipt)
// ─────────────────────────────────────────────────────────
function generateTransaction(
  tanggal: string,
  crewId: string | null,
  receiptCounter: number
): Record<string, unknown>[] {
  const idPenjualan = `TRX${formatDate(new Date()).replace(/-/g, '').slice(2)}${String(receiptCounter).padStart(5, '0')}`
  const numItems = randInt(1, 5)
  const pembayaran = pick(pembayaranOptions)
  const program = pick(programOptions)
  const channel = pick(channelStockOptions)
  const items: Record<string, unknown>[] = []

  for (let i = 0; i < numItems; i++) {
    const product = pick(products)
    const qty = randInt(1, 10)
    const diskon = pseudoRandom() < 0.3 ? parseFloat((pseudoRandom() * 15 + 5).toFixed(1)) : 0 // 30% chance of discount
    const diskonRp = diskon > 0 ? parseFloat((product.hjp * (diskon / 100) * qty).toFixed(0)) : 0
    const potongan = pseudoRandom() < 0.15 ? parseFloat((pseudoRandom() * 5000).toFixed(0)) : 0 // 15% chance of potongan
    const potonganV = 0
    const netto = parseFloat((product.hjp * qty).toFixed(0))
    const settle = parseFloat(Math.max(netto - diskonRp - potongan, 1000).toFixed(0)) // minimum settle 1000

    items.push({
      tanggal,
      idPenjualan,
      kodeExtend: product.kodeExtend,
      brand: product.brand,
      dept: product.dept,
      modul: product.modul,
      qty,
      hjp: product.hjp,
      netto,
      diskon,
      diskonRp,
      potongan,
      potonganV,
      settle,
      pembayaran,
      program,
      channelStock: channel,
      crewId,
    })
  }

  return items
}

// ─────────────────────────────────────────────────────────
// Main seed function
// ─────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding database...\n')

  // ── 1. Create default admin ──
  const hashedPassword = crypto.createHash('sha256').update('admin123').digest('hex')

  await db.admin.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      name: 'Administrator',
    },
  })

  // ── 2. Create sample groups ──
  const group1 = await db.group.upsert({
    where: { id: 'group-zone-a' },
    update: {},
    create: {
      id: 'group-zone-a',
      name: 'Zone A - Premium',
      logo: 'https://api.dicebear.com/9.x/initials/svg?seed=ZA&backgroundColor=059669',
      monthlyTarget: 50000000,
      week1Target: 20,
      week2Target: 25,
      week3Target: 25,
      week4Target: 20,
      week5Target: 10,
    },
  })

  const group2 = await db.group.upsert({
    where: { id: 'group-zone-b' },
    update: {},
    create: {
      id: 'group-zone-b',
      name: 'Zone B - Regular',
      logo: 'https://api.dicebear.com/9.x/initials/svg?seed=ZB&backgroundColor=0891b2',
      monthlyTarget: 35000000,
      week1Target: 20,
      week2Target: 25,
      week3Target: 25,
      week4Target: 20,
      week5Target: 10,
    },
  })

  const group3 = await db.group.upsert({
    where: { id: 'group-zone-c' },
    update: {},
    create: {
      id: 'group-zone-c',
      name: 'Zone C - Starter',
      logo: 'https://api.dicebear.com/9.x/initials/svg?seed=ZC&backgroundColor=d97706',
      monthlyTarget: 20000000,
      week1Target: 22,
      week2Target: 24,
      week3Target: 26,
      week4Target: 18,
      week5Target: 10,
    },
  })

  // ── 3. Create sample crews ──
  const crews = [
    { name: 'Ahmad Rizky', employeeId: 'EMP001', groupId: group1.id, photo: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Ahmad' },
    { name: 'Siti Nurhaliza', employeeId: 'EMP002', groupId: group1.id, photo: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Siti' },
    { name: 'Budi Santoso', employeeId: 'EMP003', groupId: group2.id, photo: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Budi' },
    { name: 'Dewi Lestari', employeeId: 'EMP004', groupId: group2.id, photo: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Dewi' },
    { name: 'Fajar Nugroho', employeeId: 'EMP005', groupId: group3.id, photo: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Fajar' },
    { name: 'Rina Wulandari', employeeId: 'EMP006', groupId: group3.id, photo: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Rina' },
  ]

  for (const crew of crews) {
    await db.crew.upsert({
      where: { employeeId: crew.employeeId },
      update: {},
      create: crew,
    })
  }

  // ── 4. Look up crew IDs from database ──
  const allCrews = await db.crew.findMany({
    select: { id: true, employeeId: true, name: true },
  })

  const crewMap = new Map<string, string>() // employeeId -> db id
  for (const c of allCrews) {
    crewMap.set(c.employeeId, c.id)
    console.log(`  ✅ Crew found: ${c.employeeId} (${c.name}) → ${c.id}`)
  }

  const crewIds = Array.from(crewMap.values())
  console.log(`\n📦 Total crews: ${crewIds.length}`)

  // ── 5. Clear existing sales data ──
  const deletedCount = await db.sale.deleteMany()
  console.log(`🗑️  Cleared ${deletedCount.count} existing sales records\n`)

  // ── 6. Generate sales transactions ──
  console.log('🛒 Generating sales data...\n')

  const allSalesData: Record<string, unknown>[] = []
  let receiptCounter = 1

  // Helper: generate N transactions for a given date range, with/without crew assignment
  function generateSalesBatch(
    dates: string[],
    numTransactions: number,
    crewAssignmentRate: number // 0-1, probability of assigning a crew
  ) {
    for (let i = 0; i < numTransactions; i++) {
      const tanggal = pick(dates)
      const hasCrew = pseudoRandom() < crewAssignmentRate
      const crewId = hasCrew ? pick(crewIds) : null

      const items = generateTransaction(tanggal, crewId, receiptCounter)
      allSalesData.push(...items)
      receiptCounter++
    }
  }

  // This week: ~40 transactions (dense, recent activity)
  generateSalesBatch(thisWeekDates, 40, 0.65)

  // Earlier this month: ~25 transactions
  generateSalesBatch(earlierThisMonthDates, 25, 0.50)

  // Today specifically: a few extra transactions for today's dashboard
  for (let i = 0; i < 10; i++) {
    const hasCrew = pseudoRandom() < 0.70
    const crewId = hasCrew ? pick(crewIds) : null
    const items = generateTransaction(todayStr, crewId, receiptCounter)
    allSalesData.push(...items)
    receiptCounter++
  }

  // ── 7. Insert sales in batches ──
  const BATCH_SIZE = 50
  let insertedCount = 0

  for (let i = 0; i < allSalesData.length; i += BATCH_SIZE) {
    const batch = allSalesData.slice(i, i + BATCH_SIZE)
    await db.sale.createMany({ data: batch as any[] })
    insertedCount += batch.length
  }

  // ── 8. Summary statistics ──
  const totalSales = await db.sale.count()
  const salesWithCrew = await db.sale.count({ where: { crewId: { not: null } } })
  const salesWithoutCrew = totalSales - salesWithCrew
  const totalSettle = await db.sale.aggregate({ _sum: { settle: true } })
  const uniqueReceipts = await db.sale.groupBy({ by: ['idPenjualan'] })
  const datesUsed = await db.sale.groupBy({ by: ['tanggal'] })

  // Per-department breakdown
  const deptBreakdown = await db.sale.groupBy({
    by: ['dept'],
    _count: { id: true },
    _sum: { settle: true },
  })

  // Per-crew breakdown
  const crewBreakdown = await db.sale.groupBy({
    by: ['crewId'],
    _count: { id: true },
    _sum: { settle: true },
    where: { crewId: { not: null } },
  })

  console.log('\n' + '═'.repeat(60))
  console.log('📊 SEED SUMMARY')
  console.log('═'.repeat(60))
  console.log(`  Total sale records inserted : ${totalSales}`)
  console.log(`  Total unique transactions   : ${uniqueReceipts.length}`)
  console.log(`  Sales assigned to crew      : ${salesWithCrew}`)
  console.log(`  Unclaimed sales (no crew)   : ${salesWithoutCrew}`)
  console.log(`  Total revenue (settle)      : Rp ${(totalSettle._sum.settle || 0).toLocaleString('id-ID')}`)
  console.log(`  Date range                  : ${datesUsed.sort((a, b) => a.tanggal.localeCompare(b.tanggal))[0]?.tanggal} → ${datesUsed.sort((a, b) => a.tanggal.localeCompare(b.tanggal))[datesUsed.length - 1]?.tanggal}`)
  console.log(`  Unique dates                : ${datesUsed.length}`)

  console.log('\n  📁 By Department:')
  for (const d of deptBreakdown.sort((a, b) => (b._sum.settle || 0) - (a._sum.settle || 0))) {
    console.log(`     ${d.dept?.padEnd(20)} → ${(d._count.id + '').padStart(3)} items,  Rp ${(d._sum.settle || 0).toLocaleString('id-ID')}`)
  }

  console.log('\n  👥 By Crew:')
  for (const c of crewBreakdown.sort((a, b) => (b._sum.settle || 0) - (a._sum.settle || 0))) {
    const crew = allCrews.find(cr => cr.id === c.crewId)
    const displayName = crew ? `${crew.name ?? crew.employeeId ?? '?'} (${crew.employeeId ?? '?'})` : (c.crewId ?? 'Unknown')
    console.log(`     ${(displayName ?? 'Unknown').padEnd(30)} → ${(c._count.id + '').padStart(3)} items,  Rp ${(c._sum.settle || 0).toLocaleString('id-ID')}`)
  }

  console.log('\n' + '═'.repeat(60))
  console.log('✅ Seed data created successfully!')
  console.log('═'.repeat(60))
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
