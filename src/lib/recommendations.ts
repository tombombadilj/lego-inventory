export type Recommendation = 'SELL' | 'HOLD' | 'STRATEGIC HOLD' | 'VELOCITY SELL' | 'LIQUIDATE' | 'NO_DATA'

export type RetirementStatus = 'Retired' | 'Retiring Soon' | 'Active'

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
  sell_threshold_pct: number
  demand_drop_pts: number
  retirement_status: RetirementStatus
  retirement_date: string | null
  override_retirement_date: string | null
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
  const { purchase_price_usd, sell_threshold_pct, demand_drop_pts, retirement_status, retirement_date, override_retirement_date } = ctx

  const highDemand = demand_score >= demand_drop_pts && listings_count >= 5
  const effectiveRetirementDate = override_retirement_date ?? retirement_date

  if (retirement_status === 'Retiring Soon') {
    return {
      recommendation: 'STRATEGIC HOLD',
      reason: 'Set is retiring soon — prices typically spike after retirement. Hold for better returns.',
    }
  }

  if (retirement_status === 'Retired') {
    const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

    if (highDemand) {
      return {
        recommendation: 'VELOCITY SELL',
        reason: `Retired set at ${avgStr} avg with high demand (score ${demand_score}/100). Market is hot — move now for maximum return.`,
      }
    }

    // Low demand: check age to decide STRATEGIC HOLD vs LIQUIDATE
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10)
    const isRecentlyRetired = effectiveRetirementDate !== null && effectiveRetirementDate >= sixMonthsAgoStr

    if (isRecentlyRetired) {
      return {
        recommendation: 'STRATEGIC HOLD',
        reason: "Set retired recently — demand hasn't peaked yet. Hold and monitor for price appreciation.",
      }
    }

    return {
      recommendation: 'LIQUIDATE',
      reason: `Retired 6+ months with low demand (score ${demand_score}/100). Price may be softening — consider recovering capital now.`,
    }
  }

  // Active set
  if (highDemand && purchase_price_usd && purchase_price_usd > 0) {
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

  const avgStr = avg_price_usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return {
    recommendation: 'HOLD',
    reason: `Resale market at ${avgStr} avg. No strong sell signal yet.`,
  }
}

/**
 * Pure function — determines retirement status based on override flags and retirement date.
 * Priority: manual Retired > auto-Retired (past date) > manual Retiring Soon > auto-Retiring Soon (within 6 months) > Active.
 */
export function getRetirementStatus(set: {
  retirement_date: string | null
  override_retired: boolean | null
  retiring_soon_override: boolean | null
}): RetirementStatus {
  // Manual Retired override wins first
  if (set.override_retired) return 'Retired'

  // Auto-Retired: past retirement_date (beats retiring_soon_override per spec priority table)
  const todayStr = new Date().toISOString().slice(0, 10)
  if (set.retirement_date && set.retirement_date <= todayStr) return 'Retired'

  // Manual Retiring Soon override (only applies when not already auto-Retired)
  if (set.retiring_soon_override) return 'Retiring Soon'

  // Auto Retiring Soon: future date within 6 months
  if (set.retirement_date) {
    const sixMonthsFromNow = new Date()
    sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6)
    const sixMonthsStr = sixMonthsFromNow.toISOString().slice(0, 10)
    if (set.retirement_date <= sixMonthsStr) return 'Retiring Soon'
  }

  return 'Active'
}
