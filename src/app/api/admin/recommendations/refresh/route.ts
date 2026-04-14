import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/roles'
import { generateAiRecommendation } from '@/lib/gemini'
import { getRetirementStatus } from '@/lib/recommendations'

/**
 * POST /api/admin/recommendations/refresh
 * Backfills AI analysis for all sets where ai_recommendation IS NULL.
 * Processes up to BATCH_SIZE sets per invocation to avoid Vercel timeout.
 * Run multiple times if remaining > 0.
 * Admin only. Run via browser console:
 *   fetch('/api/admin/recommendations/refresh', { method: 'POST' }).then(r=>r.json()).then(console.log)
 */
export async function POST() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: sets, error } = await serviceSupabase
    .from('sets')
    .select('id, set_number, name, theme, retirement_date, override_retirement_date, override_retired, retiring_soon_override')
    .is('ai_recommendation', null)
    .order('set_number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!sets || sets.length === 0) return NextResponse.json({ total: 0, refreshed: 0, failed: [], remaining: 0 })

  const BATCH_SIZE = 5
  const batch = sets.slice(0, BATCH_SIZE)
  const remaining = sets.length - batch.length

  let refreshed = 0
  const failed: string[] = []

  for (const set of batch) {
    try {
      // Use any user's inventory items for cost/condition context (admin backfill)
      const { data: items } = await serviceSupabase
        .from('inventory_items')
        .select('purchase_price_usd, condition')
        .eq('set_id', set.id)
        .eq('sold', false)
        .limit(10)

      const costsWithValues = (items ?? []).filter(i => i.purchase_price_usd != null)
      const avgCost = costsWithValues.length > 0
        ? costsWithValues.reduce((sum, i) => sum + (i.purchase_price_usd ?? 0), 0) / costsWithValues.length
        : null

      const CONDITION_PRIORITY: Record<string, number> = { sealed: 3, open: 2, complete: 1 }
      const condition = (items ?? []).reduce((best: string, i) => {
        return (CONDITION_PRIORITY[i.condition] ?? 0) > (CONDITION_PRIORITY[best] ?? 0) ? i.condition : best
      }, items?.[0]?.condition ?? 'sealed')

      const { data: snapshot } = await serviceSupabase
        .from('price_snapshots')
        .select('avg_price_usd')
        .eq('set_id', set.id)
        .order('fetched_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const retirementStatus = getRetirementStatus({
        retirement_date: set.retirement_date,
        override_retired: set.override_retired,
        retiring_soon_override: set.retiring_soon_override,
      })
      const effectiveRetirementDate = set.override_retirement_date ?? set.retirement_date

      const result = await generateAiRecommendation({
        setNumber: set.set_number,
        name: set.name,
        theme: set.theme,
        avgCost,
        condition,
        retirementStatus,
        effectiveRetirementDate,
        avgPriceUsd: snapshot?.avg_price_usd ?? null,
      })

      const { error: updateError } = await serviceSupabase
        .from('sets')
        .update({
          ai_recommendation: result.verdict,
          ai_analysis: result.analysis,
          ai_analyzed_at: new Date().toISOString(),
        })
        .eq('set_number', set.set_number)

      if (updateError) {
        failed.push(set.set_number)
      } else {
        refreshed++
      }
    } catch {
      failed.push(set.set_number)
    }
  }

  return NextResponse.json({ total: sets.length, refreshed, failed, remaining })
}
