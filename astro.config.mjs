import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://dictionarultau.ro',
  trailingSlash: 'always',
  build: {
    format: 'directory'
  },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()]
  }
});
