/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gh: {
          canvas:  'rgb(var(--gh-canvas)  / <alpha-value>)',
          surface: 'rgb(var(--gh-surface) / <alpha-value>)',
          sidebar: 'var(--sidebar)',
          s2:      'rgb(var(--gh-s2)      / <alpha-value>)',
          s3:      'rgb(var(--gh-s3)      / <alpha-value>)',
          border:  'rgb(var(--gh-border)  / <alpha-value>)',
          border2: 'rgb(var(--gh-border2) / <alpha-value>)',
          text:    'rgb(var(--gh-text)    / <alpha-value>)',
          t2:      'rgb(var(--gh-t2)      / <alpha-value>)',
          t3:      'rgb(var(--gh-t3)      / <alpha-value>)',
          blue:    'rgb(var(--gh-blue)    / <alpha-value>)',
          blue2:   'rgb(var(--gh-blue2)   / <alpha-value>)',
          blue3:   'rgb(var(--gh-blue3)   / <alpha-value>)',
          green:   'rgb(var(--gh-green)   / <alpha-value>)',
          red:     'rgb(var(--gh-red)     / <alpha-value>)',
          amber:   'rgb(var(--gh-amber)   / <alpha-value>)',
          amber2:  'rgb(var(--gh-amber2)  / <alpha-value>)',
        },
      },
      fontFamily: {
        sans:    ['"Geist"', 'system-ui', '-apple-system', 'sans-serif'],
        mono:    ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['"Instrument Serif"', 'Georgia', 'serif'],
      },
      animation: {
        'spin-slow':  'spin 1.5s linear infinite',
        'pulse-dot':  'pulseDot 2.5s ease-in-out infinite',
        'page-enter': 'pageEnter 0.26s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'count-up':   'countUp 0.5s ease-out forwards',
        'toast-in':   'toastIn 0.25s ease-out forwards',
        'toast-out':  'toastOut 0.2s ease-in forwards',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(52,211,153,0.35)' },
          '50%':      { opacity: '0.8', boxShadow: '0 0 0 5px rgba(52,211,153,0)' },
        },
        pageEnter: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        countUp: {
          from: { opacity: '0', transform: 'translateY(5px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        toastIn: {
          from: { opacity: '0', transform: 'translateX(110%)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        toastOut: {
          from: { opacity: '1', transform: 'translateX(0)' },
          to:   { opacity: '0', transform: 'translateX(110%)' },
        },
      },
    },
  },
  plugins: [],
}
