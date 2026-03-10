const TIMEOUT_MS = 10000
const FINDING_API_URL = 'https://svcs.ebay.com/services/search/FindingService/v1'

export interface EbayPriceData {
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
  listings_count: number
  demand_score: number
}

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer))
}

function buildFindingUrl(operation: string, keywords: string, entriesPerPage = 100): string {
  const params = new URLSearchParams({
    'OPERATION-NAME': operation,
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': process.env.EBAY_APP_ID!,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    'keywords': keywords,
    'paginationInput.entriesPerPage': String(entriesPerPage),
    'itemFilter(0).name': 'ListingType',
    'itemFilter(0).value': 'AuctionWithBIN,FixedPrice',
    'itemFilter(1).name': 'Currency',
    'itemFilter(1).value': 'USD',
  })
  return `${FINDING_API_URL}?${params}`
}

interface EbayItem {
  sellingStatus?: { currentPrice?: { __value__?: string }[] }[]
}

function extractPricesFromItems(items: EbayItem[]): number[] {
  return items
    .map(item => parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ ?? ''))
    .filter(p => !isNaN(p) && p > 0)
}

async function fetchCompletedItems(keywords: string): Promise<{ prices: number[]; count: number }> {
  const res = await fetchWithTimeout(buildFindingUrl('findCompletedItems', keywords, 100))
  if (!res.ok) return { prices: [], count: 0 }
  const data = await res.json()
  const root = data.findCompletedItemsResponse?.[0]
  const items: EbayItem[] = root?.searchResult?.[0]?.item ?? []
  const countStr = root?.paginationOutput?.[0]?.totalEntries?.[0]
  return {
    prices: extractPricesFromItems(items),
    count: parseInt(countStr ?? '0', 10) || 0,
  }
}

async function fetchActiveCount(keywords: string): Promise<number> {
  const res = await fetchWithTimeout(buildFindingUrl('findItemsByKeywords', keywords, 1))
  if (!res.ok) return 0
  const data = await res.json()
  const countStr = data.findItemsByKeywordsResponse?.[0]?.paginationOutput?.[0]?.totalEntries?.[0]
  return parseInt(countStr ?? '0', 10) || 0
}

/**
 * Calls eBay Finding API for a LEGO set number.
 * Returns real avg/min/max prices from completed (sold) listings,
 * plus demand score derived from sold/(sold+active) ratio.
 */
export async function fetchEbayPriceData(setNumber: string): Promise<EbayPriceData | null> {
  if (!process.env.EBAY_APP_ID) return null

  const keywords = `LEGO ${setNumber}`

  try {
    const [completed, activeCount] = await Promise.all([
      fetchCompletedItems(keywords),
      fetchActiveCount(keywords),
    ])

    const { prices, count: soldCount } = completed
    const total = soldCount + activeCount
    const demand_score = total > 0 ? Math.round((soldCount / total) * 100) : 0

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
      listings_count: activeCount,
      demand_score,
    }
  } catch {
    return null
  }
}
