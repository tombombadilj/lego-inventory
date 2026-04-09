/**
 * @jest-environment node
 */
import { PATCH } from '../app/api/admin/sets/[set_number]/route'
import { NextRequest } from 'next/server'

// Mock supabase server client
jest.mock('../lib/supabase/server', () => ({
  createClient: jest.fn(),
}))
import { createClient } from '../lib/supabase/server'
const mockCreateClient = createClient as jest.Mock

function makeSupabaseMock(overrides: {
  userEmail?: string | null
  updateError?: string | null
  updateData?: object | null
} = {}) {
  const { userEmail = 'jasonchiu0803@gmail.com', updateError = null, updateData = { set_number: '10270', override_retired: true } } = overrides
  const mockSingle = jest.fn().mockResolvedValue({ data: updateData, error: updateError ? { message: updateError } : null })
  const mockSelect = jest.fn().mockReturnValue({ single: mockSingle })
  const mockEq = jest.fn().mockReturnValue({ select: mockSelect })
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq })
  const mockFrom = jest.fn().mockReturnValue({ update: mockUpdate })
  mockCreateClient.mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: userEmail ? { email: userEmail } : null } }) },
    from: mockFrom,
  })
  return { mockFrom, mockUpdate, mockEq }
}

async function callPatch(setNumber: string, body: object) {
  const req = new NextRequest(`http://localhost/api/admin/sets/${setNumber}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return PATCH(req, { params: Promise.resolve({ set_number: setNumber }) })
}

test('returns 403 for non-admin user', async () => {
  makeSupabaseMock({ userEmail: 'other@example.com' })
  const res = await callPatch('10270', { override_retired: true })
  expect(res.status).toBe(403)
})

test('returns 403 for unauthenticated request', async () => {
  makeSupabaseMock({ userEmail: null })
  const res = await callPatch('10270', { override_retired: true })
  expect(res.status).toBe(403)
})

test('returns 400 when no valid fields provided', async () => {
  makeSupabaseMock()
  const res = await callPatch('10270', { unknown_field: true })
  expect(res.status).toBe(400)
})

test('updates override_retired on sets table for admin user', async () => {
  const { mockUpdate } = makeSupabaseMock()
  const res = await callPatch('10270', { override_retired: true })
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith({ override_retired: true })
})

test('updates retiring_soon_override on sets table for admin user', async () => {
  const { mockUpdate } = makeSupabaseMock({ updateData: { set_number: '10270', retiring_soon_override: true } })
  const res = await callPatch('10270', { retiring_soon_override: true })
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith({ retiring_soon_override: true })
})

test('updates override_retirement_date on sets table for admin user', async () => {
  const { mockUpdate } = makeSupabaseMock({ updateData: { set_number: '10270', override_retirement_date: '2025-12-31' } })
  const res = await callPatch('10270', { override_retirement_date: '2025-12-31' })
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith({ override_retirement_date: '2025-12-31' })
})
