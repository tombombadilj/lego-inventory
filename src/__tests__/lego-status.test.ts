/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { fetchRetirementDate } from '../lib/brickset'
import { fetchMinifigs } from '../lib/rebrickable'

jest.mock('../lib/brickset', () => ({ fetchRetirementDate: jest.fn() }))
const mockFetchRetirementDate = fetchRetirementDate as jest.Mock
const mockFetchMinifigs = fetchMinifigs as jest.Mock

// Mock supabase service client update chain
const mockUpdate = jest.fn()
const mockEq = jest.fn()
mockUpdate.mockReturnValue({ eq: mockEq })
mockEq.mockResolvedValue({ error: null })

// Mock supabase service client upsert chain
const mockSingle = jest.fn()
const mockSelect = jest.fn()
const mockUpsert = jest.fn()
mockSingle.mockResolvedValue({ data: { set_number: '75192', name: 'Test Set' }, error: null })
mockSelect.mockReturnValue({ single: mockSingle })
mockUpsert.mockReturnValue({ select: mockSelect })

const mockServiceFrom = jest.fn((table: string) => {
  if (table === 'sets') {
    return { upsert: mockUpsert, update: mockUpdate }
  }
  return {}
})

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockServiceFrom,
  })),
}))

// Mock supabase server client (for auth + cache check)
const mockCacheSingle = jest.fn()
const mockCacheSelect = jest.fn()
const mockCacheEq = jest.fn()
mockCacheEq.mockReturnValue({ single: mockCacheSingle })
mockCacheSelect.mockReturnValue({ eq: mockCacheEq })

const mockAuthGetUser = jest.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})

const mockClientFrom = jest.fn(() => ({
  select: mockCacheSelect,
}))

jest.mock('../lib/supabase/server', () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: { getUser: mockAuthGetUser },
      from: mockClientFrom,
    })
  ),
}))

jest.mock('../lib/rebrickable', () => ({
  fetchSetFromRebrickable: jest.fn().mockResolvedValue({
    set_number: '75192',
    name: 'Test Set',
    year: 2022,
    theme: 'Icons',
    piece_count: 1234,
    image_url: 'https://example.com/image.jpg',
  }),
  fetchMinifigs: jest.fn(),
}))

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({ getAll: () => [], set: () => {} }),
}))

function makeRequest(setNumber: string) {
  return new NextRequest(`http://localhost/api/lego-status?set_number=${setNumber}`)
}

// Cache is stale so the route always fetches fresh
beforeEach(() => {
  jest.clearAllMocks()
  // Return stale cached data (fetched long ago) so route proceeds past cache check
  mockCacheSingle.mockResolvedValue({
    data: { set_number: '75192', last_fetched_at: new Date(0).toISOString() },
    error: null,
  })
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mockSingle.mockResolvedValue({ data: { set_number: '75192', name: 'Test Set' }, error: null })
  mockUpdate.mockReturnValue({ eq: mockEq })
  mockEq.mockResolvedValue({ error: null })
  mockFetchMinifigs.mockResolvedValue(null)
})

test('fetchRetirementDate is called and retirement_date is updated when result is non-null', async () => {
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2025-06-30'))

  const { GET } = await import('../app/api/lego-status/route')
  const response = await GET(makeRequest('75192'))

  expect(response.status).toBe(200)
  expect(mockFetchRetirementDate).toHaveBeenCalled()
  expect(mockUpdate).toHaveBeenCalledWith({ retirement_date: '2025-06-30' })
})

test('fetchRetirementDate is called but DB update is NOT made when it returns null', async () => {
  mockFetchRetirementDate.mockResolvedValueOnce(null)

  const { GET } = await import('../app/api/lego-status/route')
  const response = await GET(makeRequest('75192'))

  expect(response.status).toBe(200)
  expect(mockFetchRetirementDate).toHaveBeenCalled()
  // update should not have been called with retirement_date
  const retirementUpdateCalls = mockUpdate.mock.calls.filter(
    (args) => args[0] && args[0].retirement_date !== undefined
  )
  expect(retirementUpdateCalls).toHaveLength(0)
})

test('calls fetchMinifigs and updates minifig fields when result is non-null', async () => {
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2025-06-30'))
  mockFetchMinifigs.mockResolvedValueOnce({ minifig_count: 3, minifig_names: 'Owner, Customer, Courier' })

  const { GET } = await import('../app/api/lego-status/route')
  const response = await GET(makeRequest('75192'))

  expect(response.status).toBe(200)
  expect(mockFetchMinifigs).toHaveBeenCalled()
  const minifigUpdateCalls = mockUpdate.mock.calls.filter(
    (args) => args[0] && args[0].minifig_count !== undefined
  )
  expect(minifigUpdateCalls).toHaveLength(1)
  expect(minifigUpdateCalls[0][0]).toMatchObject({ minifig_count: 3, minifig_names: 'Owner, Customer, Courier' })
})

test('does not update minifig fields when fetchMinifigs returns null', async () => {
  mockFetchRetirementDate.mockResolvedValueOnce(new Date('2025-06-30'))
  // mockFetchMinifigs already returns null by default (from beforeEach)

  const { GET } = await import('../app/api/lego-status/route')
  const response = await GET(makeRequest('75192'))

  expect(response.status).toBe(200)
  expect(mockFetchMinifigs).toHaveBeenCalled()
  const minifigUpdateCalls = mockUpdate.mock.calls.filter(
    (args) => args[0] && args[0].minifig_count !== undefined
  )
  expect(minifigUpdateCalls).toHaveLength(0)
})
