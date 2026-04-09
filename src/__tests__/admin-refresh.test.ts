/**
 * @jest-environment node
 */
import { fetchRetirementDate } from '../lib/brickset'

jest.mock('../lib/brickset', () => ({ fetchRetirementDate: jest.fn() }))
const mockFetchRetirementDate = fetchRetirementDate as jest.Mock

// Mock isAdmin to always allow
jest.mock('../lib/roles', () => ({ isAdmin: jest.fn().mockResolvedValue(true) }))

// Supabase service client mocks
const mockUpdate = jest.fn()
const mockEq = jest.fn()
mockEq.mockResolvedValue({ error: null })
mockUpdate.mockReturnValue({ eq: mockEq })

let mockSetsData: Array<{ set_number: string; retired: boolean; override_retired: boolean }> = []

const mockSelectOrder = jest.fn()
const mockSelectFn = jest.fn()
mockSelectFn.mockReturnValue({ order: mockSelectOrder })
mockSelectOrder.mockImplementation(() => Promise.resolve({ data: mockSetsData, error: null }))

const mockServiceFrom = jest.fn((table: string) => {
  if (table === 'sets') {
    return { select: mockSelectFn, update: mockUpdate }
  }
  return {}
})

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockServiceFrom,
  })),
}))

beforeEach(() => {
  jest.clearAllMocks()

  // Re-wire mocks after clearAllMocks
  mockEq.mockResolvedValue({ error: null })
  mockUpdate.mockReturnValue({ eq: mockEq })
  mockSelectFn.mockReturnValue({ order: mockSelectOrder })
  mockSelectOrder.mockImplementation(() => Promise.resolve({ data: mockSetsData, error: null }))
  mockServiceFrom.mockImplementation((table: string) => {
    if (table === 'sets') {
      return { select: mockSelectFn, update: mockUpdate }
    }
    return {}
  })
})

async function callRefresh() {
  // Re-import fresh each time to pick up mock state
  jest.resetModules()

  // Re-apply mocks after resetModules
  jest.mock('../lib/brickset', () => ({ fetchRetirementDate: mockFetchRetirementDate }))
  jest.mock('../lib/roles', () => ({ isAdmin: jest.fn().mockResolvedValue(true) }))
  jest.mock('@supabase/supabase-js', () => ({
    createClient: jest.fn(() => ({ from: mockServiceFrom })),
  }))

  const { POST } = await import('../app/api/admin/sets/refresh/route')
  return POST()
}

test('sets with retired=true are skipped and fetchRetirementDate is not called', async () => {
  mockSetsData = [
    { set_number: '75192', retired: true, override_retired: false },
  ]

  const response = await callRefresh()
  const json = await response.json()

  expect(mockFetchRetirementDate).not.toHaveBeenCalled()
  expect(json.skipped_retired).toBe(1)
  expect(json.refreshed).toBe(0)
  expect(json.total).toBe(1)
})

test('sets with override_retired=true are skipped and fetchRetirementDate is not called', async () => {
  mockSetsData = [
    { set_number: '42115', retired: false, override_retired: true },
  ]

  const response = await callRefresh()
  const json = await response.json()

  expect(mockFetchRetirementDate).not.toHaveBeenCalled()
  expect(json.skipped_retired).toBe(1)
  expect(json.refreshed).toBe(0)
  expect(json.total).toBe(1)
})

test('non-retired sets: fetchRetirementDate is called and DB is updated', async () => {
  mockSetsData = [
    { set_number: '10300', retired: false, override_retired: false },
  ]
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2024-01-01')) // already retired

  const response = await callRefresh()
  const json = await response.json()

  expect(mockFetchRetirementDate).toHaveBeenCalledWith('10300')
  expect(mockUpdate).toHaveBeenCalledWith({ retirement_date: '2024-01-01', retired: true })
  expect(json.refreshed).toBe(1)
  expect(json.skipped_retired).toBe(0)
  expect(json.failed).toEqual([])
})

test('response includes { total, skipped_retired, refreshed, failed }', async () => {
  mockSetsData = [
    { set_number: '75192', retired: true, override_retired: false },
    { set_number: '42115', retired: false, override_retired: true },
    { set_number: '10300', retired: false, override_retired: false },
  ]
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2026-06-30')) // future: not yet retired

  const response = await callRefresh()
  const json = await response.json()

  expect(json).toHaveProperty('total', 3)
  expect(json).toHaveProperty('skipped_retired', 2)
  expect(json).toHaveProperty('refreshed', 1)
  expect(json).toHaveProperty('failed')
  expect(Array.isArray(json.failed)).toBe(true)
})
