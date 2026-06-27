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
        primary: {
          DEFAULT: '#00f2fe',
          dark: '#00c3da',
        },
        secondary: {
          DEFAULT: '#7f00ff',
          dark: '#6600cc',
        },
        darkbg: {
          DEFAULT: '#0b131a',
          card: 'rgba(15, 28, 41, 0.6)',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        lightbg: {
          DEFAULT: '#f0f4f8',
          card: 'rgba(255, 255, 255, 0.7)',
          border: 'rgba(0, 0, 0, 0.06)',
        },
        appBg: 'var(--bg-app)',
        cardBg: 'var(--bg-card)',
        cardBorder: 'var(--bg-border)',
        textPrimary: 'var(--text-primary)',
        textSecondary: 'var(--text-secondary)',
        headerBg: 'var(--bg-header)',
        sidebarBg: 'var(--bg-sidebar)',
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'neon-blue': '0 0 15px rgba(0, 242, 254, 0.35)',
        'neon-purple': '0 0 15px rgba(127, 0, 254, 0.35)',
        'glass-dark': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-light': '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
      }
    },
  },
  plugins: [],
}
