export type Recommendation = 'SELL' | 'HOLD' | 'WATCH' | 'NO_DATA'

export interface RecommendationResult {
  recommendation: Recommendation
  reason: string
}

export interface PriceSnapshot {
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
  demand_score: number
  listings_count: number
}

export interface InventoryContext {
  purchase_price_usd: number | null
  retired: boolean
  sell_threshold_pct: number  // user's price_spike_pct from user_settings
  demand_drop_pts: number     // user's demand_drop_pts from user_settings
}

/**
 * Pure function — determines a sell recommendation based on latest price snapshot
 * and the user's inventory context + thresholds.
 */
export function getRecommendation(
  snapshot: PriceSnapshot | null,
  ctx: InventoryContext
): RecommendationResult {
  if (!snapshot || snapshot.avg_price_usd === null) {
    return { recommendation: 'NO_DATA', reason: 'No resale price data available yet.' }
  }

  const { avg_price_usd, demand_score, listings_count } = snapshot
  const { purchase_price_usd, retired, sell_threshold_pct, demand_drop_pts } = ctx

  const lowDemand = demand_score < demand_drop_pts || listings_count < 5

  // WATCH: demand is too low to sell effectively regardless of price
  // Check this first — no point recommending SELL if buyers aren't there
  if (lowDemand) {
    return {
      recommendation: 'WATCH',
      reason: `Demand is low (score ${demand_score}/100, ${listings_count} active listings). Price may be up but few buyers — wait for demand to recover before selling.`,
    }
  }

  // SELL: price is above threshold AND demand is healthy enough to find a buyer
  if (purchase_price_usd && purchase_price_usd > 0) {
    const gainPct = ((avg_price_usd - purchase_price_usd) / purchase_price_usd) * 100
    if (gainPct >= sell_threshold_pct) {
      const gainStr = gainPct.toFixed(0)
      const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      const paidStr = purchase_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      return {
        recommendation: 'SELL',
        reason: `Avg resale ${avgStr} — ${gainStr}% above your purchase price of ${paidStr}. Demand is healthy.`,
      }
    }
  }

  // HOLD: retired set with healthy demand — price likely still climbing
  if (retired) {
    const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    return {
      recommendation: 'HOLD',
      reason: `Retired set at ${avgStr} avg resale with healthy demand. Prices typically rise over time.`,
    }
  }

  // Default: hold, no strong signal either way
  return {
    recommendation: 'HOLD',
    reason: `Resale market looks stable at $${avg_price_usd.toFixed(2)} avg. No strong sell signal yet.`,
  }
}
