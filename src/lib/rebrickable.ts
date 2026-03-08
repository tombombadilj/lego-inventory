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

export async function fetchSetFromRebrickable(setNumber: string): Promise<SetData | null> {
  const res = await fetch(
    `https://rebrickable.com/api/v3/lego/sets/${setNumber}-1/`,
    { headers: { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` } }
  )
  if (!res.ok) return null
  const raw = await res.json()

  let theme: string | null = null
  if (raw.theme_id) {
    const themeRes = await fetch(
      `https://rebrickable.com/api/v3/lego/themes/${raw.theme_id}/`,
      { headers: { Authorization: `key ${process.env.REBRICKABLE_API_KEY}` } }
    )
    if (themeRes.ok) {
      const themeData = await themeRes.json()
      theme = themeData.name
    }
  }

  return parseSetData(raw, theme)
}
