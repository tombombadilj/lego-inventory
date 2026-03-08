'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface SetData {
  id: string
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retail_price_usd: number | null
  image_url: string | null
  retired: boolean
}

function ConfirmSetContent() {
  const params = useSearchParams()
  const router = useRouter()
  const setNumber = params.get('set_number') ?? ''

  const [setData, setSetData] = useState<SetData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    purchased_from: '',
    purchase_price_usd: '',
    purchase_date: '',
    condition: 'sealed',
    notes: '',
  })
  const [duplicateWarning, setDuplicateWarning] = useState(false)

  useEffect(() => {
    if (!setNumber) return
    fetch(`/api/lego-status?set_number=${setNumber}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { setSetData(data); setLoading(false) })
      .catch(() => { setError(`Set ${setNumber} not found. Check the number and try again.`); setLoading(false) })
  }, [setNumber])

  async function handleAdd(force = false) {
    if (!setData) return
    setSaving(true)
    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        set_id: setData.id,
        force,
        purchased_from: form.purchased_from || null,
        purchase_price_usd: form.purchase_price_usd ? parseFloat(form.purchase_price_usd) : null,
        purchase_date: form.purchase_date || null,
        condition: form.condition,
        notes: form.notes || null,
      }),
    })

    if (res.status === 409) {
      const data = await res.json()
      setDuplicateWarning(true)
      setSaving(false)
      return
    }

    if (res.ok) {
      router.push('/dashboard')
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to save')
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
      <p className="text-gray-400 animate-pulse">Looking up set {setNumber}…</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center p-4">
      <div className="text-center">
        <p className="text-red-400 font-medium">{error}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-gray-400 hover:text-white">← Go back</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#1A1A1A] p-4">
      <div className="max-w-lg mx-auto">
        <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-white mb-4 block">← Back</button>

        {/* Set info */}
        {setData && (
          <div className="bg-[#2A2A2A] rounded-xl border border-gray-700 p-4 mb-6 flex gap-4">
            {setData.image_url && (
              <img src={setData.image_url} alt={setData.name} className="w-24 h-24 object-contain rounded-lg bg-white p-1" />
            )}
            <div>
              <p className="text-xs text-gray-400 font-mono">#{setData.set_number}</p>
              <p className="text-white font-bold text-lg leading-tight">{setData.name}</p>
              {setData.theme && <p className="text-gray-400 text-sm">{setData.theme}</p>}
              <div className="flex gap-3 mt-1 text-xs text-gray-400">
                {setData.piece_count && <span>{setData.piece_count.toLocaleString()} pcs</span>}
                {setData.retired && <span className="text-yellow-400 font-medium">RETIRED</span>}
              </div>
            </div>
          </div>
        )}

        {/* Duplicate warning */}
        {duplicateWarning && (
          <div className="bg-yellow-900/30 border border-yellow-600 rounded-xl p-4 mb-4">
            <p className="text-yellow-400 font-medium text-sm">You already have 3 or more copies of this set.</p>
            <p className="text-gray-400 text-xs mt-1">Are you sure you want to add another?</p>
            <div className="flex gap-3 mt-3">
              <button onClick={() => handleAdd(true)}
                className="bg-yellow-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-yellow-700">
                Yes, add anyway
              </button>
              <button onClick={() => setDuplicateWarning(false)}
                className="text-gray-400 hover:text-white text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Purchase details form */}
        <div className="bg-[#2A2A2A] rounded-xl border border-gray-700 p-4 space-y-4">
          <p className="text-white font-medium">Purchase Details <span className="text-gray-500 text-xs font-normal">(all optional)</span></p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Store / Source</label>
              <input type="text" placeholder="e.g. Target" value={form.purchased_from}
                onChange={e => setForm(f => ({ ...f, purchased_from: e.target.value }))}
                className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Price Paid ($)</label>
              <input type="number" placeholder="e.g. 849.99" value={form.purchase_price_usd}
                onChange={e => setForm(f => ({ ...f, purchase_price_usd: e.target.value }))}
                className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Purchase Date</label>
              <input type="date" value={form.purchase_date}
                onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))}
                className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Condition</label>
              <select value={form.condition}
                onChange={e => setForm(f => ({ ...f, condition: e.target.value }))}
                className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]">
                <option value="sealed">Sealed</option>
                <option value="open">Open</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Notes</label>
            <input type="text" placeholder="Any additional notes…" value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
          </div>

          <button onClick={() => handleAdd(false)} disabled={saving}
            className="w-full bg-[#DA291C] text-white py-2.5 px-4 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
            {saving ? 'Adding…' : 'Add to Inventory'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ConfirmSetPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1A1A1A] flex items-center justify-center">
        <p className="text-gray-400 animate-pulse">Loading…</p>
      </div>
    }>
      <ConfirmSetContent />
    </Suspense>
  )
}
