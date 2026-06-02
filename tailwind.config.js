/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        spaza: {
          red:      '#E3001B',
          'red-dark': '#B5001A',
          'red-light': '#FF1A35',
          navy:     '#0A1628',
          'navy-mid': '#12243A',
          slate:    '#1E3A5F',
          gold:     '#F5A623',
          'gold-light': '#FFB83F',
          green:    '#00A651',
        },
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'sans-serif'],
        body:    ['var(--font-dm-sans)', 'sans-serif'],
        mono:    ['var(--font-dm-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}
