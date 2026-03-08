import { parseLegoCsv } from '@/lib/csv'

describe('parseLegoCsv', () => {
  it('parses valid CSV rows into inventory items', () => {
    const csv = `set_number,purchased_from,purchase_price,purchase_date,condition,notes
75192,Target,849.99,2023-12-01,sealed,Christmas gift
10294,Amazon,679.99,,sealed,`
    const result = parseLegoCsv(csv)
    expect(result.valid).toHaveLength(2)
    expect(result.valid[0].set_number).toBe('75192')
    expect(result.valid[0].purchase_price).toBe(849.99)
    expect(result.valid[0].purchase_date).toBe('2023-12-01')
    expect(result.valid[1].purchase_date).toBeNull()
  })

  it('defaults condition to sealed when not specified', () => {
    const csv = `set_number,condition\n75192,`
    const result = parseLegoCsv(csv)
    expect(result.valid[0].condition).toBe('sealed')
  })

  it('flags rows with missing set_number as invalid', () => {
    const csv = `set_number,purchased_from\n,Target`
    const result = parseLegoCsv(csv)
    expect(result.valid).toHaveLength(0)
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0].error).toMatch(/set_number/)
  })

  it('flags rows with non-numeric price as invalid', () => {
    const csv = `set_number,purchase_price\n75192,notaprice`
    const result = parseLegoCsv(csv)
    expect(result.invalid[0].error).toMatch(/purchase_price/)
  })

  it('ignores invalid date formats and saves as null', () => {
    const csv = `set_number,purchase_date\n75192,12/01/2023`
    const result = parseLegoCsv(csv)
    expect(result.valid[0].purchase_date).toBeNull()
  })

  it('handles minimal CSV with set_number only', () => {
    const csv = `set_number\n75192\n10294`
    const result = parseLegoCsv(csv)
    expect(result.valid).toHaveLength(2)
    expect(result.invalid).toHaveLength(0)
  })
})
