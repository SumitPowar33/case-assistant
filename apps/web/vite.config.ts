import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The built page allows only its own scripts, styles, fonts and servers (/api, /ai): text that ever slipped into a page as
// markup could not run, load from elsewhere or send case data out (security review, 2 Nov 2026). Build only: the
// development server injects inline scripts of its own. A real installation should also send it as a header.
export const CONTENT_POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:", "font-src 'self' data:",
  "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ')

const contentPolicy: Plugin = {
  name: 'content-policy',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_POLICY}" />`),
}

export default defineConfig({
  plugins: [react(), contentPolicy],
  server: {
    proxy: {
      '/api': 'http://localhost:8080', // core app
      '/ai': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/ai/, '') }, // AI gateway
    },
    fs: { allow: ['.', '../../packages/xlit'] }, // the typing engine lives outside this folder
  },
})
