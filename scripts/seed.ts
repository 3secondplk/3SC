/**
 * Seed demo data for CMS Crew Management System
 * Run: bun run scripts/seed.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

// WIB "today" string helper (matches app logic)
function getWIBToday() {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const d = new Date(utc + 7 * 3600000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgoWIB(n: number) {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const d = new Date(utc + 7 * 3600000 - n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function main() {
  const today = getWIBToday()
  const d1 = daysAgoWIB(1)
  const d3 = daysAgoWIB(3)

  // Clean slate (order matters for relations)
  await db.activityLog.deleteMany()
  await db.sale.deleteMany()
  await db.tikTokSale.deleteMany()
  await db.crew.deleteMany()
  await db.group.deleteMany()

  // ─── Groups (Zoning) — week targets are PERCENTAGES of monthly target (sum = 100%) ───
  const zoning1 = await db.group.create({ data: { name: 'Zoning 1', monthlyTarget: 150000000, week1Target: 23, week2Target: 23, week3Target: 23, week4Target: 23, week5Target: 8 } })
  const zoning2 = await db.group.create({ data: { name: 'Zoning 2', monthlyTarget: 120000000, week1Target: 25, week2Target: 25, week3Target: 25, week4Target: 20, week5Target: 5 } })
  const zoning3 = await db.group.create({ data: { name: 'Zoning 3', monthlyTarget: 90000000, week1Target: 20, week2Target: 20, week3Target: 20, week4Target: 30, week5Target: 10 } })

  // ─── Crews ───
  const cRina = await db.crew.create({ data: { name: 'Rina Wijaya', employeeId: 'EMP-001', groupId: zoning1.id } })
  const cBudi = await db.crew.create({ data: { name: 'Budi Santoso', employeeId: 'EMP-002', groupId: zoning1.id } })
  const cSari = await db.crew.create({ data: { name: 'Sari Melati', employeeId: 'EMP-003', groupId: zoning1.id } })
  const cAndi = await db.crew.create({ data: { name: 'Andi Pratama', employeeId: 'EMP-004', groupId: zoning2.id } })
  const cDewi = await db.crew.create({ data: { name: 'Dewi Anggraini', employeeId: 'EMP-005', groupId: zoning2.id } })
  const cTono = await db.crew.create({ data: { name: 'Tono Hartono', employeeId: 'EMP-006', groupId: zoning3.id } })
  const cLina = await db.crew.create({ data: { name: 'Lina Marlina', employeeId: 'EMP-007', groupId: zoning3.id } })

  type S = {
    crewId: string | null; tanggal: string; idPenjualan: string; kodeExtend: string
    brand: string; dept: string; qty: number; hjp: number; netto: number
    settle: number; pembayaran?: string; program?: string; modul?: string
  }

  const sales: S[] = [
    // ═══ Zoning 1 — claimed today (matches the requested example + aggregation rows) ═══
    { crewId: cRina.id, tanggal: today, idPenjualan: 'STR-2025-0001', kodeExtend: '3SC-JKT-001', brand: '3SCO', dept: 'JAKET PRIA', qty: 1, hjp: 349000, netto: 349000, settle: 349000, pembayaran: 'QRIS' },
    { crewId: cBudi.id, tanggal: today, idPenjualan: 'STR-2025-0002', kodeExtend: '3SC-TOP-014', brand: 'GL', dept: 'TOPI/KUPLUK', qty: 1, hjp: 169000, netto: 169000, settle: 169000, pembayaran: 'CASH' },
    { crewId: cBudi.id, tanggal: today, idPenjualan: 'STR-2025-0002', kodeExtend: '3SC-TOP-015', brand: '3SCO', dept: 'TOPI/KUPLUK', qty: 1, hjp: 189000, netto: 189000, settle: 189000, pembayaran: 'CASH' },
    { crewId: cRina.id, tanggal: today, idPenjualan: 'STR-2025-0003', kodeExtend: '3SC-PPB-002', brand: 'PAPERBAG', dept: 'AKSESORIS', qty: 1, hjp: 5000, netto: 5000, settle: 5000, pembayaran: 'CASH' },
    // Aggregation check: same brand+dept in same zoning → should merge into one row (qty 3)
    { crewId: cSari.id, tanggal: today, idPenjualan: 'STR-2025-0004', kodeExtend: '3SC-JKT-002', brand: '3SCO', dept: 'JAKET PRIA', qty: 2, hjp: 349000, netto: 698000, settle: 698000, pembayaran: 'DEBIT' },
    { crewId: cSari.id, tanggal: today, idPenjualan: 'STR-2025-0004', kodeExtend: '3SC-CEL-003', brand: '3SCO', dept: 'CELANA PRIA', qty: 1, hjp: 259000, netto: 259000, settle: 259000, pembayaran: 'DEBIT' },
    { crewId: cRina.id, tanggal: today, idPenjualan: 'STR-2025-0005', kodeExtend: '3SC-KSW-007', brand: 'GL', dept: 'KAOS WANITA', qty: 2, hjp: 89000, netto: 178000, settle: 178000, pembayaran: 'QRIS', program: 'DISKON 20%' },
    // ═══ Zoning 2 — claimed ═══
    { crewId: cAndi.id, tanggal: today, idPenjualan: 'STR-2025-0006', kodeExtend: '3SC-KSP-011', brand: '3SCO', dept: 'KAOS PRIA', qty: 3, hjp: 79000, netto: 237000, settle: 237000, pembayaran: 'QRIS' },
    { crewId: cDewi.id, tanggal: today, idPenjualan: 'STR-2025-0007', kodeExtend: 'EIG-MDL-021', brand: 'EIGEN', dept: 'MODULE', qty: 1, hjp: 499000, netto: 499000, settle: 499000, pembayaran: 'CREDIT', program: 'BUNDLING' },
    { crewId: cAndi.id, tanggal: d1, idPenjualan: 'STR-2025-0008', kodeExtend: '3SC-JKT-004', brand: '3SCO', dept: 'JAKET PRIA', qty: 1, hjp: 359000, netto: 359000, settle: 359000, pembayaran: 'CASH' },
    { crewId: cDewi.id, tanggal: d1, idPenjualan: 'STR-2025-0008', kodeExtend: 'GL-TOP-022', brand: 'GL', dept: 'TOPI/KUPLUK', qty: 1, hjp: 155000, netto: 155000, settle: 155000, pembayaran: 'CASH' },
    { crewId: cAndi.id, tanggal: d3, idPenjualan: 'STR-2025-0009', kodeExtend: 'EIG-MDL-023', brand: 'EIGEN', dept: 'MODULE', qty: 2, hjp: 385000, netto: 770000, settle: 770000, pembayaran: 'DEBIT' },
    // ═══ Zoning 3 — claimed ═══
    { crewId: cTono.id, tanggal: today, idPenjualan: 'STR-2025-0010', kodeExtend: 'GL-KSW-031', brand: 'GL', dept: 'KAOS WANITA', qty: 2, hjp: 95000, netto: 190000, settle: 190000, pembayaran: 'QRIS' },
    { crewId: cLina.id, tanggal: today, idPenjualan: 'STR-2025-0010', kodeExtend: '3SC-CEL-032', brand: '3SCO', dept: 'CELANA WANITA', qty: 1, hjp: 279000, netto: 279000, settle: 279000, pembayaran: 'QRIS' },
    { crewId: cTono.id, tanggal: d1, idPenjualan: 'STR-2025-0011', kodeExtend: '3SC-PPB-033', brand: 'PAPERBAG', dept: 'AKSESORIS', qty: 3, hjp: 5000, netto: 15000, settle: 15000, pembayaran: 'CASH' },
    { crewId: cLina.id, tanggal: d3, idPenjualan: 'STR-2025-0012', kodeExtend: '3SC-JKT-034', brand: '3SCO', dept: 'JAKET WANITA', qty: 1, hjp: 329000, netto: 329000, settle: 329000, pembayaran: 'DEBIT' },
    // ═══ UNCLAIMED sales — must NOT appear in the per-zoning summary ═══
    { crewId: null, tanggal: today, idPenjualan: 'STR-2025-0099', kodeExtend: '3SC-JKT-900', brand: '3SCO', dept: 'JAKET PRIA', qty: 5, hjp: 349000, netto: 1745000, settle: 1745000 },
    { crewId: null, tanggal: today, idPenjualan: 'STR-2025-0100', kodeExtend: 'GL-TOP-901', brand: 'GL', dept: 'TOPI/KUPLUK', qty: 4, hjp: 165000, netto: 660000, settle: 660000 },
  ]

  for (const s of sales) {
    await db.sale.create({
      data: {
        crewId: s.crewId,
        tanggal: s.tanggal,
        idPenjualan: s.idPenjualan,
        kodeExtend: s.kodeExtend,
        brand: s.brand,
        dept: s.dept,
        modul: s.modul ?? null,
        qty: s.qty,
        hjp: s.hjp,
        netto: s.netto,
        diskon: 0,
        diskonRp: 0,
        potongan: 0,
        potonganV: 0,
        settle: s.settle,
        pembayaran: s.pembayaran ?? null,
        program: s.program ?? null,
        claimedAt: s.crewId ? new Date() : null,
      },
    })
  }

  const groups = await db.group.count()
  const crews = await db.crew.count()
  const saleCount = await db.sale.count()
  const claimed = await db.sale.count({ where: { crewId: { not: null } } })
  console.log(`✅ Seed done — groups: ${groups}, crews: ${crews}, sales: ${saleCount} (claimed: ${claimed})`)
  console.log('👉 Login: username "admin", password "admin123"')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
