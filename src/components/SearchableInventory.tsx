'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { GroupedSet } from '@/types/inventory'

interface Props {
  groupedSets: GroupedSet[]
}

export default function SearchableInventory({ groupedSets }: Props) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? groupedSets.filter(g =>
        g.set_number.toLowerCase().includes(query.toLowerCase()) ||
        g.name.toLowerCase().includes(query.toLowerCase())
      )
    : groupedSets

  const count = filtered.length
  const label = `Active Inventory (${count} ${count === 1 ? 'set' : 'sets'})`

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

      <h2 className="text-white font-semibold mb-3">{label}</h2>

      {filtered.length === 0 ? (
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-8 text-center mb-6">
          <p className="text-gray-400 text-sm">No sets match &ldquo;{query}&rdquo;</p>
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
                  {group.retired && (
                    <span className="bg-yellow-900/50 text-yellow-400 text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                      RETIRED
                    </span>
                  )}
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
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-gray-500">Resale</p>
                <p className="text-gray-400 text-sm">— coming soon</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
