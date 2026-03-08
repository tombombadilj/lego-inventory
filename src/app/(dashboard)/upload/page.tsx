'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Tab = 'photo' | 'manual' | 'csv'

interface CsvPreview {
  valid: Record<string, unknown>[]
  invalid: { row: number; raw: string; error: string }[]
  total: number
}

interface DetectedSet {
  setNumber: string
  checked: boolean
  qty: number
}

export default function UploadPage() {
  const [tab, setTab] = useState<Tab>('photo')
  const [preview, setPreview] = useState<string | null>(null)
  const [detected, setDetected] = useState<DetectedSet[]>([])
  const [loading, setLoading] = useState(false)
  const [manualInput, setManualInput] = useState('')
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const router = useRouter()

  function buildQueue(sets: DetectedSet[]) {
    // Expand selected sets by qty: [{setNumber:'75192', qty:2}] → ['75192','75192']
    return sets
      .filter(s => s.checked)
      .flatMap(s => Array(s.qty).fill(s.setNumber)) as string[]
  }

  function startQueue(sets: DetectedSet[]) {
    const queue = buildQueue(sets)
    if (queue.length === 0) return
    const [first, ...rest] = queue
    router.push(`/sets/confirm?set_number=${first}${rest.length ? `&queue=${rest.join(',')}` : ''}`)
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setDetected([])
    setLoading(true)
    const form = new FormData()
    form.append('image', file)
    const res = await fetch('/api/ocr', { method: 'POST', body: form })
    const data = await res.json()
    setDetected((data.setNumbers ?? []).map((n: string) => ({ setNumber: n, checked: true, qty: 1 })))
    setLoading(false)
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFile(file)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/inventory/import', { method: 'POST', body: form })
    const data = await res.json()
    setCsvPreview(data)
  }

  async function confirmCsvImport() {
    if (!csvFile) return
    setImportLoading(true)
    const form = new FormData()
    form.append('file', csvFile)
    form.append('confirm', 'true')
    const res = await fetch('/api/inventory/import', { method: 'POST', body: form })
    const data = await res.json()
    const saved = data.results?.filter((r: { status: string }) => r.status === 'saved').length ?? 0
    setImportMessage(`${saved} sets imported successfully.`)
    setCsvPreview(null)
    setCsvFile(null)
    setImportLoading(false)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'photo', label: '📷 Photo' },
    { id: 'manual', label: '✏️ Manual Entry' },
    { id: 'csv', label: '📄 CSV Upload' },
  ]

  return (
    <div className="max-w-lg mx-auto p-4">
      <h1 className="text-xl font-bold text-white mb-4">Add LEGO Sets</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-700 mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-[#DA291C] text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Photo tab */}
      {tab === 'photo' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Take a photo of one or more LEGO box fronts. The set numbers will be detected automatically.</p>
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#DA291C] file:text-white hover:file:bg-red-700" />
          {preview && <img src={preview} alt="Preview" className="mt-4 rounded-lg w-full" />}
          {loading && <p className="text-gray-400 text-sm animate-pulse">Scanning for set numbers…</p>}
          {detected.length > 0 && (
            <div>
              <p className="text-sm font-medium text-white mb-2">
                Detected {detected.length} set number{detected.length > 1 ? 's' : ''} — select which to add:
              </p>
              <ul className="space-y-2 mb-4">
                {detected.map((item, i) => (
                  <li key={`${item.setNumber}-${i}`}
                    className={`flex items-center gap-3 bg-[#2A2A2A] px-3 py-2.5 rounded-lg border transition-colors ${
                      item.checked ? 'border-gray-600' : 'border-gray-800 opacity-50'
                    }`}>
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={e => setDetected(d => d.map((s, j) => j === i ? { ...s, checked: e.target.checked } : s))}
                      className="w-4 h-4 accent-[#DA291C] flex-shrink-0"
                    />
                    {/* Set number */}
                    <span className="font-mono text-white flex-1">{item.setNumber}</span>
                    {/* Quantity picker */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDetected(d => d.map((s, j) => j === i ? { ...s, qty: Math.max(1, s.qty - 1) } : s))}
                        disabled={!item.checked || item.qty <= 1}
                        className="w-7 h-7 rounded-lg bg-gray-700 text-white text-lg leading-none flex items-center justify-center hover:bg-gray-600 disabled:opacity-30">
                        −
                      </button>
                      <span className="text-white font-medium w-4 text-center">{item.qty}</span>
                      <button
                        onClick={() => setDetected(d => d.map((s, j) => j === i ? { ...s, qty: s.qty + 1 } : s))}
                        disabled={!item.checked}
                        className="w-7 h-7 rounded-lg bg-gray-700 text-white text-lg leading-none flex items-center justify-center hover:bg-gray-600 disabled:opacity-30">
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {/* Summary + start button */}
              {(() => {
                const selected = detected.filter(s => s.checked)
                const totalCopies = selected.reduce((sum, s) => sum + s.qty, 0)
                return selected.length > 0 ? (
                  <button
                    onClick={() => startQueue(detected)}
                    className="w-full bg-[#DA291C] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
                    Add {totalCopies} {totalCopies === 1 ? 'copy' : 'copies'} across {selected.length} set{selected.length > 1 ? 's' : ''} →
                  </button>
                ) : (
                  <p className="text-center text-sm text-gray-500">Select at least one set to continue</p>
                )
              })()}
            </div>
          )}
          {!loading && detected.length === 0 && preview && (
            <p className="text-sm text-gray-500">No set numbers detected. Try a clearer photo or use manual entry.</p>
          )}
        </div>
      )}

      {/* Manual entry tab */}
      {tab === 'manual' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Enter a LEGO set number directly.</p>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Set Number</label>
            <input type="text" placeholder="e.g. 75192" value={manualInput}
              onChange={e => setManualInput(e.target.value.trim())}
              onKeyDown={e => e.key === 'Enter' && manualInput && router.push(`/sets/confirm?set_number=${manualInput}`)}
              className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#DA291C]" />
          </div>
          <button
            onClick={() => router.push(`/sets/confirm?set_number=${manualInput}`)}
            disabled={!manualInput}
            className="w-full bg-[#DA291C] text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
            Look Up Set
          </button>
        </div>
      )}

      {/* CSV upload tab */}
      {tab === 'csv' && (
        <div className="space-y-4">
          {/* Format instructions */}
          <div className="bg-[#2A2A2A] rounded-lg p-4 text-sm space-y-3 border border-gray-700">
            <p className="font-medium text-white">CSV Format</p>
            <p className="text-gray-400">Only <span className="font-mono text-yellow-400">set_number</span> is required. Leave optional columns blank — don't remove them.</p>
            <div className="font-mono text-xs bg-[#1A1A1A] border border-gray-600 rounded p-2 overflow-x-auto text-gray-300 whitespace-pre">
{`set_number,purchased_from,purchase_price,purchase_date,condition,notes
75192,Target,849.99,2023-12-01,sealed,Gift
10294,Amazon,679.99,,sealed,
21325,,,,,`}
            </div>
            <ul className="text-gray-400 space-y-1 text-xs">
              <li><span className="font-mono text-gray-200">purchase_price</span> — number only, no $ (e.g. <span className="font-mono">849.99</span>)</li>
              <li><span className="font-mono text-gray-200">purchase_date</span> — YYYY-MM-DD format</li>
              <li><span className="font-mono text-gray-200">condition</span> — <span className="font-mono">sealed</span>, <span className="font-mono">open</span>, or <span className="font-mono">complete</span></li>
            </ul>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent('set_number,purchased_from,purchase_price,purchase_date,condition,notes\n')}`}
              download="lego-inventory-template.csv"
              className="inline-block text-[#F5C400] text-xs hover:underline">
              ↓ Download blank template
            </a>
          </div>

          <input type="file" accept=".csv" onChange={handleCsvUpload}
            className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#DA291C] file:text-white hover:file:bg-red-700" />

          {importMessage && <p className="text-green-400 text-sm font-medium">{importMessage}</p>}

          {csvPreview && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="text-green-400 font-medium">✓ {csvPreview.valid.length} valid rows</span>
                {csvPreview.invalid.length > 0 && (
                  <span className="text-red-400 font-medium">✗ {csvPreview.invalid.length} errors (will be skipped)</span>
                )}
              </div>
              {csvPreview.invalid.length > 0 && (
                <ul className="text-xs text-red-400 space-y-1">
                  {csvPreview.invalid.map(e => (
                    <li key={e.row}>Row {e.row}: {e.error}</li>
                  ))}
                </ul>
              )}
              <button onClick={confirmCsvImport} disabled={importLoading || csvPreview.valid.length === 0}
                className="w-full bg-[#DA291C] text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">
                {importLoading ? 'Importing…' : `Import ${csvPreview.valid.length} Sets`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
