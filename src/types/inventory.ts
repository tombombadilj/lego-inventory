export interface InventoryItem {
  id: string
  set_id: string
  purchased_from: string | null
  purchase_price_usd: number | null
  purchase_date: string | null
  condition: string
  sold: boolean
  sold_price_usd: number | null
  sold_date: string | null
  sold_via: string | null
  created_at: string
  listing_title: string | null
  listing_description: string | null
  sets: {
    id: string
    set_number: string
    name: string
    theme: string | null
    piece_count: number | null
    retail_price_usd: number | null
    retired: boolean
    image_url: string | null
    override_retail_price_usd: number | null
    override_retired: boolean | null
    retirement_date: string | null
    retiring_soon_override: boolean | null
    override_retirement_date: string | null
    minifig_count: number | null
    minifig_names: string | null
    ai_recommendation: string | null
    ai_analysis: string | null
    ai_analyzed_at: string | null
  }
}

export interface GroupedSet {
  set_id: string
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retired: boolean
  override_retired: boolean | null
  retirement_date: string | null
  retiring_soon_override: boolean | null
  override_retirement_date: string | null
  minifig_count: number | null
  minifig_names: string | null
  image_url: string | null
  retail_price: number | null
  items: InventoryItem[]
  total_paid: number
  // Pre-computed server-side from latest price snapshot
  avg_price_usd?: number | null
  recommendation?: 'SELL' | 'HOLD' | 'HOLD LONG' | 'HOLD SHORT' | 'NO_DATA'
  recommendation_reason?: string
  retirement_status?: 'Retired' | 'Retiring Soon' | 'Active'
  ai_recommendation?: string | null
  ai_analysis?: string | null
  ai_analyzed_at?: string | null
}
