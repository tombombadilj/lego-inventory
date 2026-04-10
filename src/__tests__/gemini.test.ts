// Mock @google/generative-ai before importing gemini.ts
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}))

import { GoogleGenerativeAI } from '@google/generative-ai'
import { generateListing } from '../lib/gemini'

const MockGoogleGenerativeAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GEMINI_API_KEY = 'test-key'
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  }) as unknown as GoogleGenerativeAI)
})

const baseInput = {
  name: 'Bookshop',
  setNumber: '10270',
  theme: 'Icons',
  pieceCount: 2504,
  condition: 'sealed',
  retirementStatus: 'Retired' as const,
  effectiveRetirementDate: '2023-12-31',
  avgPrice: 280,
  recommendation: 'VELOCITY SELL' as const,
  minifigCount: 3,
  minifigNames: 'Bookshop Owner, Customer, Courier',
}

test('returns listing_title and listing_description on success', async () => {
  const mockResult = { listing_title: 'LEGO 10270 Bookshop - NEW SEALED - Retired Modular', listing_description: 'Great set!' }
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => JSON.stringify(mockResult) },
      }),
    }),
  }) as unknown as GoogleGenerativeAI)

  const result = await generateListing(baseInput)
  expect(result).toEqual(mockResult)
})

test('throws when GEMINI_API_KEY is not set', async () => {
  delete process.env.GEMINI_API_KEY
  await expect(generateListing(baseInput)).rejects.toThrow('GEMINI_API_KEY')
})

test('throws when Gemini returns invalid JSON', async () => {
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => 'not json' },
      }),
    }),
  }) as unknown as GoogleGenerativeAI)

  await expect(generateListing(baseInput)).rejects.toThrow('Failed to parse listing from Gemini')
})

test('includes eBay price in prompt for VELOCITY SELL recommendation', async () => {
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ listing_title: 'T', listing_description: 'D' }) },
      }),
    }),
  }) as unknown as GoogleGenerativeAI)

  await generateListing({ ...baseInput, recommendation: 'VELOCITY SELL' })
  const model = MockGoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.results[0]?.value
  const promptArg = model.generateContent.mock.calls[0][0] as string
  expect(promptArg).toContain('eBay resale avg')
})

test('omits eBay price for HOLD recommendation', async () => {
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ listing_title: 'T', listing_description: 'D' }) },
      }),
    }),
  }) as unknown as GoogleGenerativeAI)

  await generateListing({ ...baseInput, recommendation: 'HOLD', avgPrice: null })
  const model = MockGoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.results[0]?.value
  const promptArg = model.generateContent.mock.calls[0][0] as string
  expect(promptArg).not.toContain('eBay resale avg')
})
