'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Settings {
  price_alert_threshold_pct: number
  demand_drop_alert_threshold_pct: number
  email_alerts_enabled: boolean
}

const DEFAULTS: Settings = {
  price_alert_threshold_pct: 10,
  demand_drop_alert_threshold_pct: 20,
  email_alerts_enabled: false,
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setSettings({ ...DEFAULTS, ...data })
        }
        setLoading(false)
      })
  }, [])

  async function save() {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      <nav className="bg-[#2A2A2A] border-b border-gray-700 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/dashboard" className="text-gray-400 hover:text-white text-sm">← Dashboard</Link>
        <span className="text-white font-semibold">Settings</span>
      </nav>

      <div className="max-w-lg mx-auto p-4">
        {loading ? (
          <p className="text-gray-400 text-center mt-8 animate-pulse">Loading…</p>
        ) : (
          <div className="space-y-6 mt-4">

            {/* Alert thresholds */}
            <section className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-5 space-y-4">
              <h2 className="text-white font-semibold">Alert Thresholds (Phase 2)</h2>
              <p className="text-gray-400 text-xs">These settings will take effect once eBay resale data is available.</p>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Price gain alert threshold
                  <span className="text-gray-500 text-xs ml-1">— alert when resale price rises by this %</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={1} max={50} step={1}
                    value={settings.price_alert_threshold_pct}
                    onChange={e => setSettings(s => ({ ...s, price_alert_threshold_pct: parseInt(e.target.value) }))}
                    className="flex-1 accent-[#DA291C]"
                  />
                  <span className="text-white font-bold w-12 text-right">{settings.price_alert_threshold_pct}%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Demand drop alert threshold
                  <span className="text-gray-500 text-xs ml-1">— alert when demand drops by this %</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={1} max={50} step={1}
                    value={settings.demand_drop_alert_threshold_pct}
                    onChange={e => setSettings(s => ({ ...s, demand_drop_alert_threshold_pct: parseInt(e.target.value) }))}
                    className="flex-1 accent-[#DA291C]"
                  />
                  <span className="text-white font-bold w-12 text-right">{settings.demand_drop_alert_threshold_pct}%</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="email-alerts"
                  checked={settings.email_alerts_enabled}
                  onChange={e => setSettings(s => ({ ...s, email_alerts_enabled: e.target.checked }))}
                  className="w-4 h-4 accent-[#DA291C]"
                />
                <label htmlFor="email-alerts" className="text-sm text-gray-300">Enable email alerts (Phase 2)</label>
              </div>
            </section>

            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-[#DA291C] text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
