/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0a0f',
          800: '#12121a',
          700: '#1a1a25',
          600: '#252530',
        },
        accent: '#f59e0b',
        gain: '#22c55e',
        loss: '#ef4444',
      },
    },
  },
  plugins: [],
}
