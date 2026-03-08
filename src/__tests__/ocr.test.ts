import { extractSetNumbers } from '@/lib/ocr'

describe('extractSetNumbers', () => {
  it('extracts valid LEGO set numbers from OCR text', () => {
    const text = 'Set No: 75192 and also 10294-1 plus some noise'
    const result = extractSetNumbers(text)
    expect(result).toContain('75192')
    expect(result).toContain('10294')
  })

  it('deduplicates repeated set numbers', () => {
    const result = extractSetNumbers('75192 75192 75192')
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('75192')
  })

  it('returns empty array when no set numbers found', () => {
    expect(extractSetNumbers('no numbers here')).toEqual([])
  })

  it('handles set numbers with -1 suffix', () => {
    const result = extractSetNumbers('42154-1')
    expect(result).toContain('42154')
  })
})
