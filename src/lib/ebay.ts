const TIMEOUT_MS = 10000
const FINDING_API_URL = 'https://svcs.ebay.com/services/search/FindingService/v1'

export interface EbayPriceData {
  listings_count: number
  demand_score: number
}

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
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
  })
  return `${FINDING_API_URL}?${params}`
}

async function fetchListingCount(keywords: string, operation: string): Promise<number> {
  const res = await fetchWithTimeout(buildFindingUrl(operation, keywords, 1), {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) return 0
  const data = await res.json()
  const root = operation === 'findCompletedItems'
    ? data.findCompletedItemsResponse?.[0]
    : data.findItemsByKeywordsResponse?.[0]
  const countStr = root?.paginationOutput?.[0]?.totalEntries?.[0]
  return parseInt(countStr ?? '0', 10) || 0
}

/**
 * Calls eBay Finding API to determine demand signals for a LEGO set.
 *
 * demand_score: 0-100, derived from sold/(active+sold) ratio.
 * A high score means many completed (sold) listings relative to active — strong demand.
 */
export async function fetchEbayPriceData(setNumber: string): Promise<EbayPriceData | null> {
  if (!process.env.EBAY_APP_ID) return null

  const keywords = `LEGO ${setNumber}`

  try {
    const [soldCount, activeCount] = await Promise.all([
      fetchListingCount(keywords, 'findCompletedItems'),
      fetchListingCount(keywords, 'findItemsByKeywords'),
    ])

    const total = soldCount + activeCount
    const demand_score = total > 0 ? Math.round((soldCount / total) * 100) : 0

    return {
      listings_count: activeCount,
      demand_score,
    }
  } catch {
    return null
  }
}
