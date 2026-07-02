import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
          ],
          'modules-production': [
            './src/ProductionScheduler.jsx',
            './src/Remediation.jsx',
          ],
          'modules-genetics': [
            './src/PhenoHunt.jsx',
            './src/StrainDatabase.jsx',
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
