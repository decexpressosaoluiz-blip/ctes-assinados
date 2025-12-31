import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    base: '/',
    build: {
      outDir: 'dist',
      target: 'esnext', // Fix: Allow Top-Level Await for pdfjs-dist
    },
    define: {
      // Correctly stringify the API key to be replaced during build time
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})