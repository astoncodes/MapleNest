import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="min-h-[70vh] bg-canvas flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        <div className="font-serif font-light text-7xl text-stone mb-6">404</div>
        <h1 className="font-serif font-light text-3xl text-ink mb-3">Page not found</h1>
        <p className="text-sm text-steel leading-relaxed mb-8">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <div className="flex items-center justify-center gap-6">
          <Link
            to="/"
            className="text-[11px] tracking-widest uppercase bg-ink text-canvas px-6 py-3 hover:bg-maple transition-colors"
          >
            Go home
          </Link>
          <Link
            to="/listings"
            className="text-[11px] tracking-widest uppercase text-maple hover:text-maple-dark transition-colors"
          >
            Browse listings →
          </Link>
        </div>
      </div>
    </div>
  )
}
