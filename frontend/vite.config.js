import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  server: {
    /**
     * Proxy /api to the local backend so development is same-origin, exactly
     * like production (where Vercel rewrites /api - see vercel.json).
     *
     * This is not a convenience. The refresh token is an httpOnly,
     * SameSite=Lax cookie; if the browser talked to http://localhost:3000
     * directly from http://localhost:5173 that cookie would be cross-site and
     * would not be sent, so sessions would work in production and mysteriously
     * fail locally. One origin in both environments removes the whole class of
     * problem.
     */
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
