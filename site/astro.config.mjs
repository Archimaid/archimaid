import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://archimaid.org',
  trailingSlash: 'ignore',
  integrations: [sitemap()],
});
