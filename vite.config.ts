/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  // Capacitor serves from the root of capacitor://localhost; GitHub Pages
  // serves this repo from /Expense-Tracker/. Neither can be assumed, so the
  // PWA build passes PWA_BASE and `npm run build` stays root-relative for
  // `npx cap sync ios`. A relative './' base would satisfy assets but leaves
  // service-worker scope and manifest start_url ambiguous.
  base: process.env.PWA_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Expense Tracker',
        short_name: 'Expenses',
        description: 'Local-first personal expense ledger',
        // Matches the light --bg token so the launch splash and status bar
        // never flash white before the app paints.
        theme_color: '#EBEBE0',
        background_color: '#EBEBE0',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // woff2 is load-bearing: the fonts ship in the bundle and the app must
        // render identically offline, so they are precached rather than
        // cached lazily on first paint.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    // Honour an assigned PORT so parallel tool sessions can each run a dev
    // server; defaults to Vite's usual 5173 otherwise.
    port: Number(process.env.PORT) || 5173,
  },
  define: {
    // Shown in Settings → About; package.json is the single source of truth.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
