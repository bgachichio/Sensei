/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sensei: {
          50: '#f0faf4',
          100: '#d9f2e4',
          200: '#b5e5cb',
          300: '#82d2aa',
          400: '#4fb884',
          500: '#237352',
          600: '#1d6147',
          700: '#194f3b',
          800: '#163f31',
          900: '#133429',
          950: '#0a1d17'
        }
      },
      fontFamily: {
        sans: ['var(--font-family)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    }
  },
  plugins: []
};
