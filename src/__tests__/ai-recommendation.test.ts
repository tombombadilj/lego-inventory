/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('../lib/gemini', () => ({ generateAiRecommendation: jest.fn() }))
jest.mock('../lib/supabase/server', () => ({ createClient: jest.fn() }))

import { generateAiRecommendation } from '../lib/gemini'
import { createClient } from '../lib/supabase/server'

const mockGenerateAiRecommendation = generateAiRecommendation as jest.Mock
const mockCreateClient = createClient as jest.Mock

// Service role client mock
const mockServiceFrom = jest.fn()
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockServiceFrom })),
}))

function makeAuthClient(userId: string | null, items: object[]) {
  const mockFrom = jest.fn((table: string) => {
    if (table === 'inventory_items') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: items, error: null }),
            }),
          }),
        }),
      }
    }
    return {}
  })
  mockCreateClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
    from: mockFrom,
  })
}

function makeServiceClient(set: object | null, snapshot: object | null = null) {
  mockServiceFrom.mockImplementation((table: string) => {
    if (table === 'sets') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: set, error: set ? null : { message: 'Not found' } }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      }
    }
    if (table === 'price_snapshots') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: snapshot, error: null }),
              }),
            }),
          }),
        }),
      }
    }
    return {}
  })
}

async function callPost(setNumber: string) {
  jest.resetModules()
  jest.mock('../lib/gemini', () => ({ generateAiRecommendation: mockGenerateAiRecommendation }))
  jest.mock('../lib/supabase/server', () => ({ createClient: mockCreateClient }))
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ from: mockServiceFrom })),
  }))
  const { POST } = await import('../app/api/sets/[id]/ai-recommendation/route')
  const req = new NextRequest(`http://localhost/api/sets/${setNumber}/ai-recommendation`, { method: 'POST' })
  return POST(req, { params: Promise.resolve({ id: setNumber }) })
}

const mockSet = {
  id: 'set-uuid-1',
  name: 'Bookshop',
  theme: 'Icons',
  retirement_date: '2023-12-31',
  override_retirement_date: null,
  override_retired: false,
  retiring_soon_override: null,
}

test('returns 401 when not authenticated', async () => {
  makeAuthClient(null, [])
  makeServiceClient(null)
  const res = await callPost('10270')
  expect(res.status).toBe(401)
})

test('returns 404 when user has no items for this set', async () => {
  makeAuthClient('user-1', []) // empty items
  makeServiceClient(mockSet)
  const res = await callPost('10270')
  expect(res.status).toBe(404)
})

test('returns 200 with ai fields on success', async () => {
  makeAuthClient('user-1', [
    { purchase_price_usd: 150, condition: 'sealed', set_id: 'set-uuid-1' },
  ])
  makeServiceClient(mockSet)
  mockGenerateAiRecommendation.mockResolvedValueOnce({
    verdict: 'SELL',
    analysis: '## VERDICT: SELL\n\nGreat ROI.',
  })

  const res = await callPost('10270')
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.ai_recommendation).toBe('SELL')
  expect(body.ai_analysis).toContain('SELL')
  expect(body.ai_analyzed_at).toBeTruthy()
})

test('returns 502 when generateAiRecommendation throws', async () => {
  makeAuthClient('user-1', [
    { purchase_price_usd: 150, condition: 'sealed', set_id: 'set-uuid-1' },
  ])
  makeServiceClient(mockSet)
  mockGenerateAiRecommendation.mockRejectedValueOnce(new Error('Gemini error'))

  const res = await callPost('10270')
  expect(res.status).toBe(502)
})
