-- Fix overly permissive inventory RLS policy.
-- Previously a single "for all" policy allowed every authenticated user to
-- read, insert, update, and delete any row regardless of ownership.
-- Replace it with per-operation policies so only the item owner can mutate
-- their own records, while all members retain read access.

drop policy if exists "Authenticated users manage all inventory" on public.inventory_items;

-- All authenticated users can read all inventory (shared team/family view)
create policy "Authenticated users can read inventory"
  on public.inventory_items for select to authenticated
  using (true);

-- Users can only insert items they own
create policy "Users can insert own inventory"
  on public.inventory_items for insert to authenticated
  with check (auth.uid() = added_by);

-- Users can only update items they own
create policy "Users can update own inventory"
  on public.inventory_items for update to authenticated
  using (auth.uid() = added_by) with check (auth.uid() = added_by);

-- Users can only delete items they own
create policy "Users can delete own inventory"
  on public.inventory_items for delete to authenticated
  using (auth.uid() = added_by);
