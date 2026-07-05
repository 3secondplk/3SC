import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 120

interface ExportGroup {
  id: string
  name: string
  logo: string | null
  monthlyTarget: number
  week1Target: number
  week2Target: number
  week3Target: number
  week4Target: number
  week5Target: number
  createdAt: string
  updatedAt: string
}

interface ExportCrew {
  id: string
  name: string
  photo: string | null
  employeeId: string
  groupId: string
  createdAt: string
  updatedAt: string
}

interface ExportSale {
  id: string
  crewId: string | null
  tanggal: string
  idPenjualan: string | null
  statusRetention: string | null
  retentionCode: string | null
  kodeExtend: string
  brand: string | null
  dept: string | null
  modul: string | null
  ukuran: string | null
  qty: number
  hjp: number
  netto: number
  diskon: number
  diskonRp: number
  potongan: number
  potonganV: number
  settle: number
  pembayaran: string | null
  program: string | null
  channelStock: string | null
  claimedAt: string | null
  createdAt: string
}

interface ExportData {
  version: number
  exportedAt: string
  groups: ExportGroup[]
  crews: ExportCrew[]
  sales: ExportSale[]
}

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return unauthorized()

  const { searchParams } = request.nextUrl
  const clearExisting = searchParams.get('clearExisting') === 'true'

  try {
    // Parse uploaded JSON
    let jsonData: ExportData
    try {
      const text = await request.text()
      jsonData = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'File JSON tidak valid' }, { status: 400 })
    }

    // Validate structure
    if (!jsonData.version || !Array.isArray(jsonData.groups) || !Array.isArray(jsonData.crews) || !Array.isArray(jsonData.sales)) {
      return NextResponse.json(
        { error: 'Struktur file tidak valid. File harus berisi: version, groups, crews, sales' },
        { status: 400 },
      )
    }

    // Optionally clear existing data
    if (clearExisting) {
      await db.sale.deleteMany({})
      await db.crew.deleteMany({})
      await db.group.deleteMany({})
    }

    // ── Import Groups (upsert by name) ──
    const groupIdMap = new Map<string, string>() // old id → new id
    let groupsImported = 0
    let groupsSkipped = 0

    for (const g of jsonData.groups) {
      try {
        const existing = await db.group.findFirst({ where: { name: g.name } })
        if (existing) {
          groupIdMap.set(g.id, existing.id)
          groupsSkipped++
        } else {
          const created = await db.group.create({
            data: {
              name: g.name,
              logo: g.logo,
              monthlyTarget: g.monthlyTarget ?? 0,
              week1Target: g.week1Target ?? 0,
              week2Target: g.week2Target ?? 0,
              week3Target: g.week3Target ?? 0,
              week4Target: g.week4Target ?? 0,
              week5Target: g.week5Target ?? 0,
            },
          })
          groupIdMap.set(g.id, created.id)
          groupsImported++
        }
      } catch {
        groupsSkipped++
      }
    }

    // ── Import Crews (upsert by name) ──
    const crewIdMap = new Map<string, string>() // old id → new id
    let crewsImported = 0
    let crewsSkipped = 0

    for (const c of jsonData.crews) {
      try {
        // Map old groupId to new groupId
        const newGroupId = groupIdMap.get(c.groupId)
        if (!newGroupId) {
          crewsSkipped++
          continue
        }

        const existing = await db.crew.findFirst({ where: { name: c.name } })
        if (existing) {
          crewIdMap.set(c.id, existing.id)
          crewsSkipped++
        } else {
          const created = await db.crew.create({
            data: {
              name: c.name,
              photo: c.photo,
              employeeId: c.employeeId,
              groupId: newGroupId,
            },
          })
          crewIdMap.set(c.id, created.id)
          crewsImported++
        }
      } catch {
        crewsSkipped++
      }
    }

    // ── Import Sales (DEDUP v6: tanggal + idPenjualan + kodeExtend) ──
    let salesImported = 0
    let salesSkipped = 0

    // Chunk processing to avoid overwhelming DB
    const CHUNK_SIZE = 100
    for (let i = 0; i < jsonData.sales.length; i += CHUNK_SIZE) {
      const chunk = jsonData.sales.slice(i, i + CHUNK_SIZE)
      await Promise.all(chunk.map(async (s) => {
        try {
          // DEDUP v6: check if this exact row already exists
          const whereClause: Record<string, unknown> = {
            tanggal: s.tanggal,
            kodeExtend: s.kodeExtend,
          }
          if (s.idPenjualan) {
            whereClause.idPenjualan = s.idPenjualan
          } else {
            whereClause.idPenjualan = null
          }

          const exists = await db.sale.findFirst({ where: whereClause })
          if (exists) {
            salesSkipped++
            return
          }

          // Map crewId
          const newCrewId = s.crewId ? crewIdMap.get(s.crewId) ?? null : null

          await db.sale.create({
            data: {
              tanggal: s.tanggal,
              idPenjualan: s.idPenjualan,
              statusRetention: s.statusRetention,
              retentionCode: s.retentionCode,
              kodeExtend: s.kodeExtend,
              brand: s.brand,
              dept: s.dept,
              modul: s.modul,
              ukuran: s.ukuran,
              qty: s.qty ?? 0,
              hjp: s.hjp ?? 0,
              netto: s.netto ?? 0,
              diskon: s.diskon ?? 0,
              diskonRp: s.diskonRp ?? 0,
              potongan: s.potongan ?? 0,
              potonganV: s.potonganV ?? 0,
              settle: s.settle ?? 0,
              pembayaran: s.pembayaran,
              program: s.program,
              channelStock: s.channelStock,
              claimedAt: s.claimedAt ? new Date(s.claimedAt) : null,
              crewId: newCrewId,
            },
          })
          salesImported++
        } catch {
          salesSkipped++
        }
      }))
    }

    return NextResponse.json({
      success: true,
      summary: {
        groups: { imported: groupsImported, skipped: groupsSkipped, total: jsonData.groups.length },
        crews: { imported: crewsImported, skipped: crewsSkipped, total: jsonData.crews.length },
        sales: { imported: salesImported, skipped: salesSkipped, total: jsonData.sales.length },
        clearExisting,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
