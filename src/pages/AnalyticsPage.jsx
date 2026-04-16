import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const TYPE_LABELS = {
  apartment: 'Apartment', house: 'House', room: 'Room',
  basement: 'Basement', condo: 'Condo', townhouse: 'Townhouse', sublease: 'Sublease'
}

function BarChart({ data, valueKey = 'count', labelKey = 'label', displayKey, colorClass = 'bg-red-600' }) {
  const max = Math.max(...data.map(d => d[valueKey]), 1)
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map(item => (
        <div key={item[labelKey]} className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <span className="text-xs font-medium text-gray-700">{displayKey ? item[displayKey] : item[valueKey]}</span>
          <div className="w-full flex items-end" style={{ height: '120px' }}>
            <div
              className={`w-full ${colorClass} rounded-t transition-all`}
              style={{ height: `${Math.max((item[valueKey] / max) * 100, 4)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 truncate w-full text-center">{item[labelKey]}</span>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 text-center">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function AnalyticsPage() {
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fmt = (n) => `$${Number(n).toLocaleString()}`

  useEffect(() => {
    let cancelled = false
    supabase
      .from('listings')
      .select('price, city, property_type, bedrooms, created_at')
      .eq('status', 'active')
      .then(({ data, error: fetchError }) => {
        if (!cancelled) {
          if (fetchError) setError(fetchError.message)
          else setListings(data || [])
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  if (loading) return (
    <div className="max-w-5xl mx-auto px-4 py-10 animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
      </div>
      <div className="h-56 bg-gray-200 rounded-xl" />
    </div>
  )

  if (error) return (
    <div className="max-w-5xl mx-auto px-4 py-16 text-center">
      <p className="text-red-600 font-medium">Failed to load analytics data.</p>
      <p className="text-sm text-gray-400 mt-1">{error}</p>
    </div>
  )

  // Compute summary stats (memoized to avoid recalculation on re-render)
  const { prices, avgPrice, minPrice, maxPrice, byCity, byType, avgByCity, priceDistribution } = useMemo(() => {
    const prices = listings.map(l => l.price).filter(Boolean)
    const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
    const minPrice = prices.length ? Math.min(...prices) : 0
    const maxPrice = prices.length ? Math.max(...prices) : 0

    const cityMap = {}
    listings.forEach(l => { cityMap[l.city] = (cityMap[l.city] || 0) + 1 })
    const byCity = Object.entries(cityMap)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    const typeMap = {}
    listings.forEach(l => { typeMap[l.property_type] = (typeMap[l.property_type] || 0) + 1 })
    const byType = Object.entries(typeMap)
      .map(([key, count]) => ({ label: TYPE_LABELS[key] || key, count }))
      .sort((a, b) => b.count - a.count)

    const cityPriceMap = {}
    listings.forEach(l => {
      if (!l.price || !l.city) return
      if (!cityPriceMap[l.city]) cityPriceMap[l.city] = []
      cityPriceMap[l.city].push(l.price)
    })
    const avgByCity = Object.entries(cityPriceMap)
      .map(([label, arr]) => {
        const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
        return { label, count: avg, display: fmt(avg) }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    const buckets = [
      { label: '<$800', min: 0, max: 800 },
      { label: '$800\u20131k', min: 800, max: 1000 },
      { label: '$1k\u20131.2k', min: 1000, max: 1200 },
      { label: '$1.2k\u20131.5k', min: 1200, max: 1500 },
      { label: '$1.5k\u20132k', min: 1500, max: 2000 },
      { label: '>$2k', min: 2000, max: Infinity },
    ]
    const priceDistribution = buckets.map(b => ({
      label: b.label,
      count: prices.filter(p => p >= b.min && p < b.max).length,
    }))

    return { prices, avgPrice, minPrice, maxPrice, byCity, byType, avgByCity, priceDistribution }
  }, [listings])

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PEI Rental Market</h1>
        <p className="text-gray-500 text-sm mt-1">Based on {listings.length} active listings</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Listings" value={listings.length} />
        <StatCard label="Average Rent" value={fmt(avgPrice)} sub="per month" />
        <StatCard label="Lowest Rent" value={fmt(minPrice)} sub="per month" />
        <StatCard label="Highest Rent" value={fmt(maxPrice)} sub="per month" />
      </div>

      {/* Charts row */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Listings by City</h2>
          <BarChart data={byCity} valueKey="count" labelKey="label" colorClass="bg-red-600" />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Listings by Type</h2>
          <BarChart data={byType} valueKey="count" labelKey="label" colorClass="bg-red-400" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Price Distribution</h2>
          <BarChart data={priceDistribution} valueKey="count" labelKey="label" colorClass="bg-orange-500" />
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Avg Rent by City</h2>
          <BarChart data={avgByCity} valueKey="count" labelKey="label" displayKey="display" colorClass="bg-amber-500" />
        </div>
      </div>
    </div>
  )
}
