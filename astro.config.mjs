// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Waynesville News — static site, deployed on Cloudflare (Workers static assets).
export default defineConfig({
  site: 'https://waynesville.news',
  build: {
    format: 'directory', // clean URLs: /schools/ not /schools.html
  },
  integrations: [sitemap()],
});
