// LEGO set numbers are 4-6 digits, optionally followed by -1
const SET_NUMBER_REGEX = /\b(\d{4,6})(?:-\d)?\b/g

export function extractSetNumbers(text: string): string[] {
  const matches = [...text.matchAll(SET_NUMBER_REGEX)]
  const numbers = matches.map(m => m[1])
  return [...new Set(numbers)]
}
