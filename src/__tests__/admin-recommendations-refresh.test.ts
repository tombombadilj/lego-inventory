/**
 * @jest-environment node
 */
jest.mock('../lib/roles', () => ({ isAdmin: jest.fn().mockResolvedValue(true) }))
jest.mock('../lib/gemini', () => ({ generateAiRecommendation: jest.fn() }))

import { isAdmin } from '../lib/roles'
import { generateAiRecommendation } from '../lib/gemini'

const mockIsAdmin = isAdmin as jest.Mock
const mockGenerateAiRecommendation = generateAiRecommendation as jest.Mock

// Service role client mock
const mockUpdate = jest.fn()
const mockUpdateEq = jest.fn().mockResolvedValue({ error: null })
mockUpdate.mockReturnValue({ eq: mockUpdateEq })

let mockSetsData: object[] = []
let mockItemsData: object[] = []

const mockServiceFrom = jest.fn((table: string) => {
  if (table === 'sets') {
    return {
      select: jest.fn().mockReturnValue({
        is: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockSetsData, error: null }),
        }),
      }),
      update: mockUpdate,
    }
  }
  if (table === 'inventory_items') {
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue({ data: mockItemsData, error: null }),
          }),
        }),
      }),
    }
  }
  if (table === 'price_snapshots') {
    return {
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }
  }
  return {}
})

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockServiceFrom })),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockIsAdmin.mockResolvedValue(true)
  mockUpdateEq.mockResolvedValue({ error: null })
  mockUpdate.mockReturnValue({ eq: mockUpdateEq })
  mockSetsData = []
  mockItemsData = []
})

async function callRefresh() {
  jest.resetModules()
  jest.mock('../lib/roles', () => ({ isAdmin: mockIsAdmin }))
  jest.mock('../lib/gemini', () => ({ generateAiRecommendation: mockGenerateAiRecommendation }))
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ from: mockServiceFrom })),
  }))
  const { POST } = await import('../app/api/admin/recommendations/refresh/route')
  return POST()
}

test('returns 403 when not admin', async () => {
  jest.resetModules()
  jest.mock('../lib/roles', () => ({ isAdmin: jest.fn().mockResolvedValue(false) }))
  jest.mock('../lib/gemini', () => ({ generateAiRecommendation: mockGenerateAiRecommendation }))
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ from: mockServiceFrom })),
  }))
  const { POST } = await import('../app/api/admin/recommendations/refresh/route')
  const res = await POST()
  expect(res.status).toBe(403)
})

test('returns { total: 0 } when no sets need backfill', async () => {
  mockSetsData = []
  const res = await callRefresh()
  const json = await res.json()
  expect(json).toEqual({ total: 0, refreshed: 0, failed: [] })
  expect(mockGenerateAiRecommendation).not.toHaveBeenCalled()
})

test('generates analysis for each set and updates DB', async () => {
  mockSetsData = [
    { id: 'uuid-1', set_number: '10270', name: 'Bookshop', theme: 'Icons',
      retirement_date: '2023-12-31', override_retirement_date: null,
      override_retired: false, retiring_soon_override: null },
  ]
  mockItemsData = [{ purchase_price_usd: 150, condition: 'sealed' }]
  mockGenerateAiRecommendation.mockResolvedValueOnce({ verdict: 'SELL', analysis: 'Great ROI.' })

  const res = await callRefresh()
  const json = await res.json()

  expect(mockGenerateAiRecommendation).toHaveBeenCalledTimes(1)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ ai_recommendation: 'SELL' }))
  expect(json.refreshed).toBe(1)
  expect(json.failed).toEqual([])
})

test('adds set_number to failed[] when generateAiRecommendation throws', async () => {
  mockSetsData = [
    { id: 'uuid-1', set_number: '10270', name: 'Bookshop', theme: 'Icons',
      retirement_date: null, override_retirement_date: null,
      override_retired: false, retiring_soon_override: null },
  ]
  mockItemsData = []
  mockGenerateAiRecommendation.mockRejectedValueOnce(new Error('Gemini error'))

  const res = await callRefresh()
  const json = await res.json()

  expect(json.failed).toContain('10270')
  expect(json.refreshed).toBe(0)
})

test('returns correct summary shape', async () => {
  mockSetsData = [
    { id: 'uuid-1', set_number: '10270', name: 'Bookshop', theme: 'Icons',
      retirement_date: null, override_retirement_date: null,
      override_retired: false, retiring_soon_override: null },
  ]
  mockItemsData = [{ purchase_price_usd: 150, condition: 'sealed' }]
  mockGenerateAiRecommendation.mockResolvedValueOnce({ verdict: 'HOLD', analysis: 'Hold it.' })

  const res = await callRefresh()
  const json = await res.json()

  expect(json).toHaveProperty('total', 1)
  expect(json).toHaveProperty('refreshed', 1)
  expect(Array.isArray(json.failed)).toBe(true)
})
