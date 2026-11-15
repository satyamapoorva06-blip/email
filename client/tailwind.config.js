import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [path.join(dir, 'index.html'), path.join(dir, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#EEF0FE', 100: '#E0E3FD', 200: '#C5CBFB', 300: '#A5ABF6',
          400: '#8285EE', 500: '#6366F1', 600: '#4F46E5', 700: '#4338CA',
          800: '#3730A3', 900: '#312E81',
        },
        app: '#FAFAFB',       // application background
        hairline: '#E8E8EC',  // consistent subtle border
        ink: { DEFAULT: '#1C1C21', secondary: '#55555F', muted: '#8B8B95' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,16,20,0.05)',
        lift: '0 4px 16px rgba(16,16,20,0.08), 0 1px 3px rgba(16,16,20,0.06)',
        pop: '0 12px 40px rgba(16,16,20,0.14), 0 2px 6px rgba(16,16,20,0.08)',
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem' },
    },
  },
  plugins: [],
};
