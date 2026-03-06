/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        maple: {
          red: '#C41E3A',
          light: '#F5E6E8',
        },
        pei: {
          green: '#2D6A4F',
          sand: '#F4A261',
        }
      }
    },
  },
  plugins: [],
}
