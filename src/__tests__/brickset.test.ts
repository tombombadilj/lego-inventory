import { fetchRetirementDate } from '../lib/brickset'

const mockFetch = jest.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockReset()
  process.env.BRICKSET_API_KEY = 'test-key'
})

function makeResponse(sets: object[]): Response {
  return {
    ok: true,
    json: async () => ({ status: 'success', sets }),
  } as unknown as Response
}

test('returns parsed Date when exitDate present on first suffix', async () => {
  mockFetch.mockResolvedValueOnce(makeResponse([{ exitDate: '2023-12-31T00:00:00Z' }]))
  const result = await fetchRetirementDate('10270')
  expect(result).toEqual(new Date('2023-12-31T00:00:00Z'))
  expect(mockFetch).toHaveBeenCalledTimes(1)
  expect(mockFetch.mock.calls[0][0]).toContain('10270-1')
})

test('falls back to bare set number when first suffix returns empty sets', async () => {
  mockFetch
    .mockResolvedValueOnce(makeResponse([]))
    .mockResolvedValueOnce(makeResponse([{ exitDate: '2024-06-01T00:00:00Z' }]))
  const result = await fetchRetirementDate('75192')
  expect(result).toEqual(new Date('2024-06-01T00:00:00Z'))
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

test('returns null when exitDate is absent', async () => {
  mockFetch.mockResolvedValueOnce(makeResponse([{ number: '10270-1' }]))
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})

test('returns null when API status is not success', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: 'error', message: 'Invalid key' }),
  } as unknown as Response)
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})

test('returns null and does not throw when fetch throws (timeout/network)', async () => {
  mockFetch.mockRejectedValue(new Error('AbortError'))
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})

test('returns null when exitDate is an invalid date string', async () => {
  mockFetch.mockResolvedValueOnce(makeResponse([{ exitDate: 'N/A' }]))
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})

test('returns null when both suffixes fail (network error)', async () => {
  mockFetch.mockRejectedValue(new Error('Network error'))
  const result = await fetchRetirementDate('99999')
  expect(result).toBeNull()
  expect(mockFetch).toHaveBeenCalledTimes(2)
})

test('returns null when res.ok is false', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false } as unknown as Response)
  const result = await fetchRetirementDate('10270')
  expect(result).toBeNull()
})
