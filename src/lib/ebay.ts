const TIMEOUT_MS = 10000
const TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
const BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search'

export interface EbayPriceData {
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
  listings_count: number
  demand_score: number
}

// In-process token cache — valid for 2h, refreshed 60s before expiry
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const appId = process.env.EBAY_APP_ID
  const certId = process.env.EBAY_CERT_ID
  if (!appId || !certId) return null

  const credentials = Buffer.from(`${appId}:${certId}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  })

  if (!res.ok) return null
  const data = await res.json()
  if (!data.access_token) return null

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedToken.value
}

function fetchWithTimeout(url: string, token: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer))
}

interface EbaySummaryItem {
  price?: { value?: string; currency?: string }
  condition?: string
}

function extractNewUsdPrices(items: EbaySummaryItem[]): number[] {
  return items.flatMap(item => {
    if (item.price?.currency !== 'USD') return []
    // Only New condition — filters out Used, Complete, Parts Only, etc.
    const cond = item.condition?.toLowerCase() ?? ''
    if (!cond.startsWith('new')) return []
    const val = parseFloat(item.price?.value ?? '')
    return !isNaN(val) && val > 0 ? [val] : []
  })
}

/**
 * Fetches active New-condition eBay listings for a LEGO set using the Browse API.
 * Returns avg/min/max asking prices and total active listing count.
 *
 * Note: These are active asking prices, not completed sale prices.
 * The Marketplace Insights API (sold prices) requires additional scope approval.
 */
export async function fetchEbayPriceData(setNumber: string, setName?: string): Promise<EbayPriceData | null> {
  if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) return null

  const token = await getAccessToken()
  if (!token) return null

  const keywords = setName ? `LEGO ${setNumber} ${setName}` : `LEGO ${setNumber}`

  try {
    // Fetch up to 200 listings (2 pages of 100) for a better price sample
    const fetchPage = async (offset: number) => {
      const params = new URLSearchParams({
        q: keywords,
        limit: '100',
        offset: String(offset),
      })
      const res = await fetchWithTimeout(`${BROWSE_URL}?${params}`, token)
      if (!res.ok) return { items: [], total: 0 }
      const data = await res.json()
      return {
        items: (data.itemSummaries ?? []) as EbaySummaryItem[],
        total: data.total ?? 0,
      }
    }

    const first = await fetchPage(0)
    const secondItems = first.total > 100 ? (await fetchPage(100)).items : []
    const allItems = [...first.items, ...secondItems]

    const prices = extractNewUsdPrices(allItems)
    // listings_count = total New listings (filter from all items we fetched)
    const newListingsCount = allItems.filter(i => i.condition?.toLowerCase().startsWith('new')).length
    // Scale up the count proportionally if there are more pages we didn't fetch
    const scaledCount = first.total > 200
      ? Math.round(newListingsCount * (first.total / allItems.length))
      : newListingsCount

    let avg_price_usd: number | null = null
    let min_price_usd: number | null = null
    let max_price_usd: number | null = null

    if (prices.length > 0) {
      const sum = prices.reduce((s, p) => s + p, 0)
      avg_price_usd = Math.round((sum / prices.length) * 100) / 100
      min_price_usd = Math.round(Math.min(...prices) * 100) / 100
      max_price_usd = Math.round(Math.max(...prices) * 100) / 100
    }

    return {
      avg_price_usd,
      min_price_usd,
      max_price_usd,
      listings_count: scaledCount,
      demand_score: 0, // Requires buy.marketplace.insights scope — not yet approved
    }
  } catch {
    return null
  }
}
