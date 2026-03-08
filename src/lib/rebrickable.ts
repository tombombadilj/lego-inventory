export interface SetData {
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retail_price_usd: number | null
  image_url: string | null
  retired: boolean
}

export function parseSetData(raw: Record<string, unknown>, theme: string | null): SetData {
  const setNum = (raw.set_num as string).replace(/-\d+$/, '')
  return {
    set_number: setNum,
    name: raw.name as string,
    theme,
    piece_count: (raw.num_parts as number) ?? null,
    retail_price_usd: null, // Rebrickable doesn't reliably provide price
    image_url: (raw.set_img_url as string) ?? null,
    retired: false,
  }
}

const TIMEOUT_MS = 8000

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export async function fetchSetFromRebrickable(setNumber: string): Promise<SetData | null> {
  // Try with -1 suffix first, then without (some sets use alternate suffixes)
  const suffixes = [`${setNumber}-1`, setNumber]
  let raw: Record<string, unknown> | null = null

  for (const s of suffixes) {
    try {
      const res = await fetchWithTimeout(
        `https://rebrickable.com/api/v3/lego/sets/${s}/`,
        { headers: { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` } }
      )
      if (res.ok) { raw = await res.json(); break }
    } catch { /* timeout or network error — try next */ }
  }

  if (!raw) return null

  let theme: string | null = null
  if (raw.theme_id) {
    try {
      const themeRes = await fetchWithTimeout(
        `https://rebrickable.com/api/v3/lego/themes/${raw.theme_id}/`,
        { headers: { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` } }
      )
      if (themeRes.ok) {
        const themeData = await themeRes.json()
        theme = themeData.name
      }
    } catch { /* theme fetch timed out — continue without theme */ }
  }

  return parseSetData(raw, theme)
}
