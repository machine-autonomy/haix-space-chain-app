import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/v1': {
          target: 'http://localhost:1234',
          changeOrigin: true,
          secure: false,
        },
        '/openai': {
          target: env.VITE_AZURE_OPENAI_ENDPOINT,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
