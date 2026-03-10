import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import AlertsBell from '@/components/AlertsBell'
import { getRecommendation } from '@/lib/recommendations'

interface InventoryItem {
  id: string
  set_id: string
  purchased_from: string | null
  purchase_price_usd: number | null
  purchase_date: string | null
  condition: string
  sold: boolean
  sold_price_usd: number | null
  sold_date: string | null
  sold_via: string | null
  created_at: string
  sets: {
    id: string
    set_number: string
    name: string
    theme: string | null
    piece_count: number | null
    retail_price_usd: number | null
    retired: boolean
    image_url: string | null
    override_retail_price_usd: number | null
    override_retired: boolean | null
  }
}

interface PriceSnapshot {
  set_id: string
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
  demand_score: number
  listings_count: number
  fetched_at: string
}

interface GroupedSet {
  set_id: string
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retired: boolean
  image_url: string | null
  retail_price: number | null
  items: InventoryItem[]
  total_paid: number
}

const PILL_STYLES = {
  SELL: 'bg-green-900/60 text-green-400',
  HOLD: 'bg-yellow-900/50 text-yellow-400',
  WATCH: 'bg-orange-900/50 text-orange-400',
  NO_DATA: 'bg-gray-700 text-gray-400',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: allItems }, { data: settings }] = await Promise.all([
    supabase.from('inventory_items').select('*, sets(*)').order('created_at', { ascending: false }),
    supabase.from('user_settings').select('price_spike_pct, demand_drop_pts').eq('user_id', user!.id).single(),
  ])

  const items = (allItems ?? []) as InventoryItem[]
  const activeItems = items.filter(i => !i.sold)
  const soldItems = items.filter(i => i.sold)

  // Group active items by set_number
  const grouped = activeItems.reduce<Record<string, GroupedSet>>((acc, item) => {
    const key = item.sets.set_number
    if (!acc[key]) {
      const retail = item.sets.override_retail_price_usd ?? item.sets.retail_price_usd
      acc[key] = {
        set_id: item.sets.id,
        set_number: key,
        name: item.sets.name,
        theme: item.sets.theme,
        piece_count: item.sets.piece_count,
        retired: item.sets.override_retired ?? item.sets.retired,
        image_url: item.sets.image_url,
        retail_price: retail,
        items: [],
        total_paid: 0,
      }
    }
    acc[key].items.push(item)
    acc[key].total_paid += item.purchase_price_usd ?? 0
    return acc
  }, {})

  const groupedSets = Object.values(grouped)

  // Fetch latest price snapshot for each unique set_id
  const setIds = [...new Set(groupedSets.map(g => g.set_id))]
  let snapshotMap: Record<string, PriceSnapshot> = {}

  if (setIds.length > 0) {
    const { data: snapshots } = await supabase
      .from('price_snapshots')
      .select('set_id, avg_price_usd, min_price_usd, max_price_usd, demand_score, listings_count, fetched_at')
      .in('set_id', setIds)
      .order('fetched_at', { ascending: false })

    // Keep only the most recent snapshot per set_id
    for (const snap of (snapshots ?? []) as PriceSnapshot[]) {
      if (!snapshotMap[snap.set_id]) snapshotMap[snap.set_id] = snap
    }
  }

  const userSettings = settings ?? { price_spike_pct: 10, demand_drop_pts: 20 }

  const totalInvested = activeItems.reduce((sum, i) => sum + (i.purchase_price_usd ?? 0), 0)
  const totalSoldRevenue = soldItems.reduce((sum, i) => sum + (i.sold_price_usd ?? 0), 0)
  const totalSoldCost = soldItems.reduce((sum, i) => sum + (i.purchase_price_usd ?? 0), 0)

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      {/* Nav */}
      <nav className="bg-[#2A2A2A] border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#DA291C] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">L</span>
          </div>
          <span className="text-white font-semibold">LEGO Inventory</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/upload" className="bg-[#DA291C] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            + Add Sets
          </Link>
          <AlertsBell />
          <Link href="/settings" className="text-gray-400 hover:text-white text-sm transition-colors" title="Settings">⚙️</Link>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-4">

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3 my-4">
          <div className="bg-[#2A2A2A] rounded-xl p-3 border border-gray-700">
            <p className="text-xs text-gray-400">Active Sets</p>
            <p className="text-white font-bold text-xl">{activeItems.length}</p>
          </div>
          <div className="bg-[#2A2A2A] rounded-xl p-3 border border-gray-700">
            <p className="text-xs text-gray-400">Total Invested</p>
            <p className="text-white font-bold text-xl">${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-[#2A2A2A] rounded-xl p-3 border border-gray-700">
            <p className="text-xs text-gray-400">Sold P&L</p>
            <p className={`font-bold text-xl ${totalSoldRevenue - totalSoldCost >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalSoldRevenue - totalSoldCost >= 0 ? '+' : ''}${(totalSoldRevenue - totalSoldCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Active Inventory */}
        <h2 className="text-white font-semibold mb-3">Active Inventory ({groupedSets.length} sets)</h2>

        {groupedSets.length === 0 ? (
          <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-8 text-center mb-6">
            <p className="text-4xl mb-3">🧱</p>
            <p className="text-white font-medium">No sets yet</p>
            <p className="text-gray-400 text-sm mt-1 mb-4">Add your first set to get started</p>
            <Link href="/upload" className="inline-block bg-[#DA291C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
              Add Sets
            </Link>
          </div>
        ) : (
          <div className="space-y-3 mb-8">
            {groupedSets.map(group => {
              const snapshot = snapshotMap[group.set_id] ?? null
              const avgPurchasePrice = group.items.length > 0
                ? group.total_paid / group.items.filter(i => i.purchase_price_usd != null).length || null
                : null
              const { recommendation, reason } = getRecommendation(snapshot, {
                purchase_price_usd: avgPurchasePrice,
                retired: group.retired,
                sell_threshold_pct: userSettings.price_spike_pct,
                demand_drop_pts: userSettings.demand_drop_pts,
              })

              return (
                <Link key={group.set_number} href={`/sets/${group.set_number}`}
                  className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-4 flex items-center gap-4 hover:border-gray-500 transition-colors block">
                  {group.image_url ? (
                    <img src={group.image_url} alt={group.name} className="w-16 h-16 object-contain rounded-lg bg-white p-1 flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-2xl">🧱</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium truncate">{group.name}</p>
                      {group.retired && (
                        <span className="bg-yellow-900/50 text-yellow-400 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">RETIRED</span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs">#{group.set_number} · {group.theme} · {group.piece_count?.toLocaleString()} pcs</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {group.items.length} {group.items.length === 1 ? 'copy' : 'copies'} · Paid ${group.total_paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    {snapshot?.avg_price_usd != null ? (
                      <>
                        <p className="text-white text-sm font-medium">
                          ${snapshot.avg_price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${PILL_STYLES[recommendation]}`} title={reason}>
                          {recommendation}
                        </span>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500">Resale</p>
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${PILL_STYLES.NO_DATA}`}>
                          NO DATA
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Sold History */}
        {soldItems.length > 0 && (
          <>
            <h2 className="text-white font-semibold mb-3">Sold History ({soldItems.length} items)</h2>
            <div className="space-y-2">
              {soldItems.map(item => {
                const profit = (item.sold_price_usd ?? 0) - (item.purchase_price_usd ?? 0)
                return (
                  <div key={item.id} className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{item.sets.name}</p>
                      <p className="text-gray-400 text-xs">#{item.sets.set_number} · Sold via {item.sold_via ?? '—'} · {item.sold_date ?? '—'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-white text-sm font-medium">${item.sold_price_usd?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '—'}</p>
                      <p className={`text-xs font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {profit >= 0 ? '+' : ''}${profit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
