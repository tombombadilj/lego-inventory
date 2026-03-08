export interface CsvRow {
  set_number: string
  purchased_from: string | null
  purchase_price: number | null
  purchase_date: string | null
  condition: 'sealed' | 'open' | 'complete'
  notes: string | null
}

export interface CsvParseResult {
  valid: CsvRow[]
  invalid: { row: number; raw: string; error: string }[]
}

export function parseLegoCsv(csvText: string): CsvParseResult {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return { valid: [], invalid: [] }

  const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/\r$/, ''))
  const valid: CsvRow[] = []
  const invalid: { row: number; raw: string; error: string }[] = []

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '')
    if (!raw.trim()) continue
    const cols = raw.split(',').map(c => c.trim())
    const get = (col: string) => cols[headers.indexOf(col)] ?? ''

    const setNumber = get('set_number')
    if (!setNumber) {
      invalid.push({ row: i + 1, raw, error: 'Missing set_number' })
      continue
    }

    const priceRaw = get('purchase_price')
    let purchase_price: number | null = null
    if (priceRaw) {
      const parsed = parseFloat(priceRaw)
      if (isNaN(parsed)) {
        invalid.push({ row: i + 1, raw, error: 'Invalid purchase_price — must be a number (e.g. 849.99)' })
        continue
      }
      purchase_price = parsed
    }

    const dateRaw = get('purchase_date')
    const purchase_date = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null

    const conditionRaw = get('condition')
    const condition = (['sealed', 'open', 'complete'].includes(conditionRaw)
      ? conditionRaw
      : 'sealed') as CsvRow['condition']

    valid.push({
      set_number: setNumber,
      purchased_from: get('purchased_from') || null,
      purchase_price,
      purchase_date,
      condition,
      notes: get('notes') || null,
    })
  }

  return { valid, invalid }
}
