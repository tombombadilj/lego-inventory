import { login } from './actions'

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1A1A1A]">
      <div className="bg-[#2A2A2A] p-8 rounded-xl shadow-lg w-full max-w-sm border border-gray-700">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#DA291C] rounded-xl mb-4">
            <span className="text-white font-bold text-xl">L</span>
          </div>
          <h1 className="text-2xl font-bold text-white">LEGO Inventory</h1>
          <p className="text-gray-400 text-sm mt-1">Sign in to your account</p>
        </div>
        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              id="email" name="email" type="email" required autoComplete="email"
              className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#DA291C] focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              id="password" name="password" type="password" required autoComplete="current-password"
              className="w-full bg-[#1A1A1A] border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#DA291C] focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[#DA291C] text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors mt-2"
          >
            Log in
          </button>
        </form>
      </div>
    </div>
  )
}
