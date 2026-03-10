import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'
import type { InventoryItem, GroupedSet } from '@/types/inventory'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: allItems } = await supabase
    .from('inventory_items')
    .select('*, sets(*)')
    .order('created_at', { ascending: false })

  const items = (allItems ?? []) as InventoryItem[]
  const activeItems = items.filter(i => !i.sold)
  const soldItems = items.filter(i => i.sold)

  // Group active items by set_number
  const grouped = activeItems.reduce<Record<string, GroupedSet>>((acc, item) => {
    const key = item.sets.set_number
    if (!acc[key]) {
      const retail = item.sets.override_retail_price_usd ?? item.sets.retail_price_usd
      acc[key] = {
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
            {groupedSets.map(group => (
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
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">Resale</p>
                  <p className="text-gray-400 text-sm">— coming soon</p>
                </div>
              </Link>
            ))}
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
