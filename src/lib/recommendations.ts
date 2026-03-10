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

  // SELL: avg resale is above purchase price by at least the user's threshold
  if (purchase_price_usd && purchase_price_usd > 0) {
    const gainPct = ((avg_price_usd - purchase_price_usd) / purchase_price_usd) * 100
    if (gainPct >= sell_threshold_pct) {
      const gainStr = gainPct.toFixed(0)
      const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      const paidStr = purchase_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      return {
        recommendation: 'SELL',
        reason: `Avg resale ${avgStr} — ${gainStr}% above your purchase price of ${paidStr}.`,
      }
    }
  }

  // HOLD: retired set — price likely still climbing
  if (retired) {
    const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    return {
      recommendation: 'HOLD',
      reason: `Retired set currently at ${avgStr} avg resale. Prices typically rise over time.`,
    }
  }

  // WATCH: demand falling (low demand score or few active listings)
  if (demand_score < demand_drop_pts || listings_count < 5) {
    return {
      recommendation: 'WATCH',
      reason: `Demand is low (score ${demand_score}/100, ${listings_count} active listings). Monitor before deciding.`,
    }
  }

  // Default: hold with no specific signal
  return {
    recommendation: 'HOLD',
    reason: `Resale market looks stable at $${avg_price_usd.toFixed(2)} avg. No strong sell signal yet.`,
  }
}
