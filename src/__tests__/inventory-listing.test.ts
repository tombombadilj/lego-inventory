/**
 * @jest-environment node
 */
import { POST } from '../app/api/inventory/[id]/listing/route'
import { NextRequest } from 'next/server'

jest.mock('../lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('../lib/gemini', () => ({ generateListing: jest.fn() }))

import { createClient } from '../lib/supabase/server'
import { generateListing } from '../lib/gemini'

const mockCreateClient = createClient as jest.Mock
const mockGenerateListing = generateListing as jest.Mock

function makeSupabaseMock(overrides: {
  user?: { id: string } | null
  item?: object | null
  updateError?: string | null
} = {}) {
  const { user = { id: 'user-1' }, item = null, updateError = null } = overrides

  const mockSingle = jest.fn()
  const mockEq2 = jest.fn().mockReturnValue({ single: mockSingle })
  const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
  const mockFrom = jest.fn()

  // inventory_items select
  mockSingle.mockResolvedValue({ data: item, error: item ? null : { message: 'Not found' } })

  // update mock — supports .eq('id', id).eq('added_by', user.id) chaining
  const mockUpdateEq2 = jest.fn().mockResolvedValue({ error: updateError ? { message: updateError } : null })
  const mockUpdateEq1 = jest.fn().mockReturnValue({ eq: mockUpdateEq2 })
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockUpdateEq1 })

  mockFrom.mockImplementation((table: string) => {
    if (table === 'inventory_items') return { select: () => ({ eq: mockEq1 }), update: mockUpdate }
    return {}
  })

  mockCreateClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user } }) },
    from: mockFrom,
  })

  return { mockUpdate, mockUpdateEq1, mockUpdateEq2 }
}

async function callPost(id: string) {
  const req = new NextRequest(`http://localhost/api/inventory/${id}/listing`, { method: 'POST' })
  return POST(req, { params: Promise.resolve({ id }) })
}

test('returns 401 when not authenticated', async () => {
  makeSupabaseMock({ user: null })
  const res = await callPost('item-1')
  expect(res.status).toBe(401)
})

test('returns 404 when item not found or not owned', async () => {
  makeSupabaseMock({ user: { id: 'user-1' }, item: null })
  const res = await callPost('item-1')
  expect(res.status).toBe(404)
})

test('returns 200 with listing data on success', async () => {
  const item = {
    id: 'item-1',
    condition: 'sealed',
    sets: {
      name: 'Bookshop', set_number: '10270', theme: 'Icons', piece_count: 2504,
      retirement_date: '2023-12-31', override_retirement_date: null,
      override_retired: true, retiring_soon_override: null,
      minifig_count: 3, minifig_names: 'Owner, Customer',
      avg_price_usd: 280,
    },
  }
  makeSupabaseMock({ item })
  mockGenerateListing.mockResolvedValueOnce({
    listing_title: 'LEGO 10270 Bookshop - NEW SEALED - Retired',
    listing_description: 'Amazing set!',
  })

  const res = await callPost('item-1')
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.listing_title).toBe('LEGO 10270 Bookshop - NEW SEALED - Retired')
})

test('returns 502 when generateListing throws', async () => {
  const item = {
    id: 'item-1', condition: 'sealed',
    sets: { name: 'Bookshop', set_number: '10270', theme: 'Icons', piece_count: 2504,
            retirement_date: null, override_retirement_date: null, override_retired: null,
            retiring_soon_override: null, minifig_count: null, minifig_names: null },
  }
  makeSupabaseMock({ item })
  mockGenerateListing.mockRejectedValueOnce(new Error('Gemini down'))

  const res = await callPost('item-1')
  expect(res.status).toBe(502)
})
