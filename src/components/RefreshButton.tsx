'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RefreshButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Auto-clear feedback after 5 seconds
  useEffect(() => {
    if (!result && !error) return
    const id = setTimeout(() => {
      setResult(null)
      setError(null)
    }, 5000)
    return () => clearTimeout(id)
  }, [result, error])

  async function handleRefresh() {
    const controller = new AbortController()
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/sets/refresh', { method: 'POST', signal: controller.signal })
      if (!res.ok) {
        setError('Refresh failed')
        return
      }
      const data = await res.json()
      setResult(`Updated ${data.refreshed} set${data.refreshed !== 1 ? 's' : ''}`)
      router.refresh()
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError('Refresh failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleRefresh}
        disabled={loading}
        title="Refresh retirement status from Brickset"
        className="text-gray-400 hover:text-white transition-colors disabled:opacity-40 text-base leading-none"
        aria-label="Refresh retirement status"
      >
        {loading ? '⏳' : '🔄'}
      </button>
      {result && <span className="text-green-400 text-xs">{result}</span>}
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  )
}
