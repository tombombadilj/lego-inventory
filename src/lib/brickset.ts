async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function fetchRetirementDate(setNumber: string): Promise<Date | null> {
  if (!process.env.BRICKSET_API_KEY) {
    throw new Error('BRICKSET_API_KEY environment variable not set')
  }

  const suffixes = [`${setNumber}-1`, setNumber]
  for (const s of suffixes) {
    try {
      const params = encodeURIComponent(JSON.stringify({ setNumber: s }))
      const url = `https://brickset.com/api/v3.asmx/getSets?apiKey=${process.env.BRICKSET_API_KEY}&userHash=&params=${params}`
      const res = await fetchWithTimeout(url)
      if (!res.ok) continue
      const data = await res.json()
      if (data.status !== 'success' || !data.sets?.length) continue
      const exitDate = data.sets[0].exitDate
      if (!exitDate || typeof exitDate !== 'string') return null
      const date = new Date(exitDate)
      if (isNaN(date.getTime())) return null
      return date
    } catch {
      // timeout, network error, or JSON parse error — try next suffix
    }
  }
  return null
}
