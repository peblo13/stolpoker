import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: ['epirogenic-draven-affectedly.ngrok-free.dev', 'localhost', '127.0.0.1'],
    // No proxy for /socket.io — frontend connects directly to backend at 127.0.0.1:8086
  }
})