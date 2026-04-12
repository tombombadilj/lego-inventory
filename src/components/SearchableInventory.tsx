'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { GroupedSet } from '@/types/inventory'

const PILL_STYLES: Record<string, string> = {
  SELL: 'bg-green-900/60 text-green-400',
  HOLD: 'bg-yellow-900/50 text-yellow-400',
  'VELOCITY SELL': 'bg-green-600 text-white',
  'STRATEGIC HOLD': 'bg-purple-900/50 text-purple-400',
  LIQUIDATE: 'bg-orange-900/50 text-orange-400',
  NO_DATA: 'bg-gray-700 text-gray-400',
}

const SELL_LABELS = new Set(['VELOCITY SELL', 'SELL', 'LIQUIDATE'])
const HOLD_LABELS = new Set(['STRATEGIC HOLD', 'HOLD'])

type FilterTab = 'all' | 'sell' | 'hold'

const TAB_LABELS: Record<FilterTab, string> = { all: 'All', sell: 'Sell Now', hold: 'Holding' }

interface Props {
  groupedSets: GroupedSet[]
}

export default function SearchableInventory({ groupedSets }: Props) {
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')

  const afterSearch = query.trim()
    ? groupedSets.filter(g =>
        g.set_number.toLowerCase().includes(query.toLowerCase()) ||
        g.name.toLowerCase().includes(query.toLowerCase())
      )
    : groupedSets

  const filtered = activeFilter === 'sell'
    ? afterSearch.filter(g => SELL_LABELS.has(g.recommendation ?? ''))
    : activeFilter === 'hold'
    ? afterSearch.filter(g => HOLD_LABELS.has(g.recommendation ?? ''))
    : afterSearch

  const count = filtered.length
  const label =
    activeFilter === 'sell' ? `Sell Now (${count} ${count === 1 ? 'set' : 'sets'})`
    : activeFilter === 'hold' ? `Holding (${count} ${count === 1 ? 'set' : 'sets'})`
    : `Active Inventory (${count} ${count === 1 ? 'set' : 'sets'})`

  if (groupedSets.length === 0) {
    return (
      <>
        <h2 className="text-white font-semibold mb-3">Active Inventory (0 sets)</h2>
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-8 text-center mb-6">
          <p className="text-4xl mb-3">🧱</p>
          <p className="text-white font-medium">No sets yet</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Add your first set to get started</p>
          <Link href="/upload" className="inline-block bg-[#DA291C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700">
            Add Sets
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Search input */}
      <div className="relative mb-3">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by set number or name…"
          aria-label="Search inventory"
          className="w-full bg-[#2A2A2A] border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500 pr-8"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {(['all', 'sell', 'hold'] as FilterTab[]).map(tab => {
          const isActive = activeFilter === tab
          return (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              aria-pressed={isActive}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-[#DA291C] text-white'
                  : 'bg-[#2A2A2A] text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          )
        })}
      </div>

      <h2 className="text-white font-semibold mb-3">{label}</h2>

      {filtered.length === 0 ? (
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-8 text-center mb-6">
          <p className="text-gray-400 text-sm">
            {query ? `No sets match "${query}"` : 'No sets in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {filtered.map(group => (
            <Link
              key={group.set_number}
              href={`/sets/${group.set_number}`}
              className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-4 flex items-center gap-4 hover:border-gray-500 transition-colors block"
            >
              {group.image_url ? (
                <Image
                  src={group.image_url}
                  alt={group.name}
                  width={64}
                  height={64}
                  className="object-contain rounded-lg bg-white p-1 flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🧱</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-white font-medium truncate">{group.name}</p>
                </div>
                <p className="text-gray-400 text-xs">
                  #{group.set_number} · {group.theme} · {group.piece_count?.toLocaleString()} pcs
                </p>
                <p className="text-gray-400 text-xs mt-0.5">
                  {group.items.length} {group.items.length === 1 ? 'copy' : 'copies'} · Paid $
                  {group.total_paid.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="text-right flex-shrink-0 space-y-1">
                {group.avg_price_usd != null ? (
                  <>
                    <p className="text-white text-sm font-medium">
                      ${group.avg_price_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {group.retirement_status === 'Retired' && (
                      <span className="bg-red-600 text-white text-[10px] font-bold px-[7px] py-[2px] rounded-[3px] tracking-wide">
                        RETIRED
                      </span>
                    )}
                    {group.retirement_status === 'Retiring Soon' && (
                      <span className="bg-amber-600 text-white text-[10px] font-bold px-[7px] py-[2px] rounded-[3px] tracking-wide">
                        RETIRING SOON
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${PILL_STYLES[group.recommendation ?? 'NO_DATA'] ?? PILL_STYLES['NO_DATA']}`}
                      title={group.recommendation_reason}
                    >
                      {group.recommendation ?? 'NO_DATA'}
                    </span>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-gray-500">Resale</p>
                    {group.retirement_status === 'Retired' && (
                      <span className="bg-red-600 text-white text-[10px] font-bold px-[7px] py-[2px] rounded-[3px] tracking-wide">
                        RETIRED
                      </span>
                    )}
                    {group.retirement_status === 'Retiring Soon' && (
                      <span className="bg-amber-600 text-white text-[10px] font-bold px-[7px] py-[2px] rounded-[3px] tracking-wide">
                        RETIRING SOON
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${PILL_STYLES.NO_DATA}`}>NO DATA</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
