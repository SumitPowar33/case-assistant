import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080', // core app
      '/ai': { target: 'http://localhost:8000', rewrite: (p) => p.replace(/^\/ai/, '') }, // AI gateway
    },
    fs: { allow: ['.', '../../packages/xlit'] }, // the typing engine lives outside this folder
  },
})
