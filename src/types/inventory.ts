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
  }
}

export interface GroupedSet {
  set_number: string
  name: string
  theme: string | null
  piece_count: number | null
  retired: boolean
  image_url: string | null
  retail_price: number | null
  items: InventoryItem[]
  total_paid: number
}
