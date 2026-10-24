import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // the typing engine lives in packages/xlit, outside this folder
  server: { proxy: { '/api': 'http://localhost:8080' }, fs: { allow: ['.', '../../packages/xlit'] } },
})
