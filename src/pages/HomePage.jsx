import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const roundUp = (n) => {
  if (n <= 0) return '0'
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)))
  return `${Math.ceil(n / magnitude) * magnitude}+`
}

function useFadeUp() {
  useEffect(() => {
    const els = document.querySelectorAll('.fade-up')
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.12 }
    )
    els.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

export default function HomePage() {
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const { user } = useAuth()
  const [stats, setStats] = useState({ listings: null, landlords: null, renters: null })
  useFadeUp()

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
        setStats({ listings: listingCount ?? 0, landlords: landlordCount ?? 0, renters: renterCount ?? 0 })
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
    if (n === null) return '·'
    if (n === 0) return '0'
    return roundUp(n)
  }

  return (
    <div className="bg-canvas">

      {/* ── Hero ── */}
      <section className="min-h-[92vh] flex flex-col justify-end px-6 md:px-16 pb-20 relative">

        {/* Subtle warm radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 20% 60%, rgba(196,131,106,0.07), transparent 70%)' }}
        />

        {/* Eyebrow label */}
        <div className="text-[10px] tracking-widest uppercase text-maple mb-7 fade-up">
          Prince Edward Island · Est. 2026
        </div>

        {/* Headline */}
        <h1 className="font-serif font-normal text-ink leading-[1.0] mb-10 fade-up"
          style={{ fontSize: 'clamp(64px, 10vw, 130px)', letterSpacing: '-0.01em' }}>
          Find your<br />home in{' '}
          <em className="italic text-maple not-italic" style={{ fontStyle: 'italic' }}>PEI.</em>
        </h1>

        {/* Search bar */}
        <form onSubmit={handleSearch}
          className="flex max-w-xl mb-12 fade-up"
          style={{ borderBottom: '1px solid #E8E0D5' }}
        >
          <input
            type="text"
            placeholder="Neighbourhood, city, keyword..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent py-4 text-sm text-charcoal placeholder:text-stone focus:outline-none font-light"
          />
          <button
            type="submit"
            className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors py-4 pl-6 flex-shrink-0 flex items-center gap-2"
          >
            Search <span className="text-base leading-none">→</span>
          </button>
        </form>

        {/* Stats */}
        <div className="flex items-center gap-10 fade-up">
          {[
            { label: 'Active Listings', value: formatStat(stats.listings) },
            { label: 'Landlords',       value: formatStat(stats.landlords) },
            { label: 'Renters',         value: formatStat(stats.renters) },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-10">
              {i > 0 && <span className="text-hairline text-xl select-none">·</span>}
              <div>
                <div className={`font-serif font-normal text-3xl text-ink transition-opacity ${s.value === '·' ? 'opacity-20' : 'opacity-100'}`}>
                  {s.value}
                </div>
                <div className="text-[10px] tracking-widest uppercase text-stone mt-0.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="absolute right-8 bottom-20 hidden md:flex flex-col items-center gap-3">
          <div className="w-px h-14 bg-hairline animate-pulse" />
          <span className="text-[9px] tracking-widest uppercase text-stone rotate-90 origin-center translate-y-6">Scroll</span>
        </div>
      </section>

      {/* ── Stats divider strip ── */}
      <div className="border-t border-b border-hairline px-6 md:px-16 py-7 grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { num: '47',   label: 'Homes Placed' },
          { num: '12',   label: 'Years Experience' },
          { num: '98%',  label: 'Satisfaction' },
          { num: '3',    label: 'Cities Covered' },
        ].map(s => (
          <div key={s.label} className="fade-up">
            <div className="font-serif font-normal text-2xl text-maple">{s.num}</div>
            <div className="text-[10px] tracking-widest uppercase text-stone mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Why MapleNest ── */}
      <section className="px-6 md:px-16 py-24">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-16 items-end mb-16">
            <div>
              <div className="text-[10px] tracking-widest uppercase text-maple mb-5 fade-up">Why MapleNest</div>
              <h2 className="font-serif font-normal text-ink leading-[1.15] fade-up"
                style={{ fontSize: 'clamp(36px, 5vw, 60px)' }}>
                Built for the Island.<br />
                <em className="italic">Not a generic</em><br />
                aggregator.
              </h2>
            </div>
            <p className="text-steel text-base leading-relaxed fade-up">
              Every listing is verified. Every landlord is accountable. MapleNest was built specifically for PEI
              — with UPEI proximity filters, Charlottetown neighbourhood search, and community-first trust features.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-hairline border border-hairline">
            {[
              {
                num: '01',
                title: 'Verified Listings',
                desc: 'Every landlord is email-verified. Phone and ID verification available for extra trust.',
              },
              {
                num: '02',
                title: 'Direct Chat',
                desc: 'Message landlords without sharing your personal contact info. Accountability built in.',
              },
              {
                num: '03',
                title: 'PEI-Focused',
                desc: 'Filters for UPEI distance, Charlottetown neighbourhoods, bus routes, and Island-specific needs.',
              },
            ].map(f => (
              <div key={f.num} className="bg-canvas p-8 fade-up group hover:bg-surface transition-colors duration-300">
                <div className="text-[11px] tracking-widest uppercase text-maple mb-5">{f.num}</div>
                <h3 className="font-serif font-normal text-xl text-ink mb-3 group-hover:text-maple transition-colors duration-200">
                  {f.title}
                </h3>
                <p className="text-sm text-steel leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonial ── */}
      <section className="border-t border-hairline py-24 px-6 md:px-16">
        <div className="max-w-2xl mx-auto text-center fade-up">
          <div className="font-serif text-6xl font-normal text-maple leading-none mb-8">&ldquo;</div>
          <blockquote className="font-serif font-normal italic text-ink leading-relaxed mb-8"
            style={{ fontSize: 'clamp(22px, 3vw, 34px)' }}>
            MapleNest made finding a place in Charlottetown genuinely easy. Felt local, felt safe.
          </blockquote>
          <div className="w-8 h-px bg-maple mx-auto mb-4" />
          <p className="text-[10px] tracking-widest uppercase text-stone">
            UPEI Student · Charlottetown, 2025
          </p>
        </div>
      </section>

      {/* ── CTA band ── */}
      <section className="bg-ink px-6 md:px-16 py-20">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
          <div className="fade-up">
            <div className="text-[10px] tracking-widest uppercase text-maple mb-4">For Landlords</div>
            <h2 className="font-serif font-normal text-canvas leading-tight"
              style={{ fontSize: 'clamp(28px, 4vw, 48px)' }}>
              List your PEI property —<br />
              <em className="italic text-maple">free, forever.</em>
            </h2>
          </div>
          <div className="flex flex-col gap-4 fade-up flex-shrink-0">
            <p className="text-stone text-sm leading-relaxed max-w-xs">
              Connect directly with verified renters across the Island. No commissions. No middlemen.
            </p>
            <Link
              to={user ? '/create-listing' : '/signup'}
              className="inline-flex items-center gap-3 bg-maple text-white text-[11px] tracking-widest uppercase px-8 py-4 hover:bg-maple-dark transition-colors duration-200 self-start"
            >
              Post a Listing <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer strip ── */}
      <div className="border-t border-hairline px-6 md:px-16 py-6 flex items-center justify-between">
        <span className="font-serif text-sm tracking-widest uppercase text-stone">
          Maple<span className="text-maple">·</span>Nest
        </span>
        <span className="text-[10px] tracking-widest uppercase text-stone">
          Prince Edward Island, Canada
        </span>
      </div>

    </div>
  )
}
