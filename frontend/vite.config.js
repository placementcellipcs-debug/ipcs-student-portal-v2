import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_')
  if (mode === 'native' && !env.VITE_API_URL) {
    throw new Error('Set VITE_API_URL in .env.native.local before creating an installed app.')
  }
  return {
    plugins: [react()],
  }
})
