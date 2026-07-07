import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { supabaseConfigError } from './lib/supabase'
import ErrorBoundary from './components/shared/ErrorBoundary'
import ScrollToTop from './components/shared/ScrollToTop'
import Navbar from './components/shared/Navbar'
import HomePage from './pages/HomePage'

// Route-level code splitting: the landing page loads instantly; everything
// else is fetched on first navigation, keeping the initial bundle small.
const LoginPage = lazy(() => import('./pages/LoginPage'))
const SignupPage = lazy(() => import('./pages/SignupPage'))
const ListingsPage = lazy(() => import('./pages/ListingsPage'))
const ListingDetailPage = lazy(() => import('./pages/ListingDetailPage'))
const CreateListingPage = lazy(() => import('./pages/CreateListingPage'))
const EditListingPage = lazy(() => import('./pages/EditListingPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const MessagesInboxPage = lazy(() => import('./pages/MessagesInboxPage'))
const ConversationPage = lazy(() => import('./pages/ConversationPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="Loading page">
      <div className="w-8 h-8 border-2 border-hairline border-t-maple rounded-full animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <div className="min-h-screen bg-canvas">
      <ScrollToTop />
      <Navbar />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/listings/:id/edit" element={
            <ProtectedRoute><EditListingPage /></ProtectedRoute>
          } />
          <Route path="/listings/:id" element={<ListingDetailPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/create-listing" element={
            <ProtectedRoute><CreateListingPage /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><ProfilePage /></ProtectedRoute>
          } />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/messages" element={
            <ProtectedRoute><MessagesInboxPage /></ProtectedRoute>
          } />
          <Route path="/messages/:id" element={
            <ProtectedRoute><ConversationPage /></ProtectedRoute>
          } />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </div>
  )
}

function ConfigErrorScreen({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-canvas">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-4">🍁</div>
        <h1 className="text-xl font-semibold text-ink mb-2">MapleNest isn&apos;t configured</h1>
        <p className="text-steel text-sm mb-4">{message}</p>
        <p className="text-stone text-xs">
          If you&apos;re the site owner, set <code className="bg-surface px-1 rounded">VITE_SUPABASE_URL</code>
          {' '}and <code className="bg-surface px-1 rounded">VITE_SUPABASE_ANON_KEY</code> and redeploy.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (supabaseConfigError) {
    return <ConfigErrorScreen message={supabaseConfigError} />
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  )
}
