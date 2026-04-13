/**
 * @jest-environment node
 */
import { fetchRetirementDate } from '../lib/brickset'

jest.mock('../lib/brickset', () => ({ fetchRetirementDate: jest.fn() }))
const mockFetchRetirementDate = fetchRetirementDate as jest.Mock

// --- Auth client mock (createClient from @/lib/supabase/server) ---
const mockAuthFrom = jest.fn()
jest.mock('../lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: mockAuthFrom,
  }),
}))

// --- Service role client mock (createClient from @supabase/supabase-js) ---
const mockServiceUpdate = jest.fn()
const mockServiceEq = jest.fn()
mockServiceEq.mockResolvedValue({ error: null })
mockServiceUpdate.mockReturnValue({ eq: mockServiceEq })

let mockSetsData: Array<{ set_number: string; retired: boolean; override_retired: boolean }> = []

const mockServiceSelectOrder = jest.fn()
const mockServiceSelectIn = jest.fn()
const mockServiceSelectFn = jest.fn().mockReturnValue({ in: mockServiceSelectIn })
mockServiceSelectIn.mockReturnValue({ order: mockServiceSelectOrder })
mockServiceSelectOrder.mockImplementation(() => Promise.resolve({ data: mockSetsData, error: null }))

const mockServiceFrom = jest.fn((table: string) => {
  if (table === 'sets') {
    return { select: mockServiceSelectFn, update: mockServiceUpdate }
  }
  return {}
})

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: mockServiceFrom })),
}))

beforeEach(() => {
  jest.clearAllMocks()

  mockFetchRetirementDate.mockReset()

  // Re-wire service mocks after clearAllMocks
  mockServiceEq.mockResolvedValue({ error: null })
  mockServiceUpdate.mockReturnValue({ eq: mockServiceEq })
  mockServiceSelectFn.mockReturnValue({ in: mockServiceSelectIn })
  mockServiceSelectIn.mockReturnValue({ order: mockServiceSelectOrder })
  mockServiceSelectOrder.mockImplementation(() => Promise.resolve({ data: mockSetsData, error: null }))
  mockServiceFrom.mockImplementation((table: string) => {
    if (table === 'sets') {
      return { select: mockServiceSelectFn, update: mockServiceUpdate }
    }
    return {}
  })

  // Auth client: default returns set_number '10300' for user-1
  mockAuthFrom.mockImplementation((table: string) => {
    if (table === 'inventory_items') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: [{ sets: [{ set_number: '10300' }] }],
            error: null,
          }),
        }),
      }
    }
    return {}
  })
})

async function callRefresh() {
  jest.resetModules()

  jest.mock('../lib/brickset', () => ({ fetchRetirementDate: mockFetchRetirementDate }))
  jest.mock('../lib/supabase/server', () => ({
    createClient: jest.fn().mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      from: mockAuthFrom,
    }),
  }))
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ from: mockServiceFrom })),
  }))

  const { POST } = await import('../app/api/sets/refresh/route')
  return POST()
}

test('returns 401 when not authenticated', async () => {
  jest.resetModules()
  jest.mock('../lib/brickset', () => ({ fetchRetirementDate: mockFetchRetirementDate }))
  jest.mock('../lib/supabase/server', () => ({
    createClient: jest.fn().mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
      from: mockAuthFrom,
    }),
  }))
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ from: mockServiceFrom })),
  }))
  const { POST } = await import('../app/api/sets/refresh/route')
  const res = await POST()
  expect(res.status).toBe(401)
})

test('returns { total: 0 } when user has no inventory items', async () => {
  mockAuthFrom.mockImplementation((table: string) => {
    if (table === 'inventory_items') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }
    return {}
  })
  mockSetsData = []

  const response = await callRefresh()
  const json = await response.json()
  expect(json).toEqual({ total: 0, skipped_retired: 0, refreshed: 0, failed: [] })
  expect(mockFetchRetirementDate).not.toHaveBeenCalled()
})

test('skips sets with retired=true', async () => {
  mockSetsData = [{ set_number: '75192', retired: true, override_retired: false }]

  const response = await callRefresh()
  const json = await response.json()

  expect(mockFetchRetirementDate).not.toHaveBeenCalled()
  expect(json.skipped_retired).toBe(1)
  expect(json.refreshed).toBe(0)
})

test('skips sets with override_retired=true', async () => {
  mockSetsData = [{ set_number: '42115', retired: false, override_retired: true }]

  const response = await callRefresh()
  const json = await response.json()

  expect(mockFetchRetirementDate).not.toHaveBeenCalled()
  expect(json.skipped_retired).toBe(1)
})

test('calls fetchRetirementDate and updates sets table for non-retired set', async () => {
  mockSetsData = [{ set_number: '10300', retired: false, override_retired: false }]
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2024-01-01'))

  const response = await callRefresh()
  const json = await response.json()

  expect(mockFetchRetirementDate).toHaveBeenCalledWith('10300')
  expect(mockServiceUpdate).toHaveBeenCalledWith({ retirement_date: '2024-01-01', retired: true })
  expect(json.refreshed).toBe(1)
  expect(json.failed).toEqual([])
})

test('adds set to failed[] when fetchRetirementDate throws', async () => {
  mockSetsData = [{ set_number: '10300', retired: false, override_retired: false }]
  mockFetchRetirementDate.mockRejectedValueOnce(new Error('BRICKSET_API_KEY not set'))

  const response = await callRefresh()
  const json = await response.json()

  expect(json.failed).toContain('10300')
  expect(json.refreshed).toBe(0)
})

test('returns correct summary shape', async () => {
  mockSetsData = [
    { set_number: '75192', retired: true, override_retired: false },
    { set_number: '10300', retired: false, override_retired: false },
  ]
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2026-06-30'))

  const response = await callRefresh()
  const json = await response.json()

  expect(json).toHaveProperty('total', 2)
  expect(json).toHaveProperty('skipped_retired', 1)
  expect(json).toHaveProperty('refreshed', 1)
  expect(Array.isArray(json.failed)).toBe(true)
})
