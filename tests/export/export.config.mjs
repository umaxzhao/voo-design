import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/export/*.test.js'], testTimeout: 60000, hookTimeout: 60000 } });
