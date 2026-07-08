import { defineConfig } from 'vitest/config'

// Only tests/unit — the Playwright specs in tests/*.spec.ts are not vitest's.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
})
