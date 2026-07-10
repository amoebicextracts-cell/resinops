import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ResinOps — Cannabis Operations AI',
        short_name: 'ResinOps',
        description: 'Professional cannabis operations intelligence. Built by operators, for operators.',
        theme_color: '#0f1a0f',
        background_color: '#0f1a0f',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Network-first for API calls — never serve stale METRC/Claude data from cache
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/,
            handler: 'NetworkOnly',
          },
        ],
        // Don't precache anything huge; keep it to build output
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
      devOptions: {
        enabled: false, // keep PWA/service worker off during `vite dev` to avoid caching headaches while iterating
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'modules-cultivation': [
            './src/Scheduler.jsx',
            './src/GrowMap.jsx',
            './src/CloneScheduler.jsx',
            './src/HarvestBatches.jsx',
            './src/MotherPlantManager.jsx',
          ],
          'modules-production': [
            './src/ProductionScheduler.jsx',
            './src/Remediation.jsx',
          ],
          'modules-genetics': [
            './src/PhenoHunt.jsx',
            './src/StrainDatabase.jsx',
            './src/TCTracker.jsx',
          ],
          'modules-compliance': [
            './src/QCTesting.jsx',
            './src/GMPHub.jsx',
            './src/Employees.jsx',
            './src/CultivationInputs.jsx',
            './src/SprayLog.jsx',
          ],
          'modules-ops': [
            './src/Equipment.jsx',
            './src/Maintenance.jsx',
            './src/FacilityMap.jsx',
            './src/OpsAnalyst.jsx',
            './src/LaborManager.jsx',
            './src/LaborDashboard.jsx',
          ],
          'modules-finance': [
            './src/Finance.jsx',
            './src/InventoryERP.jsx',
            './src/BatchDashboard.jsx',
          ],
          'modules-platform': [
            './src/Dashboard.jsx',
            './src/FacilitySettings.jsx',
            './src/SalesOrders.jsx',
          ],
          'modules-import': [
            './src/DataManager.jsx',
          ],
        }
      }
    }
  }
})
