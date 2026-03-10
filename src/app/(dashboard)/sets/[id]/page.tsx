'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getRecommendation } from '@/lib/recommendations'

interface InventoryItem {
  id: string
  purchased_from: string | null
  purchase_price_usd: number | null
  purchase_date: string | null
  condition: string
  notes: string | null
  sold: boolean
  sold_price_usd: number | null
  sold_date: string | null
  sold_via: string | null
}

interface PriceSnapshot {
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
  demand_score: number
  listings_count: number
  fetched_at: string
  source: string
}

interface SetGroup {
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retail_price_usd: number | null
  override_retail_price_usd: number | null
  retired: boolean
  override_retired: boolean | null
  image_url: string | null
  items: InventoryItem[]
}

type Modal = { type: 'edit' | 'sell'; item: InventoryItem } | null

const PILL_STYLES = {
  SELL: 'bg-green-900/60 text-green-400 border-green-700',
  HOLD: 'bg-yellow-900/50 text-yellow-400 border-yellow-700',
  WATCH: 'bg-orange-900/50 text-orange-400 border-orange-700',
  NO_DATA: 'bg-gray-700 text-gray-400 border-gray-600',
}

export default function SetDetailPage() {
  const { id: setNumber } = useParams<{ id: string }>()
  const router = useRouter()
  const [group, setGroup] = useState<SetGroup | null>(null)
  const [snapshot, setSnapshot] = useState<PriceSnapshot | null>(null)
  const [priceLoading, setPriceLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function loadData() {
    const res = await fetch('/api/sets?all=true')
    const items = await res.json()
    const filtered = items.filter((i: { sets: { set_number: string } }) => i.sets.set_number === setNumber)
    if (filtered.length === 0) { router.push('/dashboard'); return }
    const s = filtered[0].sets
    setGroup({
      set_number: s.set_number,
      name: s.name,
      theme: s.theme,
      piece_count: s.piece_count,
      retail_price_usd: s.retail_price_usd,
      override_retail_price_usd: s.override_retail_price_usd,
      retired: s.override_retired ?? s.retired,
      override_retired: s.override_retired,
      image_url: s.image_url,
      items: filtered.map((i: { id: string; purchased_from: string | null; purchase_price_usd: number | null; purchase_date: string | null; condition: string; notes: string | null; sold: boolean; sold_price_usd: number | null; sold_date: string | null; sold_via: string | null }) => ({
        id: i.id,
        purchased_from: i.purchased_from,
        purchase_price_usd: i.purchase_price_usd,
        purchase_date: i.purchase_date,
        condition: i.condition,
        notes: i.notes,
        sold: i.sold,
        sold_price_usd: i.sold_price_usd,
        sold_date: i.sold_date,
        sold_via: i.sold_via,
      })),
    })
    setLoading(false)
  }

  async function loadPriceData(force = false) {
    if (force) setRefreshing(true)
    else setPriceLoading(true)
    try {
      const url = `/api/prices/fetch?set_number=${setNumber}${force ? '&force=true' : ''}`
      const res = await fetch(url)
      const data = await res.json()
      // 429 too_soon: server still returns the cached snapshot inside data.cached
      if (res.status === 429 && data.cached) setSnapshot(data.cached)
      else if (res.ok) setSnapshot(data)
    } catch { /* silently degrade */ }
    if (force) setRefreshing(false)
    else setPriceLoading(false)
  }

  function getRefreshStatus(fetchedAt: string): { disabled: boolean; label: string } {
    const COOLDOWN_MS = 48 * 60 * 60 * 1000
    const age = Date.now() - new Date(fetchedAt).getTime()
    if (age < COOLDOWN_MS) {
      const remainingHours = Math.ceil((COOLDOWN_MS - age) / (1000 * 60 * 60))
      return { disabled: true, label: `Refresh in ${remainingHours}h` }
    }
    return { disabled: false, label: 'Refresh prices' }
  }

  useEffect(() => {
    loadData()
    loadPriceData(false)
  }, [setNumber])

  function openEdit(item: InventoryItem) {
    setForm({
      purchased_from: item.purchased_from ?? '',
      purchase_price_usd: item.purchase_price_usd?.toString() ?? '',
      purchase_date: item.purchase_date ?? '',
      condition: item.condition,
      notes: item.notes ?? '',
    })
    setModal({ type: 'edit', item })
  }

  function openSell(item: InventoryItem) {
    setForm({ sold_price_usd: '', sold_date: new Date().toISOString().slice(0, 10), sold_via: '' })
    setModal({ type: 'sell', item })
  }

  async function saveEdit() {
    if (!modal) return
    setSaving(true)
    await fetch(`/api/sets/${modal.item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchased_from: form.purchased_from || null,
        purchase_price_usd: form.purchase_price_usd ? parseFloat(form.purchase_price_usd) : null,
        purchase_date: form.purchase_date || null,
        condition: form.condition,
        notes: form.notes || null,
      }),
    })
    setModal(null)
    setSaving(false)
    loadData()
  }

  async function saveSell() {
    if (!modal) return
    setSaving(true)
    await fetch(`/api/sets/${modal.item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sold: true,
        sold_price_usd: form.sold_price_usd ? parseFloat(form.sold_price_usd) : null,
        sold_date: form.sold_date || null,
        sold_via: form.sold_via || null,
      }),
    })
    setModal(null)
    setSaving(false)
    loadData()
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this copy from your inventory?')) return
    await fetch(`/api/sets/${id}`, { method: 'DELETE' })
    loadData()
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
      <p className="text-gray-400 animate-pulse">Loading…</p>
    </div>
  )

  if (!group) return null
  const retailPrice = group.override_retail_price_usd ?? group.retail_price_usd

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <nav className="bg-[#2A2A2A] border-b border-gray-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
      </nav>

      <div className="max-w-2xl mx-auto p-4">
        {/* Set header */}
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-4 flex gap-4 mb-6">
          {group.image_url ? (
            <img src={group.image_url} alt={group.name} className="w-24 h-24 object-contain rounded-lg bg-white p-1 flex-shrink-0" />
          ) : (
            <div className="w-24 h-24 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-3xl">🧱</span>
            </div>
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-white font-bold text-lg">{group.name}</h1>
              {group.retired && (
                <span className="bg-yellow-900/50 text-yellow-400 text-xs px-2 py-0.5 rounded font-medium">RETIRED</span>
              )}
            </div>
            <p className="text-gray-400 text-sm">#{group.set_number} · {group.theme}</p>
            <div className="flex gap-4 mt-2 text-sm text-gray-400">
              {group.piece_count && <span>{group.piece_count.toLocaleString()} pcs</span>}
              {retailPrice && <span>Retail: ${retailPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>}
            </div>
          </div>
        </div>

        {/* Resale price card */}
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
                <p className="text-white font-semibold text-sm">Resale Market</p>
                <p className="text-gray-600 text-xs">New/sealed asking prices · eBay</p>
              </div>
            <div className="flex items-center gap-2">
              {snapshot && (
                <p className="text-gray-500 text-xs">
                  Updated {new Date(snapshot.fetched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {snapshot.source && snapshot.source !== 'none' && (
                    <span className="ml-1 text-gray-600">· {snapshot.source}</span>
                  )}
                </p>
              )}
              {snapshot && (() => {
                const { disabled, label } = getRefreshStatus(snapshot.fetched_at)
                return (
                  <button
                    onClick={() => loadPriceData(true)}
                    disabled={disabled || refreshing}
                    title={disabled ? label : 'Fetch latest prices from eBay'}
                    className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                      disabled || refreshing
                        ? 'border-gray-700 text-gray-600 cursor-not-allowed'
                        : 'border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 cursor-pointer'
                    }`}
                  >
                    {refreshing ? 'Fetching…' : label}
                  </button>
                )
              })()}
            </div>
          </div>

          {priceLoading ? (
            <p className="text-gray-500 text-sm animate-pulse">Fetching market data…</p>
          ) : (() => {
            const avgPurchase = group
              ? group.items.filter(i => i.purchase_price_usd != null).reduce((s, i) => s + (i.purchase_price_usd ?? 0), 0) /
                Math.max(group.items.filter(i => i.purchase_price_usd != null).length, 1)
              : null
            const { recommendation, reason } = getRecommendation(snapshot, {
              purchase_price_usd: avgPurchase,
              retired: group?.retired ?? false,
              sell_threshold_pct: 10,
              demand_drop_pts: 20,
            })

            return snapshot?.avg_price_usd != null ? (
              <>
                {/* Price row */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Avg</p>
                    <p className="text-white font-bold">${snapshot.avg_price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="text-center border-x border-gray-700">
                    <p className="text-xs text-gray-400 mb-0.5">Min</p>
                    <p className="text-green-400 font-medium">${(snapshot.min_price_usd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Max</p>
                    <p className="text-red-400 font-medium">${(snapshot.max_price_usd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                </div>

                {/* Demand row */}
                <div className="flex items-center gap-3 mb-3 text-xs text-gray-400">
                  <span>Demand score: <span className="text-white font-medium">{snapshot.demand_score}/100</span></span>
                  <span className="text-gray-600">·</span>
                  <span>{snapshot.listings_count} active New listings</span>
                </div>

                {/* Demand bar */}
                <div className="w-full bg-gray-700 rounded-full h-1.5 mb-3">
                  <div
                    className={`h-1.5 rounded-full transition-all ${snapshot.demand_score >= 60 ? 'bg-green-400' : snapshot.demand_score >= 30 ? 'bg-yellow-400' : 'bg-orange-400'}`}
                    style={{ width: `${snapshot.demand_score}%` }}
                  />
                </div>

                {/* Recommendation */}
                <div className={`flex items-start gap-2 p-3 rounded-lg border ${PILL_STYLES[recommendation]}`}>
                  <span className="font-bold text-sm flex-shrink-0">{recommendation}</span>
                  <span className="text-xs opacity-90">{reason}</span>
                </div>
              </>
            ) : (
              <div className={`flex items-center gap-2 p-3 rounded-lg border ${PILL_STYLES.NO_DATA}`}>
                <span className="font-bold text-sm">NO DATA</span>
                <span className="text-xs opacity-75">No resale data found. Prices will appear once eBay or BrickOwl data is fetched.</span>
              </div>
            )
          })()}
        </div>

        {/* Your copies */}
        <h2 className="text-white font-semibold mb-3">Your Copies ({group.items.length})</h2>
        <div className="space-y-3">
          {group.items.map((item, i) => (
            <div key={item.id} className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-white text-sm font-medium">Copy {i + 1}</p>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                  item.condition === 'sealed' ? 'bg-green-900/50 text-green-400' :
                  item.condition === 'open' ? 'bg-blue-900/50 text-blue-400' :
                  'bg-gray-700 text-gray-300'
                }`}>{item.condition}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-400 mb-3">
                {item.purchased_from && <span>Store: {item.purchased_from}</span>}
                {item.purchase_price_usd != null && <span>Paid: ${item.purchase_price_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>}
                {item.purchase_date && <span>Date: {item.purchase_date}</span>}
                {item.notes && <span className="col-span-2">Notes: {item.notes}</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(item)}
                  className="text-xs border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 px-3 py-1.5 rounded-lg transition-colors">
                  Edit
                </button>
                <button onClick={() => openSell(item)}
                  className="text-xs border border-[#F5C400] text-[#F5C400] hover:bg-yellow-900/20 px-3 py-1.5 rounded-lg transition-colors">
                  Mark as Sold
                </button>
                <button onClick={() => deleteItem(item.id)}
                  className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 transition-colors ml-auto">
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit Modal */}
      {modal?.type === 'edit' && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-5 w-full max-w-md space-y-4">
            <h3 className="text-white font-semibold">Edit Copy</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Store</label>
                <input type="text" value={form.purchased_from} onChange={e => setForm(f => ({ ...f, purchased_from: e.target.value }))}
                  className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Price Paid ($)</label>
                <input type="number" value={form.purchase_price_usd} onChange={e => setForm(f => ({ ...f, purchase_price_usd: e.target.value }))}
                  className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Purchase Date</label>
                <input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                  className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Condition</label>
                <select value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                  className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]">
                  <option value="sealed">Sealed</option>
                  <option value="open">Open</option>
                  <option value="complete">Complete</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
            </div>
            <div className="flex gap-3">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 bg-[#DA291C] text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setModal(null)}
                className="flex-1 border border-gray-600 text-gray-300 py-2 rounded-lg text-sm hover:text-white">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sell Modal */}
      {modal?.type === 'sell' && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-5 w-full max-w-md space-y-4">
            <h3 className="text-white font-semibold">Mark as Sold</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Sale Price ($)</label>
                <input type="number" placeholder="e.g. 950.00" value={form.sold_price_usd}
                  onChange={e => setForm(f => ({ ...f, sold_price_usd: e.target.value }))}
                  className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Date Sold</label>
                <input type="date" value={form.sold_date} onChange={e => setForm(f => ({ ...f, sold_date: e.target.value }))}
                  className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sold Via</label>
              <input type="text" placeholder="e.g. eBay, Facebook Marketplace…" value={form.sold_via}
                onChange={e => setForm(f => ({ ...f, sold_via: e.target.value }))}
                className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
            </div>
            <div className="flex gap-3">
              <button onClick={saveSell} disabled={saving}
                className="flex-1 bg-[#F5C400] text-black py-2 rounded-lg text-sm font-semibold hover:bg-yellow-400 disabled:opacity-50">
                {saving ? 'Saving…' : 'Confirm Sale'}
              </button>
              <button onClick={() => setModal(null)}
                className="flex-1 border border-gray-600 text-gray-300 py-2 rounded-lg text-sm hover:text-white">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
