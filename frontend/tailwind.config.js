/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4fe',
          100: '#dee8fc',
          200: '#c3d5fa',
          300: '#99baf6',
          400: '#6795f0',
          500: '#3b71e8',
          600: '#2554dc',
          700: '#1d41c8',
          800: '#1d36a2',
          900: '#0f172a', // Deep Navy base
          950: '#090d16',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
