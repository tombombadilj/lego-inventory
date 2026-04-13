// Mock @google/generative-ai before importing gemini.ts
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  })),
}))

import { GoogleGenerativeAI } from '@google/generative-ai'
import { generateListing, generateAiRecommendation } from '../lib/gemini'

const MockGoogleGenerativeAI = GoogleGenerativeAI as jest.MockedClass<typeof GoogleGenerativeAI>

function mockGenerativeAI(responseText: string) {
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValueOnce({
        response: { text: () => responseText },
      }),
    }),
  }) as unknown as GoogleGenerativeAI)
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GEMINI_API_KEY = 'test-key'
  MockGoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn(),
    }),
  }) as unknown as GoogleGenerativeAI)
})

// ---- generateListing tests ----

const baseListingInput = {
  name: 'Bookshop',
  setNumber: '10270',
  theme: 'Icons',
  pieceCount: 2504,
  condition: 'sealed',
  retirementStatus: 'Retired' as const,
  effectiveRetirementDate: '2023-12-31',
  avgPrice: 280,
  recommendation: 'SELL' as const,
  minifigCount: 3,
  minifigNames: 'Bookshop Owner, Customer, Courier',
}

test('generateListing: returns listing_title and listing_description on success', async () => {
  const mockResult = { listing_title: 'LEGO 10270 Bookshop - NEW SEALED - Retired Modular', listing_description: 'Great set!' }
  mockGenerativeAI(JSON.stringify(mockResult))
  const result = await generateListing(baseListingInput)
  expect(result).toEqual(mockResult)
})

test('generateListing: throws when GEMINI_API_KEY is not set', async () => {
  delete process.env.GEMINI_API_KEY
  await expect(generateListing(baseListingInput)).rejects.toThrow('GEMINI_API_KEY')
})

test('generateListing: throws when Gemini returns invalid JSON', async () => {
  mockGenerativeAI('not json')
  await expect(generateListing(baseListingInput)).rejects.toThrow('Failed to parse listing from Gemini')
})

test('generateListing: includes eBay price in prompt for SELL recommendation', async () => {
  mockGenerativeAI(JSON.stringify({ listing_title: 'T', listing_description: 'D' }))
  await generateListing({ ...baseListingInput, recommendation: 'SELL' })
  const model = MockGoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.results[0]?.value
  const promptArg = model.generateContent.mock.calls[0][0] as string
  expect(promptArg).toContain('eBay resale avg')
})

test('generateListing: omits eBay price for HOLD recommendation', async () => {
  mockGenerativeAI(JSON.stringify({ listing_title: 'T', listing_description: 'D' }))
  await generateListing({ ...baseListingInput, recommendation: 'HOLD', avgPrice: null })
  const model = MockGoogleGenerativeAI.mock.results[0]?.value.getGenerativeModel.mock.results[0]?.value
  const promptArg = model.generateContent.mock.calls[0][0] as string
  expect(promptArg).not.toContain('eBay resale avg')
})

// ---- generateAiRecommendation tests ----

const baseAiInput = {
  setNumber: '10270',
  name: 'Bookshop',
  theme: 'Icons',
  avgCost: 150,
  condition: 'sealed',
  retirementStatus: 'Retired',
  effectiveRetirementDate: '2023-12-31',
  avgPriceUsd: 280,
}

test('generateAiRecommendation: returns verdict and analysis on success', async () => {
  const mockResult = { verdict: 'SELL', analysis: '## VERDICT: SELL\n\nGreat investment.' }
  mockGenerativeAI(JSON.stringify(mockResult))
  const result = await generateAiRecommendation(baseAiInput)
  expect(result.verdict).toBe('SELL')
  expect(result.analysis).toContain('SELL')
})

test('generateAiRecommendation: throws when GEMINI_API_KEY is not set', async () => {
  delete process.env.GEMINI_API_KEY
  await expect(generateAiRecommendation(baseAiInput)).rejects.toThrow('GEMINI_API_KEY')
})

test('generateAiRecommendation: throws when Gemini returns invalid JSON', async () => {
  mockGenerativeAI('not json')
  await expect(generateAiRecommendation(baseAiInput)).rejects.toThrow('Failed to parse AI analysis from Gemini')
})

test('generateAiRecommendation: throws when verdict is not a valid label', async () => {
  mockGenerativeAI(JSON.stringify({ verdict: 'MAYBE', analysis: 'some analysis' }))
  await expect(generateAiRecommendation(baseAiInput)).rejects.toThrow('Failed to parse AI analysis from Gemini')
})

test('generateAiRecommendation: accepts all four valid verdicts', async () => {
  for (const verdict of ['SELL', 'HOLD', 'HOLD LONG', 'HOLD SHORT']) {
    mockGenerativeAI(JSON.stringify({ verdict, analysis: 'analysis text' }))
    const result = await generateAiRecommendation(baseAiInput)
    expect(result.verdict).toBe(verdict)
  }
})
