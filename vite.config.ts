import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: '/',
    plugins: [vue()],
    server: {
      proxy: {
        '/api': {
          target: env.TERRATWINN_API_URL || 'http://127.0.0.1:8001',
          changeOrigin: true,
          ...(env.TERRATWINN_API_TOKEN
            ? { headers: { Authorization: `Bearer ${env.TERRATWINN_API_TOKEN}` } }
            : {}),
        },
      },
    },
  }
})
