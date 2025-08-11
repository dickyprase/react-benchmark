import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Ganti IP di HMR ke IP guest VM kamu (lihat `ipconfig` di VM), misal 192.168.1.55
const GUEST_IP = '192.168.1.55'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // listen di 0.0.0.0 (bisa diakses dari host)
    port: 5173,
    strictPort: true,
    cors: true,
    // (Opsional tapi sering perlu di VM) pastikan HMR WebSocket connect dari host
    hmr: {
      host: GUEST_IP,
      port: 5173,
    },
    // Proxy agar di kode React cukup fetch('/api/...') tanpa CORS
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5174', // API jalan di guest VM port 5174
        changeOrigin: true,
      },
    },
  },
})
