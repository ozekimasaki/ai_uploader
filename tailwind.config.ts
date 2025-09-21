import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['web/index.html', 'web/src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;


