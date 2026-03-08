import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import LogoutButton from '@/components/LogoutButton'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-[#1A1A1A]">
      {/* Nav */}
      <nav className="bg-[#2A2A2A] border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#DA291C] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">L</span>
          </div>
          <span className="text-white font-semibold">LEGO Inventory</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm hidden sm:block">{user?.email}</span>
          <LogoutButton />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">My Inventory</h1>
          <p className="text-gray-400 text-sm mt-1">Your LEGO collection, all in one place.</p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Link href="/upload" className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-5 hover:border-[#DA291C] transition-colors group">
            <div className="text-2xl mb-2">📷</div>
            <p className="text-white font-medium group-hover:text-[#DA291C] transition-colors">Add Sets</p>
            <p className="text-gray-400 text-xs mt-1">Photo, manual entry, or CSV upload</p>
          </Link>
          <Link href="/admin/users" className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-5 hover:border-[#DA291C] transition-colors group">
            <div className="text-2xl mb-2">👥</div>
            <p className="text-white font-medium group-hover:text-[#DA291C] transition-colors">Manage Users</p>
            <p className="text-gray-400 text-xs mt-1">Invite and manage access</p>
          </Link>
          <Link href="/settings" className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-5 hover:border-[#DA291C] transition-colors group">
            <div className="text-2xl mb-2">⚙️</div>
            <p className="text-white font-medium group-hover:text-[#DA291C] transition-colors">Alert Settings</p>
            <p className="text-gray-400 text-xs mt-1">Configure your alert thresholds</p>
          </Link>
        </div>

        {/* Inventory placeholder — will be replaced in Task 7 */}
        <div className="bg-[#2A2A2A] border border-gray-700 rounded-xl p-8 text-center">
          <p className="text-4xl mb-3">🧱</p>
          <p className="text-white font-medium">No sets in your inventory yet</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Add your first set to get started</p>
          <Link href="/upload"
            className="inline-block bg-[#DA291C] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors">
            Add Sets
          </Link>
        </div>
      </div>
    </div>
  )
}
