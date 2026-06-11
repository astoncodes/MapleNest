/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // MapleNest cream design system
        maple: {
          // Terracotta accent — warm, earthy, premium
          DEFAULT: '#C4836A',
          dark:    '#A8674F',
          light:   '#F0DDD6',
          muted:   '#E8CBBF',
        },
        // Cream base palette
        canvas:          '#FAF8F5',   // main background
        surface:         '#F0EAD6',   // cards / sections
        hairline:        '#E8E0D5',   // borders / dividers
        'hairline-soft': '#EDE7DE',   // softer border
        // Text hierarchy
        ink:     '#1A1410',   // headings — warm near-black
        charcoal:'#3D2B1F',   // body text
        slate:   '#5A4E47',   // secondary text
        steel:   '#7A6E65',   // muted text
        stone:   '#C2B9AC',   // placeholders / captions
      },
      fontFamily: {
        sans: [
          '"DM Sans"',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        serif: [
          '"Cormorant Garamond"',
          'Georgia',
          'serif',
        ],
      },
      boxShadow: {
        card:       '0 1px 3px rgba(26,20,16,0.06), 0 1px 2px rgba(26,20,16,0.04)',
        'card-hover':'0 8px 24px rgba(26,20,16,0.10), 0 2px 6px rgba(26,20,16,0.06)',
      },
      letterSpacing: {
        widest2: '0.2em',
        widest3: '0.25em',
      },
    },
  },
  plugins: [],
}
