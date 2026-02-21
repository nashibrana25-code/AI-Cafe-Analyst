/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#f7f8fa',
          800: '#ffffff',
          700: '#edf0f5',
          600: '#dde3ed',
        },
        accent: '#13B5EA',
        gain: '#1dab57',
        loss: '#d94a4a',
        xero: {
          blue: '#13B5EA',
          dark: '#1B2A4A',
          navy: '#233658',
          teal: '#0CAADC',
        },
      },
    },
  },
  plugins: [],
}
