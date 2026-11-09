import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// `npm run coverage` fails below these numbers. Raise them when the numbers rise.
export default mergeConfig(viteConfig, defineConfig({
  test: {
    coverage: {
      provider: 'v8', include: ['src/**'], exclude: ['src/**/*.test.*', 'src/main.tsx'],
      thresholds: { statements: 99, branches: 96, functions: 96, lines: 99 },
    },
  },
}))
