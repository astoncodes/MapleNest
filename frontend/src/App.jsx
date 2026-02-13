import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-3xl font-bold text-maple-600">
            🍁 MapleNest
          </h1>
          <p className="text-gray-600 mt-1">
            Find affordable housing across Canada
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="card text-center">
          <h2 className="text-2xl font-bold mb-4">Welcome to MapleNest!</h2>
          <p className="text-gray-600 mb-6">
            Your setup is working! React + Vite + Tailwind CSS.
          </p>
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4">
              <button 
                onClick={() => setCount(count - 1)}
                className="btn-secondary"
              >
                -
              </button>
              <div className="text-4xl font-bold text-maple-600 min-w-[100px]">
                {count}
              </div>
              <button 
                onClick={() => setCount(count + 1)}
                className="btn-primary"
              >
                +
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Click the buttons to test React state
            </p>
          </div>
          
          <div className="mt-8 pt-8 border-t border-gray-200">
            <h3 className="font-semibold text-lg mb-2">✅ Setup Complete!</h3>
            <p className="text-gray-600">
              React + Vite + Tailwind CSS are all working correctly.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
