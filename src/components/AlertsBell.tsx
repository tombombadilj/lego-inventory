'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function AlertsBell() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    fetch('/api/alerts/count')
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setCount(d.count ?? 0))
      .catch(() => {})
  }, [])

  return (
    <Link href="/alerts" className="relative text-gray-400 hover:text-white transition-colors" title="Alerts">
      <span className="text-lg">🔔</span>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-[#DA291C] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  )
}
