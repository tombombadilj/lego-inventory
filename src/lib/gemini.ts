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

export interface AiRecommendationInput {
  setNumber: string
  name: string
  theme: string | null
  avgCost: number | null
  condition: string
  retirementStatus: string
  effectiveRetirementDate: string | null
  avgPriceUsd: number | null
}

export interface AiRecommendationOutput {
  verdict: string
  analysis: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGenAI(): any {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set')
  }
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  return genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json' },
  })
}

export async function generateListing(input: ListingInput): Promise<ListingOutput> {
  const model = getGenAI()

  // Include eBay price in listing prompt when recommendation is SELL
  const includeEbayPrice = input.recommendation === 'SELL'
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

export async function generateAiRecommendation(input: AiRecommendationInput): Promise<AiRecommendationOutput> {
  const model = getGenAI()

  const conditionLabel =
    input.condition === 'sealed' ? 'New In Sealed Box (NISB)' :
    input.condition === 'open'   ? 'Opened / Assembled' :
                                   'Complete (Built)'

  const retirementLine =
    input.retirementStatus === 'Retired'       ? `Retirement status: Retired (since ${input.effectiveRetirementDate ?? 'unknown'})` :
    input.retirementStatus === 'Retiring Soon'  ? `Retirement status: Retiring Soon` :
                                                  `Retirement status: Active (still in production)`

  const priceLine = input.avgPriceUsd
    ? `Current eBay avg asking price (sealed): $${input.avgPriceUsd}`
    : ''

  const prompt = [
    `Role: Act as a LEGO investment analyst and secondary market expert.`,
    ``,
    `Task: Research and assess whether I should HOLD or SELL the following LEGO set:`,
    ``,
    `Set Number: ${input.setNumber}`,
    `Set Name: ${input.name}`,
    `Theme: ${input.theme ?? 'Unknown'}`,
    `My Cost: $${input.avgCost ?? 'Unknown'}`,
    `Condition: ${conditionLabel}`,
    retirementLine,
    priceLine,
    ``,
    `Please research current sold prices on BrickLink, eBay, and BrickEconomy, then respond in exactly this JSON format:`,
    ``,
    `{`,
    `  "verdict": "SELL | HOLD | HOLD LONG | HOLD SHORT",`,
    `  "analysis": "---\\n## VERDICT: [verdict]\\n\\n**Recommended Action:** [one sentence]\\n**If selling, target price:** $X – $Y on [platform]\\n\\n---\\n## Why\\n\\n[2-3 paragraphs covering: current market value vs cost, retirement status and appreciation trend, theme-specific factors, risks]\\n\\n---\\n## The Numbers\\n\\n| Metric | Value |\\n|---|---|\\n| My cost | $X |\\n| Current NISB market value | $X–$Y |\\n| Profit if I sell today | $X (~X% ROI) |\\n| Projected value in 1 year | $X |\\n| Projected value in 3 years | $X |\\n| Annualized growth rate (estimated) | X% |\\n\\n---\\n## Risk Level: [LOW / MEDIUM / HIGH]\\n[One sentence on biggest risk.]"`,
    `}`,
  ].filter(Boolean).join('\n').trim()

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  let parsed: AiRecommendationOutput
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Failed to parse AI analysis from Gemini')
  }

  const validVerdicts = ['SELL', 'HOLD', 'HOLD LONG', 'HOLD SHORT']
  if (!validVerdicts.includes(parsed.verdict) || !parsed.analysis) {
    throw new Error('Failed to parse AI analysis from Gemini')
  }

  return parsed
}
