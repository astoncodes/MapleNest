/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // MapleNest brand — primary CTA
        maple: {
          red: '#c41e3a',
          dark: '#a3172f',
          light: '#fde8ec',
          muted: '#f5d0d8',
        },
        // Notion shell tokens
        canvas: '#faf9f7',
        surface: '#f2f0ec',
        hairline: '#e5e3df',
        'hairline-soft': '#ede9e4',
        ink: '#1a1a1a',
        charcoal: '#37352f',
        slate: '#5d5b54',
        steel: '#787671',
        stone: '#a4a097',
        // Notion navy hero
        navy: {
          DEFAULT: '#0a1530',
          mid: '#1a2a52',
          light: '#2a3a6e',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 6px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
