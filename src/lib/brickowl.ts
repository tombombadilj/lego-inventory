const TIMEOUT_MS = 10000
const BASE_URL = 'https://api.brickowl.com/v1'

export interface BrickOwlPriceData {
  avg_price_usd: number
  min_price_usd: number
  max_price_usd: number
}

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

async function lookupBoid(setNumber: string, apiKey: string): Promise<string | null> {
  const url = `${BASE_URL}/catalog/id_lookup?key=${apiKey}&id=${setNumber}&type=set`
  const res = await fetchWithTimeout(url)
  if (!res.ok) return null
  const data = await res.json()
  // BrickOwl returns { boid: "..." } or an array — handle both shapes
  if (Array.isArray(data) && data.length > 0) return String(data[0].boid)
  if (data?.boid) return String(data.boid)
  return null
}

/**
 * Fetches completed sale price history from BrickOwl for a given LEGO set number.
 * Returns null if API key is not configured or the set is not found.
 */
export async function fetchBrickOwlPriceData(setNumber: string): Promise<BrickOwlPriceData | null> {
  const apiKey = process.env.BRICKOWL_API_KEY
  if (!apiKey || apiKey === 'your-key-here') return null

  try {
    const boid = await lookupBoid(setNumber, apiKey)
    if (!boid) return null

    const url = `${BASE_URL}/catalog/price_history?key=${apiKey}&boid=${boid}`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return null

    const data = await res.json()
    // BrickOwl returns an array of { price, currency_code, date } objects (USD-converted)
    const entries: { price: string | number; currency_code?: string }[] = Array.isArray(data) ? data : []
    const usdPrices = entries
      .filter(e => !e.currency_code || e.currency_code === 'USD')
      .map(e => parseFloat(String(e.price)))
      .filter(p => !isNaN(p) && p > 0)

    if (usdPrices.length === 0) return null

    const avg = usdPrices.reduce((s, p) => s + p, 0) / usdPrices.length
    return {
      avg_price_usd: Math.round(avg * 100) / 100,
      min_price_usd: Math.round(Math.min(...usdPrices) * 100) / 100,
      max_price_usd: Math.round(Math.max(...usdPrices) * 100) / 100,
    }
  } catch {
    return null
  }
}
