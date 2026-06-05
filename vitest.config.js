import { defineConfig } from 'vitest/config'

// Unit test della logica pura (src/lib). Ambiente 'node' di default; i pochi
// test che toccano window/sessionStorage dichiarano `// @vitest-environment happy-dom`
// in cima al file.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    globals: true,
  },
})
