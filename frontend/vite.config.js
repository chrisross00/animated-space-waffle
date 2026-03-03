import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { quasar, transformAssetUrls } from '@quasar/vite-plugin'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar({ sassVariables: fileURLToPath(new URL('./src/styles/quasar.variables.sass', import.meta.url)), plugins: ['Notify', 'Dialog'] }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 8080,
    host: '0.0.0.0',
    proxy: {
      '/api':       { target: 'http://localhost:3000', changeOrigin: true },
      '/plaid-api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
