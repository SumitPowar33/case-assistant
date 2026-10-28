import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// `npm run coverage` fails below these numbers. Raise them when the numbers rise.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    coverage: {
      provider: 'v8', include: ['src/**'], exclude: ['src/**/*.test.*', 'src/main.tsx'],
      thresholds: { statements: 95, branches: 80, functions: 88, lines: 95 },
    },
  },
}))
