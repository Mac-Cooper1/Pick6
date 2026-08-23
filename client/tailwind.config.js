/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Type system: Barlow for UI text, Barlow Condensed for headlines, tab
      // labels, the draft clock and big numbers (athletic-department feel).
      // Both self-hosted via @fontsource (imported in main.tsx).
      fontFamily: {
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Barlow Condensed', 'Barlow', 'Arial Narrow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Shadows tinted to the page's green, never pure black.
      boxShadow: {
        card: '0 1px 2px rgba(20, 83, 45, 0.06), 0 4px 16px -6px rgba(20, 83, 45, 0.12)',
        'card-lg': '0 2px 4px rgba(20, 83, 45, 0.08), 0 16px 40px -12px rgba(20, 83, 45, 0.25)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        rise: 'rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
