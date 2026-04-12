import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const roundUp = (n) => {
  if (n <= 0) return '0'
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)))
  return `${Math.ceil(n / magnitude) * magnitude}+`
}

export default function HomePage() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()
  const [stats, setStats] = useState({ listings: null, landlords: null, renters: null })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [
          { count: listingCount },
          { count: landlordCount },
          { count: renterCount },
        ] = await Promise.all([
          supabase.from('listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'landlord'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'renter'),
        ])
        setStats({
          listings: listingCount ?? 0,
          landlords: landlordCount ?? 0,
          renters: renterCount ?? 0,
        })
      } catch {
        setStats({ listings: 0, landlords: 0, renters: 0 })
      }
    }
    fetchStats()
  }, [])

  const handleSearch = (e) => {
    e.preventDefault()
    navigate(`/listings?q=${encodeURIComponent(search)}`)
  }

  const formatStat = (n) => {
    if (n === null) return '...'
    if (n === 0) return '0'
    return roundUp(n)
  }

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-red-700 to-red-900 text-white py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Find Your Home in PEI 🍁
          </h1>
          <p className="text-red-100 text-lg mb-8">
            Verified listings for UPEI students, young professionals, and Island residents.
            With a view to expand country wide.
            Safe, local, and community-driven.
          </p>
          <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto">
            <input
              type="text"
              placeholder="Search by neighbourhood, city, or keyword..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <button type="submit"
              className="bg-white text-red-700 font-semibold px-6 py-3 rounded-lg hover:bg-red-50 transition">
              Search
            </button>
          </form>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-white border-b py-6">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 gap-4 text-center">
          {[
            { label: 'Active Listings', value: formatStat(stats.listings) },
            { label: 'Verified Landlords', value: formatStat(stats.landlords) },
            { label: 'Renters on Platform', value: formatStat(stats.renters) },
          ].map(stat => (
            <div key={stat.label}>
              <div className={`text-2xl font-bold text-red-700 transition-all ${stat.value === '...' ? 'opacity-30' : 'opacity-100'}`}>
                {stat.value}
              </div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-10">Why MapleNest?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: '✅', title: 'Verified Listings', desc: 'Every landlord is email-verified. Phone and ID verification available for extra trust.' },
            { icon: '💬', title: 'Direct Chat', desc: 'Message landlords without sharing your personal contact info. Accountability built in.' },
            { icon: '🗺️', title: 'PEI-Focused', desc: 'Filters for UPEI distance, Charlottetown neighbourhoods, bus routes, and Island-specific needs.' },
          ].map(f => (
            <div key={f.title} className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-800 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-red-50 py-12 px-4 text-center">
        <h2 className="text-xl font-bold text-gray-800 mb-3">Are you a landlord in PEI?</h2>
        <p className="text-gray-500 text-sm mb-6">List your property for free and connect with verified renters.</p>
        <Link to={user ? '/create-listing' : '/signup'}
          className="bg-red-700 text-white px-8 py-3 rounded-lg font-semibold hover:bg-red-800 transition">
          Post a Free Listing
        </Link>
      </section>
    </div>
  )
}
