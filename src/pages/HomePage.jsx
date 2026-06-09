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
    <div className="bg-canvas">

      {/* Hero — deep navy, Notion-style */}
      <section className="bg-navy text-white">
        <div className="max-w-3xl mx-auto px-4 pt-20 pb-16 text-center">
          <div className="inline-flex items-center gap-1.5 bg-navy-mid text-blue-200 text-xs font-medium px-3 py-1 rounded-full mb-6">
            <span>🍁</span>
            <span>Prince Edward Island</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-[1.15]">
            Find your home<br className="hidden sm:block" /> in PEI
          </h1>
          <p className="text-blue-200 text-base md:text-lg mb-10 max-w-xl mx-auto leading-relaxed">
            Verified rentals for UPEI students, young professionals, and Island residents.
            Safe, local, and community-driven.
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch}
            className="flex bg-white rounded-xl overflow-hidden shadow-lg max-w-xl mx-auto">
            <input
              type="text"
              placeholder="Neighbourhood, city, keyword..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-5 py-3.5 text-sm text-charcoal placeholder:text-stone focus:outline-none"
            />
            <button type="submit"
              className="bg-maple-red text-white font-medium text-sm px-6 py-3.5 hover:bg-maple-dark transition-colors flex-shrink-0">
              Search
            </button>
          </form>
        </div>

        {/* Stats band — sits at bottom of hero */}
        <div className="border-t border-navy-mid">
          <div className="max-w-3xl mx-auto px-4 py-5 grid grid-cols-3 gap-4 text-center">
            {[
              { label: 'Active Listings', value: formatStat(stats.listings) },
              { label: 'Landlords', value: formatStat(stats.landlords) },
              { label: 'Renters', value: formatStat(stats.renters) },
            ].map(stat => (
              <div key={stat.label}>
                <div className={`text-2xl font-bold text-white transition-opacity ${stat.value === '...' ? 'opacity-30' : 'opacity-100'}`}>
                  {stat.value}
                </div>
                <div className="text-xs text-blue-300 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — warm canvas */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-xl font-semibold text-ink text-center mb-1">Why MapleNest?</h2>
          <p className="text-sm text-steel text-center mb-10">Built for the Island. Not a generic listing aggregator.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                icon: '✅',
                title: 'Verified Listings',
                desc: 'Every landlord is email-verified. Phone and ID verification available for extra trust.',
              },
              {
                icon: '💬',
                title: 'Direct Chat',
                desc: 'Message landlords without sharing your personal contact info. Accountability built in.',
              },
              {
                icon: '🗺️',
                title: 'PEI-Focused',
                desc: 'Filters for UPEI distance, Charlottetown neighbourhoods, bus routes, and Island-specific needs.',
              },
            ].map(f => (
              <div key={f.title} className="bg-white rounded-xl border border-hairline shadow-card p-5">
                <div className="text-2xl mb-3">{f.icon}</div>
                <h3 className="font-medium text-charcoal mb-1.5">{f.title}</h3>
                <p className="text-sm text-steel leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA — surface band */}
      <section className="bg-surface border-t border-hairline py-14 px-4 text-center">
        <div className="max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-ink mb-2">Are you a landlord in PEI?</h2>
          <p className="text-sm text-steel mb-6">List your property for free and connect with verified renters across the Island.</p>
          <Link to={user ? '/create-listing' : '/signup'}
            className="inline-block bg-maple-red text-white px-7 py-2.5 rounded-full text-sm font-medium hover:bg-maple-dark transition-colors">
            Post a Free Listing
          </Link>
        </div>
      </section>
    </div>
  )
}
