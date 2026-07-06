import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// La chiave interna vive nel .env della root del repo: il proxy di sviluppo la
// inietta server-side verso i backend, così non è mai esposta al browser.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '')
  const headers = { 'X-Internal-Api-Key': env.INTERNAL_API_KEY ?? '' }

  const backend = (target: string, rewrite?: (path: string) => string) => ({
    target,
    changeOrigin: true,
    headers,
    ...(rewrite ? { rewrite } : {}),
  })

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': backend('http://localhost:8001', (path) => path.replace(/^\/api/, '')),
        '/email': backend('http://localhost:8002', (path) => path.replace(/^\/email/, '')),
        '/knowledge': backend('http://localhost:8003', (path) => path.replace(/^\/knowledge/, '')),
        '/chat': backend('http://localhost:8004', (path) => path.replace(/^\/chat/, '')),
        '/tickets': backend('http://localhost:8005'),
        '/transcripts': backend('http://localhost:8001'),
        '/token': backend('http://localhost:8001'),
      },
    },
  }
})
