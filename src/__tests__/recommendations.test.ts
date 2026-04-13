import { getRecommendation, getRetirementStatus } from '../lib/recommendations'

function makeSnapshot(overrides: Partial<{
  avg_price_usd: number | null
  min_price_usd: number | null
  max_price_usd: number | null
  demand_score: number
  listings_count: number
}> = {}) {
  return {
    avg_price_usd: 200,
    min_price_usd: 180,
    max_price_usd: 220,
    demand_score: 50,
    listings_count: 20,
    ...overrides,
  }
}

function makeCtx(overrides: Partial<{
  purchase_price_usd: number | null
  sell_threshold_pct: number
  demand_drop_pts: number
  retirement_status: 'Retired' | 'Retiring Soon' | 'Active'
  retirement_date: string | null
  override_retirement_date: string | null
}> = {}) {
  return {
    purchase_price_usd: 100,
    sell_threshold_pct: 10,
    demand_drop_pts: 20,
    retirement_status: 'Active' as const,
    retirement_date: null,
    override_retirement_date: null,
    ...overrides,
  }
}

describe('getRecommendation', () => {
  test('returns NO_DATA when snapshot is null', () => {
    expect(getRecommendation(null, makeCtx()).recommendation).toBe('NO_DATA')
  })

  test('returns NO_DATA when avg_price_usd is null', () => {
    expect(getRecommendation(makeSnapshot({ avg_price_usd: null }), makeCtx()).recommendation).toBe('NO_DATA')
  })

  test('returns HOLD SHORT for Retiring Soon', () => {
    expect(getRecommendation(makeSnapshot(), makeCtx({ retirement_status: 'Retiring Soon' })).recommendation).toBe('HOLD SHORT')
  })

  test('returns SELL for Retired with high demand (6+ months ago)', () => {
    const date = new Date()
    date.setDate(date.getDate() - 200)
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('SELL')
  })

  test('returns SELL for recently Retired with high demand', () => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('SELL')
  })

  test('returns HOLD SHORT for recently Retired with low demand', () => {
    const date = new Date()
    date.setDate(date.getDate() - 30)
    expect(getRecommendation(
      makeSnapshot({ demand_score: 10, listings_count: 3 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('HOLD SHORT')
  })

  test('returns HOLD for Retired 6+ months with low demand', () => {
    const date = new Date()
    date.setDate(date.getDate() - 200)
    expect(getRecommendation(
      makeSnapshot({ demand_score: 10, listings_count: 3 }),
      makeCtx({ retirement_status: 'Retired', retirement_date: date.toISOString().slice(0, 10) })
    ).recommendation).toBe('HOLD')
  })

  test('uses override_retirement_date when present for age calculation', () => {
    const overrideDate = new Date()
    overrideDate.setDate(overrideDate.getDate() - 200)
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 30)
    expect(getRecommendation(
      makeSnapshot({ demand_score: 10, listings_count: 3 }),
      makeCtx({
        retirement_status: 'Retired',
        retirement_date: recentDate.toISOString().slice(0, 10),
        override_retirement_date: overrideDate.toISOString().slice(0, 10),
      })
    ).recommendation).toBe('HOLD') // override makes it old → HOLD
  })

  test('returns SELL for Active + high demand + above threshold', () => {
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10, avg_price_usd: 200 }),
      makeCtx({ purchase_price_usd: 100, sell_threshold_pct: 10, demand_drop_pts: 20 })
    ).recommendation).toBe('SELL')
  })

  test('returns HOLD for Active + high demand but below threshold', () => {
    expect(getRecommendation(
      makeSnapshot({ demand_score: 60, listings_count: 10, avg_price_usd: 105 }),
      makeCtx({ purchase_price_usd: 100, sell_threshold_pct: 20, demand_drop_pts: 20 })
    ).recommendation).toBe('HOLD')
  })

  test('returns HOLD for Active + low demand regardless of price', () => {
    expect(getRecommendation(
      makeSnapshot({ demand_score: 5, listings_count: 2, avg_price_usd: 500 }),
      makeCtx({ purchase_price_usd: 100, sell_threshold_pct: 10 })
    ).recommendation).toBe('HOLD')
  })
})

function makeSet(overrides: {
  retirement_date?: string | null
  override_retired?: boolean | null
  retiring_soon_override?: boolean | null
}) {
  return {
    retirement_date: null,
    override_retired: null,
    retiring_soon_override: null,
    ...overrides,
  }
}

describe('getRetirementStatus', () => {
  test('returns Retired when override_retired is true', () => {
    expect(getRetirementStatus(makeSet({ override_retired: true }))).toBe('Retired')
  })

  test('returns Retired when retirement_date is in the past', () => {
    expect(getRetirementStatus(makeSet({ retirement_date: '2020-01-01' }))).toBe('Retired')
  })

  test('auto-Retired (past retirement_date) wins over retiring_soon_override', () => {
    expect(getRetirementStatus(makeSet({ retirement_date: '2020-01-01', retiring_soon_override: true }))).toBe('Retired')
  })

  test('returns Retiring Soon when retiring_soon_override is true and no retirement_date', () => {
    expect(getRetirementStatus(makeSet({ retiring_soon_override: true }))).toBe('Retiring Soon')
  })

  test('returns Retiring Soon when retirement_date is within 6 months', () => {
    const soon = new Date()
    soon.setMonth(soon.getMonth() + 3)
    expect(getRetirementStatus(makeSet({ retirement_date: soon.toISOString().slice(0, 10) }))).toBe('Retiring Soon')
  })

  test('returns Active when retirement_date is beyond 6 months', () => {
    const far = new Date()
    far.setFullYear(far.getFullYear() + 2)
    expect(getRetirementStatus(makeSet({ retirement_date: far.toISOString().slice(0, 10) }))).toBe('Active')
  })

  test('returns Active when all fields are null', () => {
    expect(getRetirementStatus(makeSet({}))).toBe('Active')
  })

  test('override_retired wins over retiring_soon_override', () => {
    expect(getRetirementStatus(makeSet({ override_retired: true, retiring_soon_override: true }))).toBe('Retired')
  })
})
