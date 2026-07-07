import { Component } from 'react'

// Class component is required — React error boundaries have no hook equivalent.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Central hook point for an error-reporting service (e.g. Sentry):
    // report(error, info.componentStack)
    console.error('Unhandled render error:', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
    window.location.assign('/')
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-canvas">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4">🍁</div>
          <h1 className="text-xl font-semibold text-ink mb-2">Something went wrong</h1>
          <p className="text-steel text-sm mb-6">
            An unexpected error occurred. Your data is safe — try reloading, or head back home.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="text-[11px] tracking-widest uppercase bg-ink text-canvas px-5 py-2.5 hover:bg-maple transition-colors"
            >
              Reload
            </button>
            <button
              onClick={this.handleReset}
              className="text-[11px] tracking-widest uppercase border border-hairline text-steel px-5 py-2.5 hover:text-maple hover:border-maple transition-colors"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    )
  }
}
