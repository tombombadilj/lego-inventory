import { getRetirementStatus } from '../lib/recommendations'

function makeSet(overrides: {
  retirement_date?: string | null
  override_retired?: boolean | null
  retiring_soon_override?: boolean | null
}) {
  return {
    retirement_date: null,
    override_retired: null,
    retiring_soon_override: null,
    ...overrides,
  }
}

describe('getRetirementStatus', () => {
  test('returns Retired when override_retired is true', () => {
    expect(getRetirementStatus(makeSet({ override_retired: true }))).toBe('Retired')
  })

  test('returns Retired when retirement_date is in the past', () => {
    expect(getRetirementStatus(makeSet({ retirement_date: '2020-01-01' }))).toBe('Retired')
  })

  test('auto-Retired (past retirement_date) wins over retiring_soon_override', () => {
    expect(getRetirementStatus(makeSet({ retirement_date: '2020-01-01', retiring_soon_override: true }))).toBe('Retired')
  })

  test('returns Retiring Soon when retiring_soon_override is true and no retirement_date', () => {
    expect(getRetirementStatus(makeSet({ retiring_soon_override: true }))).toBe('Retiring Soon')
  })

  test('returns Retiring Soon when retirement_date is within 6 months', () => {
    const soon = new Date()
    soon.setMonth(soon.getMonth() + 3)
    const soonStr = soon.toISOString().slice(0, 10)
    expect(getRetirementStatus(makeSet({ retirement_date: soonStr }))).toBe('Retiring Soon')
  })

  test('returns Active when retirement_date is beyond 6 months', () => {
    const far = new Date()
    far.setFullYear(far.getFullYear() + 2)
    const farStr = far.toISOString().slice(0, 10)
    expect(getRetirementStatus(makeSet({ retirement_date: farStr }))).toBe('Active')
  })

  test('returns Active when all fields are null', () => {
    expect(getRetirementStatus(makeSet({}))).toBe('Active')
  })

  test('override_retired wins over retiring_soon_override', () => {
    expect(getRetirementStatus(makeSet({ override_retired: true, retiring_soon_override: true }))).toBe('Retired')
  })
})
