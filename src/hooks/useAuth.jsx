import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'landlord' || normalized === 'admin' ? normalized : 'renter'
}

const enrichUser = async (sessionUser) => {
  if (!sessionUser) return null

  const metadataRole = normalizeRole(sessionUser.user_metadata?.role)

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, phone, avatar_url, bio, email_verified, phone_verified, id_verified')
      .eq('id', sessionUser.id)
      .maybeSingle()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    if (!profile) {
      const role = metadataRole
      await supabase.from('profiles').insert({
        id: sessionUser.id,
        email: sessionUser.email,
        role,
        full_name: sessionUser.user_metadata?.full_name || null,
      })

      return {
        ...sessionUser,
        profile: {
          id: sessionUser.id,
          email: sessionUser.email,
          role,
        },
        role,
        userRole: role,
      }
    }

    const persistedRole = normalizeRole(profile.role)
    const metadataRole = normalizeRole(sessionUser.user_metadata?.role)
    const role = profile.role === 'admin' ? 'admin' : (metadataRole === 'landlord' ? 'landlord' : persistedRole)

    if (profile.role !== role && profile.role !== 'admin') {
      await supabase
        .from('profiles')
        .update({ role })
        .eq('id', sessionUser.id)
    }

    return {
      ...sessionUser,
      profile,
      role,
      userRole: role,
    }
  } catch (_err) {
    return {
      ...sessionUser,
      profile: null,
      role: metadataRole,
      userRole: metadataRole,
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = async (sessionUser) => {
    const enriched = await enrichUser(sessionUser)
    setUser(enriched)
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)

    supabase.auth.getSession().then(({ data: { session } }) => {
      refreshUser(session?.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      refreshUser(session?.user)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async (email, password, role = 'renter') => {
    return supabase.auth.signUp({
      email,
      password,
      options: {
        data: { role: normalizeRole(role) },
      },
    })
  }

  const signIn = async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password })
  }

  const signOut = async () => {
    return supabase.auth.signOut()
  }

  const isLandlord = user?.role === 'landlord'
  const role = user?.role || 'renter'

  return (
    <AuthContext.Provider value={{ user, loading, role, isLandlord, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
