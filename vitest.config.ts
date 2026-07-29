import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@formfill/form-model': pkg('form-model'),
      '@formfill/conversation': pkg('conversation'),
      '@formfill/redact': pkg('redact'),
      '@formfill/validate': pkg('validate'),
      '@formfill/speech': pkg('speech'),
      '@formfill/fixtures': pkg('fixtures'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
    environment: 'node',
  },
});
