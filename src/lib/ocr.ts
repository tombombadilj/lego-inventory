// LEGO set numbers are 4-5 digits, do not start with 0, optionally followed by -1
const SET_NUMBER_REGEX = /\b([1-9]\d{3,4})(?:-\d)?\b/g

export function extractSetNumbers(text: string): string[] {
  const matches = [...text.matchAll(SET_NUMBER_REGEX)]
  const numbers = matches.map(m => m[1])
  return [...new Set(numbers)]
}
