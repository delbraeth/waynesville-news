// @ts-check
import { defineConfig } from 'astro/config';

// Waynesville Daily Brief — static site, deployed on Cloudflare Pages.
export default defineConfig({
  site: 'https://waynesville.news',
  build: {
    // Emit clean directory-style URLs (/schools/ instead of /schools.html)
    format: 'directory',
  },
});
