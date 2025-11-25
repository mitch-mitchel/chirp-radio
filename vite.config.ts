// https://vite.dev/config/
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ViteFaviconsPlugin } from 'vite-plugin-favicon2'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { createWebhookMiddleware } from './vite-webhook-middleware'

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    ViteFaviconsPlugin({
      logo: './public/images/chirp-logos/CHIRP-bird.svg', // or use an SVG file
      inject: true, // Injects the necessary HTML links and metadata
      outputPath: 'assets', // Optional: specify output path relative to Vite's assets directory
      favicons: {
        theme_color: '#1a1a1a', // Dark navigation bar for light mode
      },
    }),
    // Add webhook middleware
    {
      name: 'webhook-middleware',
      configureServer(server) {
        server.middlewares.use(createWebhookMiddleware())
      },
    },
  ],
  server: {
    proxy: {
      '/api': {
        target: 'https://chirpradio.appspot.com',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Disable all caching on proxied responses
            proxyRes.headers['cache-control'] = 'no-cache, no-store, must-revalidate'
            proxyRes.headers['pragma'] = 'no-cache'
            proxyRes.headers['expires'] = '0'
          })
        },
        // Don't proxy webhook endpoint
        bypass: (req) => {
          if (req.url === '/api/webhook' || req.url === '/api/webhook/events') {
            return req.url
          }
        },
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'https://chirpradio.appspot.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    // Standard tests (non-storybook)
    globals: true,
    environment: 'jsdom',
    css: true,
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'html'],
      all: true,
      exclude: ['**/stories/**', '**/*.d.ts', '**/test/setup.ts'],
    },
    projects: [
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
})
