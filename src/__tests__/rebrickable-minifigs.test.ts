import { fetchMinifigs } from '../lib/rebrickable'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  process.env.REBRICKABLE_API_KEY = 'test-key'
})

function makeResponse(results: object[], count = results.length): Response {
  return {
    ok: true,
    json: async () => ({ count, results }),
  } as unknown as Response
}

test('returns minifig_count and minifig_names from results', async () => {
  mockFetch.mockResolvedValueOnce(makeResponse([
    { set_name: 'Bookshop Owner', quantity: 1 },
    { set_name: 'Customer', quantity: 2 },
  ]))
  const result = await fetchMinifigs('10270')
  expect(result).toEqual({
    minifig_count: 3,
    minifig_names: 'Bookshop Owner, Customer',
  })
  expect(mockFetch.mock.calls[0][0]).toContain('10270-1')
})

test('falls back to bare set number when -1 suffix returns empty', async () => {
  mockFetch
    .mockResolvedValueOnce(makeResponse([]))
    .mockResolvedValueOnce(makeResponse([{ set_name: 'Jazz Musician', quantity: 1 }]))
  const result = await fetchMinifigs('10312')
  expect(result).toEqual({ minifig_count: 1, minifig_names: 'Jazz Musician' })
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

test('returns null when no results on any suffix', async () => {
  mockFetch
    .mockResolvedValueOnce(makeResponse([]))
    .mockResolvedValueOnce(makeResponse([]))
  const result = await fetchMinifigs('99999')
  expect(result).toBeNull()
})

test('returns null when fetch throws', async () => {
  mockFetch.mockRejectedValue(new Error('Network error'))
  const result = await fetchMinifigs('10270')
  expect(result).toBeNull()
})

test('returns null when response is not ok', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false } as unknown as Response)
  const result = await fetchMinifigs('10270')
  expect(result).toBeNull()
})
