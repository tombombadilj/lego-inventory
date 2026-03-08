'use client'
import { logout } from '@/app/login/actions'

export default function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm text-gray-400 hover:text-white transition-colors">
        Log out
      </button>
    </form>
  )
}
