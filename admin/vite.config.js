import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { quasar, transformAssetUrls } from '@quasar/vite-plugin';

export default defineConfig({
  plugins: [
    vue({ template: { transformAssetUrls } }),
    quasar(),
  ],
  server: {
    port: 8081,
    host: '0.0.0.0',
    proxy: {
      '/admin': 'http://localhost:3000',
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/plaid-api': 'http://localhost:3000',
    },
  },
});
