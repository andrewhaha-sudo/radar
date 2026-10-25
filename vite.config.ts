import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/uploads': { target: API_TARGET, changeOrigin: false },
    },
  },
  preview: {
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/uploads': { target: API_TARGET, changeOrigin: false },
    },
  },
})
