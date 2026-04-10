import { GoogleGenerativeAI } from '@google/generative-ai'
import type { Recommendation } from './recommendations'

export interface ListingInput {
  name: string
  setNumber: string
  theme: string | null
  pieceCount: number | null
  condition: string
  retirementStatus: string
  effectiveRetirementDate: string | null
  avgPrice: number | null
  recommendation: Recommendation
  minifigCount: number | null
  minifigNames: string | null
}

export interface ListingOutput {
  listing_title: string
  listing_description: string
}

export async function generateListing(input: ListingInput): Promise<ListingOutput> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })

  const includeEbayPrice = input.recommendation === 'LIQUIDATE' || input.recommendation === 'VELOCITY SELL'
  const ebayPriceLine = includeEbayPrice && input.avgPrice
    ? `eBay resale avg: $${input.avgPrice}`
    : ''

  const retirementLine = input.retirementStatus === 'Retired' && input.effectiveRetirementDate
    ? `Retirement status: Retired (since ${input.effectiveRetirementDate})`
    : `Retirement status: ${input.retirementStatus}`

  const minifigLine = input.minifigNames
    ? `Minifigures (${input.minifigCount} total): ${input.minifigNames}`
    : input.minifigCount
      ? `Minifigures: ${input.minifigCount} included`
      : ''

  const prompt = [
    `You're helping sell a LEGO set on Facebook Marketplace. Write friendly, attention-grabbing copy.`,
    ``,
    `Set: ${input.name} (#${input.setNumber})`,
    `Theme: ${input.theme ?? 'Unknown'}`,
    `Pieces: ${input.pieceCount ?? 'Unknown'}`,
    `Condition: ${input.condition}`,
    retirementLine,
    minifigLine,
    ebayPriceLine,
    ``,
    `Rules:`,
    `- Title: max 80 characters, format "LEGO {number} {name} - {CONDITION IN CAPS} - {1 compelling hook}"`,
    `- Description: 3-4 sentences, friendly tone`,
    `- If retired/rare: mention it's no longer in stores`,
    `- If eBay price is provided: note that our price is lower than eBay`,
    `- Always mention piece count`,
    `- If any minifigures are known to be particularly collectible, sought-after, or have recently spiked in popularity (e.g. exclusive figures, pop culture tie-ins), name them in the description — only if you are confident, do not speculate`,
    `- Do not invent facts`,
    `- Return valid JSON only: { "listing_title": "...", "listing_description": "..." }`,
    // ^ Note: The spec's prompt example uses { "title", "description" } but we use the DB column
    // names directly to avoid a remapping step. This is an intentional deviation from the spec's prompt text.
  ].filter(Boolean).join('\n').trim()

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  let parsed: ListingOutput
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Failed to parse listing from Gemini')
  }

  if (!parsed.listing_title || !parsed.listing_description) {
    throw new Error('Failed to parse listing from Gemini')
  }

  return parsed
}
