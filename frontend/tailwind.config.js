/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0f4ff',
          100: '#dde7ff',
          500: '#4f6ef7',
          600: '#3d5ae8',
          700: '#2f48d1',
        },
        surface: {
          DEFAULT: '#1a1d2e',
          card:    '#242740',
          border:  '#353858',
        },
      },
    },
  },
  plugins: [],
}
