import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// Le site est servi depuis un sous-chemin sur GitHub Pages
// (https://<user>.github.io/fahem_c-/). Le `base` doit donc être identique en
// dev et en build : le scope du service worker et le `start_url` du manifest en
// dépendent, et une incohérence casserait l'installation en écran d'accueil.
// Surchargeable par VITE_BASE pour un domaine personnalisé ou un autre dépôt.
const base = process.env.VITE_BASE ?? '/fahem_c-/'

export default defineConfig({
  base,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    VitePWA({
      // « prompt » et non « autoUpdate » : on ne recharge jamais l'app dans le
      // dos de l'utilisateur, il pourrait être en train de saisir une dépense.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budget Personnel',
        short_name: 'Budget',
        description:
          'Suivi de budget personnel, 100 % hors ligne. Vos données restent sur votre appareil.',
        lang: 'fr',
        dir: 'ltr',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0A0B0F',
        theme_color: '#0A0B0F',
        categories: ['finance', 'productivity'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // L'app est une SPA : toute navigation retombe sur index.html, ce qui
        // la rend utilisable hors ligne quelle que soit l'URL ouverte.
        navigateFallback: `${base}index.html`,
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
} as Parameters<typeof defineConfig>[0])
