'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  email: string
  role: string
  created_at: string
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const router = useRouter()

  async function fetchUsers() {
    const res = await fetch('/api/admin/users')
    if (res.status === 403) { router.push('/dashboard'); return }
    setUsers(await res.json())
  }

  useEffect(() => { fetchUsers() }, [])

  async function invite() {
    if (!inviteEmail) return
    setLoading(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    if (res.ok) {
      setMessage({ text: `Invite sent to ${inviteEmail}`, type: 'success' })
      setInviteEmail('')
      fetchUsers()
    } else {
      const data = await res.json()
      setMessage({ text: data.error ?? 'Failed to send invite', type: 'error' })
    }
    setLoading(false)
    setTimeout(() => setMessage(null), 4000)
  }

  async function changeRole(id: string, role: string) {
    await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setUsers(users.map(u => u.id === id ? { ...u, role } : u))
  }

  async function removeUser(id: string, email: string) {
    if (!confirm(`Remove ${email}? This cannot be undone.`)) return
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    setUsers(users.filter(u => u.id !== id))
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white mb-6">User Management</h1>

      {/* Invite form */}
      <div className="bg-[#2A2A2A] rounded-xl p-4 mb-6 border border-gray-700">
        <p className="text-sm font-medium text-gray-300 mb-3">Invite New User</p>
        <div className="flex gap-2">
          <input
            type="email" placeholder="email@example.com" value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && invite()}
            className="flex-1 bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#DA291C]"
          />
          <button
            onClick={invite} disabled={loading || !inviteEmail}
            className="bg-[#DA291C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
        {message && (
          <p className={`text-sm mt-2 ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* Users list */}
      <div className="space-y-2">
        {users.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">No users found.</p>
        )}
        {users.map(user => (
          <div key={user.id} className="bg-[#2A2A2A] rounded-lg px-4 py-3 flex items-center justify-between border border-gray-700">
            <div>
              <p className="text-sm font-medium text-white">{user.email}</p>
              <p className="text-xs text-gray-400">
                Joined {new Date(user.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={user.role}
                onChange={e => changeRole(user.id, e.target.value)}
                className="bg-[#1A1A1A] border border-gray-600 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#DA291C]"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={() => removeUser(user.id, user.email ?? '')}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
