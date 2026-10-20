/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        spotlight: {
          bg: '#080605',
          surface: '#120f0d',
          card: '#181512',
          border: 'rgba(255, 235, 215, 0.08)',
          'border-active': 'rgba(240, 150, 80, 0.35)',
        },
        amber: {
          400: '#fb923c',
          500: '#f09650', // Spotlight primary amber
          600: '#d87e38',
          700: '#c2410c',
        },
        ink: {
          base: '#f5f0ea',
          soft: '#a39b94',
          muted: '#706860',
        },
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f09650',
          600: '#d87e38',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'amber-glow': '0 4px 20px -2px rgba(240, 150, 80, 0.28)',
        'amber-glow-lg': '0 8px 30px -4px rgba(240, 150, 80, 0.40)',
      }
    },
  },
  plugins: [],
};
